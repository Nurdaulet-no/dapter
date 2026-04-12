import { createHash, randomBytes } from "node:crypto";
import { Google } from "arctic";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { IAuthRepository } from "../repositories/auth.repository";
import type { AuthTokens, AuthUserView, JwtAccessPayload, JwtRefreshPayload } from "../types/auth";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface IAuthService {
  register(input: { email: string; password: string }): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  login(input: { email: string; password: string }): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  refresh(refreshToken: string): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  revoke(refreshToken: string): Promise<void>;
  getGoogleAuthUrl(): Promise<string>;
  consumeGoogleState(state: string): Promise<boolean>;
  loginWithGoogleCode(input: {
    code: string;
    state: string;
  }): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  updateNickname(input: { userId: string; nickname: string }): Promise<AuthUserView>;
  verifyAccessToken(token: string): Promise<AuthUserView>;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
}

export class AuthService implements IAuthService {
  private readonly googleClient = new Google(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri,
  );

  private readonly stateStore = new Map<string, number>();
  private readonly codeVerifierStore = new Map<string, string>();

  public constructor(private readonly repository: IAuthRepository) {}

  public async register(input: {
    email: string;
    password: string;
  }): Promise<{ user: AuthUserView; tokens: AuthTokens }> {
    const existing = await this.repository.findUserByEmail(input.email);
    if (existing) {
      throw new Error("Email is already registered");
    }

    const nickname = await this.generateUniqueNickname();
    const passwordHash = await bcrypt.hash(input.password, 12);
    const created = await this.repository.createUserWithPassword({
      email: input.email,
      passwordHash,
      nickname,
    });

    const tokens = await this.issueTokens(created.id, created.email);
    return {
      user: {
        id: created.id,
        email: created.email,
        nickname: created.nickname,
      },
      tokens,
    };
  }

