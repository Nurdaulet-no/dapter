import { Elysia, t } from "elysia";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  authSuccessSchema,
  googleCallbackQuerySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  registerBodySchema,
  updateNicknameBodySchema,
} from "../schemas/auth.schema";
import type { IAuthService } from "../services/auth.service";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
const loginRateBuckets = new Map<string, { count: number; resetAt: number }>();
const ACCESS_COOKIE = "dapter_access_token";
const REFRESH_COOKIE = "dapter_refresh_token";
const IS_PROD = Bun.env.NODE_ENV === "production";
const COOKIE_COMMON = `Path=/; HttpOnly; SameSite=Lax${IS_PROD ? "; Secure" : ""}`;
const ACCESS_COOKIE_MAX_AGE = 15 * 60;
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const checkLoginRateLimit = (key: string): boolean => {
  const now = Date.now();
  const current = loginRateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    loginRateBuckets.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= LOGIN_LIMIT) {
    return false;
  }
  current.count += 1;
  loginRateBuckets.set(key, current);
  return true;
};

const readCookie = (cookieHeader: string | null, name: string): string | null => {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
};

const appendSetCookie = (
  set: { headers: Record<string, string | number | string[]> },
  cookieValue: string,
): void => {
  const current = set.headers["set-cookie"];
  if (!current) {
    set.headers["set-cookie"] = [cookieValue];
    return;
  }
  if (typeof current === "number") {
    set.headers["set-cookie"] = [String(current), cookieValue];
    return;
  }
  if (Array.isArray(current)) {
    set.headers["set-cookie"] = [...current.map((value) => String(value)), cookieValue];
    return;
  }
  set.headers["set-cookie"] = [String(current), cookieValue];
};

const setAuthCookies = (
  set: { headers: Record<string, string | number | string[]> },
  accessToken: string,
  refreshToken: string,
): void => {
  appendSetCookie(
    set,
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; Max-Age=${ACCESS_COOKIE_MAX_AGE}; ${COOKIE_COMMON}`,
  );
  appendSetCookie(
    set,
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Max-Age=${REFRESH_COOKIE_MAX_AGE}; ${COOKIE_COMMON}`,
  );
};

const clearAuthCookies = (set: { headers: Record<string, string | number | string[]> }): void => {
  appendSetCookie(set, `${ACCESS_COOKIE}=; Max-Age=0; ${COOKIE_COMMON}`);
  appendSetCookie(set, `${REFRESH_COOKIE}=; Max-Age=0; ${COOKIE_COMMON}`);
};

