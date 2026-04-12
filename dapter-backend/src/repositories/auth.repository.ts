import type { PrismaClient, Session, User } from "@prisma/client";

export interface IAuthRepository {
  createUserWithPassword(input: {
    email: string;
    passwordHash: string;
    nickname: string;
  }): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  findUserByGoogleId(googleId: string): Promise<User | null>;
  findUserByEmailOrGoogleId(email: string, googleId: string): Promise<User | null>;
  upsertGoogleUser(input: { email: string; googleId: string; nickname: string }): Promise<User>;
  isNicknameTaken(nickname: string): Promise<boolean>;
  updateUserNickname(userId: string, nickname: string): Promise<User>;
  createSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<Session>;
  findSessionById(id: string): Promise<Session | null>;
  updateSessionToken(input: {
    sessionId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export class AuthRepository implements IAuthRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public createUserWithPassword(input: {
    email: string;
    passwordHash: string;
    nickname: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        nickname: input.nickname,
        passwordHash: input.passwordHash,
      },
    });
  }

  public findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  public findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  public findUserByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  public findUserByEmailOrGoogleId(email: string, googleId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { googleId }],
      },
    });
  }

  public async upsertGoogleUser(input: { email: string; googleId: string; nickname: string }): Promise<User> {
    const existing = await this.findUserByEmailOrGoogleId(input.email, input.googleId);
    if (!existing) {
      return this.prisma.user.create({
        data: {
          email: input.email,
          nickname: input.nickname,
          googleId: input.googleId,
        },
      });
    }

    if (!existing.googleId) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { googleId: input.googleId },
      });
    }

    return existing;
  }

  public createSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<Session> {
    return this.prisma.session.create({
      data: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  public findSessionById(id: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id } });
  }

  public async updateSessionToken(input: {
    sessionId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.session.update({
      where: { id: input.sessionId },
      data: {
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        refreshTokenVersion: {
          increment: 1,
        },
      },
    });
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.session.delete({
      where: { id: sessionId },
    });
  }

  public async isNicknameTaken(nickname: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { nickname },
      select: { id: true },
    });
    return Boolean(user);
  }

  public updateUserNickname(userId: string, nickname: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { nickname },
    });
  }
}