  public async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: AuthUserView; tokens: AuthTokens }> {
    const user = await this.repository.findUserByEmail(input.email);
    if (!user?.passwordHash) {
      throw new Error("Invalid credentials");
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      throw new Error("Invalid credentials");
    }

    const tokens = await this.issueTokens(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
      },
      tokens,
    };
  }

  public async refresh(
    refreshToken: string,
  ): Promise<{ user: AuthUserView; tokens: AuthTokens }> {
    const payload = this.verifyRefreshToken(refreshToken);
    const session = await this.repository.findSessionById(payload.sessionId);
    if (!session) {
      throw new Error("Invalid refresh token");
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.repository.deleteSession(session.id);
      throw new Error("Refresh token expired");
    }
    if (session.refreshTokenHash !== this.hashToken(refreshToken)) {
      await this.repository.deleteSession(session.id);
      throw new Error("Refresh token revoked");
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user) {
      await this.repository.deleteSession(session.id);
      throw new Error("User not found");
    }

    const rotated = await this.rotateTokens(session.id, user.id, user.email);
    return {
      user: { id: user.id, email: user.email, nickname: user.nickname },
      tokens: rotated,
    };
  }

  public async revoke(refreshToken: string): Promise<void> {
    const payload = this.verifyRefreshToken(refreshToken);
    const session = await this.repository.findSessionById(payload.sessionId);
    if (!session) {
      return;
    }
    await this.repository.deleteSession(session.id);
  }

  public async verifyAccessToken(token: string): Promise<AuthUserView> {
    let payload: JwtAccessPayload;
    try {
      payload = jwt.verify(token, env.jwtSecret) as JwtAccessPayload;
    } catch {
      throw new Error("Unauthorized");
    }

    if (payload.type !== "access" || typeof payload.sub !== "string") {
      throw new Error("Unauthorized");
    }

    const user = await this.repository.findUserById(payload.sub);
    if (!user) {
      throw new Error("Unauthorized");
    }

    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
    };
  }

  public async updateNickname(input: { userId: string; nickname: string }): Promise<AuthUserView> {
    const normalized = input.nickname.trim().toLowerCase();
    if (!/^[a-z0-9]{1,7}$/.test(normalized)) {
      throw new Error("Nickname must be 1-7 lowercase letters or numbers");
    }

    const existing = await this.repository.findUserById(input.userId);
    if (!existing) {
      throw new Error("Unauthorized");
    }
    if (existing.nickname === normalized) {
      return { id: existing.id, email: existing.email, nickname: existing.nickname };
    }

    const isTaken = await this.repository.isNicknameTaken(normalized);
    if (isTaken) {
      throw new Error("Nickname is already taken");
    }

    const updated = await this.repository.updateUserNickname(input.userId, normalized);
    return { id: updated.id, email: updated.email, nickname: updated.nickname };
  }

  public async getGoogleAuthUrl(): Promise<string> {
    const state = randomBytes(24).toString("hex");
    const codeVerifier = randomBytes(48).toString("base64url");
    this.stateStore.set(state, Date.now() + 10 * 60 * 1000);
    this.codeVerifierStore.set(state, codeVerifier);
    return this.googleClient
      .createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"])
      .toString();
  }

  public async consumeGoogleState(state: string): Promise<boolean> {
    const expiresAt = this.stateStore.get(state);
    if (!expiresAt) {
      return false;
    }
    this.stateStore.delete(state);
    return expiresAt >= Date.now();
  }

  public async loginWithGoogleCode(input: {
    code: string;
    state: string;
  }): Promise<{ user: AuthUserView; tokens: AuthTokens }> {
    const isStateValid = await this.consumeGoogleState(input.state);
    if (!isStateValid) {
      throw new Error("Invalid oauth state");
    }

    const codeVerifier = this.codeVerifierStore.get(input.state);
    this.codeVerifierStore.delete(input.state);
    if (!codeVerifier) {
      throw new Error("Invalid oauth verifier");
    }

    const tokens = await this.googleClient.validateAuthorizationCode(input.code, codeVerifier);
    const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    });

    if (!userInfoResponse.ok) {
      throw new Error("Failed to fetch Google user info");
    }

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
    if (!userInfo.email || !userInfo.sub || !userInfo.email_verified) {
      throw new Error("Google account email is not verified");
    }

    const user = await this.repository.upsertGoogleUser({
      email: userInfo.email.toLowerCase(),
      googleId: userInfo.sub,
      nickname: await this.generateUniqueNickname(),
    });

    const authTokens = await this.issueTokens(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
      },
      tokens: authTokens,
    };
  }

  private async issueTokens(userId: string, email: string): Promise<AuthTokens> {
    const session = await this.repository.createSession({
      userId,
      refreshTokenHash: "",
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    const accessToken = jwt.sign(
      {
        sub: userId,
        email,
        type: "access",
      } satisfies JwtAccessPayload,
      env.jwtSecret,
      {
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    const refreshToken = jwt.sign(
      {
        sub: userId,
        sessionId: session.id,
        type: "refresh",
      } satisfies JwtRefreshPayload,
      env.jwtRefreshSecret,
      {
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );

    await this.repository.updateSessionToken({
      sessionId: session.id,
      refreshTokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return { accessToken, refreshToken };
  }

  private async rotateTokens(sessionId: string, userId: string, email: string): Promise<AuthTokens> {
    const accessToken = jwt.sign(
      {
        sub: userId,
        email,
        type: "access",
      } satisfies JwtAccessPayload,
      env.jwtSecret,
      {
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    const refreshToken = jwt.sign(
      {
        sub: userId,
        sessionId,
        type: "refresh",
      } satisfies JwtRefreshPayload,
      env.jwtRefreshSecret,
      {
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );

    await this.repository.updateSessionToken({
      sessionId,
      refreshTokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return { accessToken, refreshToken };
  }

  private verifyRefreshToken(token: string): JwtRefreshPayload {
    let payload: JwtRefreshPayload;
    try {
      payload = jwt.verify(token, env.jwtRefreshSecret) as JwtRefreshPayload;
    } catch {
      throw new Error("Invalid refresh token");
    }
    if (payload.type !== "refresh" || typeof payload.sessionId !== "string") {
      throw new Error("Invalid refresh token");
    }
    return payload;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async generateUniqueNickname(): Promise<string> {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < 100; i += 1) {
      let nickname = "";
      for (let j = 0; j < 7; j += 1) {
        nickname += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const taken = await this.repository.isNicknameTaken(nickname);
      if (!taken) {
        return nickname;
      }
    }
    throw new Error("Failed to generate nickname");
  }
}