export const createAuthController = (authService: IAuthService) =>
  new Elysia({ prefix: "/auth" })
    .post(
      "/register",
      async ({ body, set, request }) => {
        try {
          const ip =
            request.headers.get("x-forwarded-for") ??
            request.headers.get("x-real-ip") ??
            "unknown";
          if (!checkLoginRateLimit(`register:${ip}`)) {
            set.status = 429;
            return { message: "Too many requests. Please retry later." };
          }
          const result = await authService.register({
            email: body.email.toLowerCase().trim(),
            password: body.password,
          });
          setAuthCookies(set, result.tokens.accessToken, result.tokens.refreshToken);
          set.status = 201;
          return {
            user: result.user,
            authenticated: true,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Registration failed";
          logger.error("auth.register.failed", { message, error });
          set.status = message === "Email is already registered" ? 409 : 400;
          return { message };
        }
      },
      {
        body: registerBodySchema,
        response: {
          201: authSuccessSchema,
          400: t.Object({ message: t.String() }),
          409: t.Object({ message: t.String() }),
          429: t.Object({ message: t.String() }),
        },
      },
    )
    .post(
      "/login",
      async ({ body, set, request }) => {
        try {
          const ip =
            request.headers.get("x-forwarded-for") ??
            request.headers.get("x-real-ip") ??
            "unknown";
          if (!checkLoginRateLimit(`login:${ip}`)) {
            set.status = 429;
            return { message: "Too many requests. Please retry later." };
          }
          const result = await authService.login({
            email: body.email.toLowerCase().trim(),
            password: body.password,
          });
          setAuthCookies(set, result.tokens.accessToken, result.tokens.refreshToken);
          return {
            user: result.user,
            authenticated: true,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Login failed";
          logger.error("auth.login.failed", { message, error });
          set.status = 401;
          return { message: "Invalid credentials" };
        }
      },
      {
        body: loginBodySchema,
        response: {
          200: authSuccessSchema,
          401: t.Object({ message: t.String() }),
          429: t.Object({ message: t.String() }),
        },
      },
    )
    .post(
      "/refresh",
      async ({ body, set, request }) => {
        try {
          const refreshToken =
            body?.refreshToken ?? readCookie(request.headers.get("cookie"), REFRESH_COOKIE);
          if (!refreshToken) {
            set.status = 401;
            return { message: "Invalid refresh token" };
          }
          const result = await authService.refresh(refreshToken);
          setAuthCookies(set, result.tokens.accessToken, result.tokens.refreshToken);
          return {
            user: result.user,
            authenticated: true,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Refresh failed";
          logger.error("auth.refresh.failed", { message, error });
          set.status = 401;
          return { message };
        }
      },
      {
        body: refreshBodySchema,
        response: {
          200: authSuccessSchema,
          401: t.Object({ message: t.String() }),
        },
      },
    )
    .post(
      "/logout",
      async ({ body, set, request }) => {
        try {
          const refreshToken =
            body?.refreshToken ?? readCookie(request.headers.get("cookie"), REFRESH_COOKIE);
          if (refreshToken) {
            await authService.revoke(refreshToken);
          }
          clearAuthCookies(set);
          return { success: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Logout failed";
          logger.error("auth.logout.failed", { message, error });
          set.status = 400;
          return { message };
        }
      },
      {
        body: logoutBodySchema,
        response: {
          200: t.Object({ success: t.Boolean() }),
          400: t.Object({ message: t.String() }),
        },
      },
    )
    .get(
      "/me",
      async ({ set, request }) => {
        try {
          const accessToken = readCookie(request.headers.get("cookie"), ACCESS_COOKIE);
          if (!accessToken) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          const user = await authService.verifyAccessToken(accessToken);
          return { user, authenticated: true };
        } catch {
          set.status = 401;
          return { message: "Unauthorized" };
        }
      },
      {
        response: {
          200: authSuccessSchema,
          401: t.Object({ message: t.String() }),
        },
      },
    )
    .patch(
      "/me/nickname",
      async ({ body, set, request }) => {
        try {
          const accessToken = readCookie(request.headers.get("cookie"), ACCESS_COOKIE);
          if (!accessToken) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          const currentUser = await authService.verifyAccessToken(accessToken);
          const updatedUser = await authService.updateNickname({
            userId: currentUser.id,
            nickname: body.nickname,
          });
          return { user: updatedUser, authenticated: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Update nickname failed";
          if (message === "Unauthorized") {
            set.status = 401;
            return { message };
          }
          set.status = message === "Nickname is already taken" ? 409 : 400;
          return { message };
        }
      },
      {
        body: updateNicknameBodySchema,
        response: {
          200: authSuccessSchema,
          400: t.Object({ message: t.String() }),
          401: t.Object({ message: t.String() }),
          409: t.Object({ message: t.String() }),
        },
      },
    )
    .get(
      "/google",
      async ({ set }) => {
        const url = await authService.getGoogleAuthUrl();
        set.status = 302;
        set.headers["location"] = url;
        return;
      },
      {
        response: {
          302: t.Void(),
        },
      },
    )
    .get(
      "/google/callback",
      async ({ query, set }) => {
        try {
          const result = await authService.loginWithGoogleCode({
            code: query.code,
            state: query.state,
          });
          setAuthCookies(set, result.tokens.accessToken, result.tokens.refreshToken);
          const redirectUrl = new URL(`/u/${result.user.nickname}`, env.frontendBaseUrl);
          set.status = 302;
          set.headers["location"] = redirectUrl.toString();
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Google oauth failed";
          logger.error("auth.google.callback.failed", { message, error });
          const redirectUrl = new URL("/login", env.frontendBaseUrl);
          redirectUrl.searchParams.set("error", "google_oauth_failed");
          set.status = 302;
          set.headers["location"] = redirectUrl.toString();
          return;
        }
      },
      {
        query: googleCallbackQuerySchema,
        response: {
          302: t.Void(),
        },
      },
    );
