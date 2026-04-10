import { Elysia, t } from "elysia";
import { logger } from "../config/logger";
import {
  authSuccessSchema,
  googleCallbackQuerySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  registerBodySchema,
} from "../schemas/auth.schema";
import type { IAuthService } from "../services/auth.service";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
const loginRateBuckets = new Map<string, { count: number; resetAt: number }>();

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
          set.status = 201;
          return result;
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
          return result;
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
      async ({ body, set }) => {
        try {
          return await authService.refresh(body.refreshToken);
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
      async ({ body, set }) => {
        try {
          await authService.revoke(body.refreshToken);
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
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Google oauth failed";
          logger.error("auth.google.callback.failed", { message, error });
          set.status = 401;
          return { message };
        }
      },
      {
        query: googleCallbackQuerySchema,
        response: {
          200: authSuccessSchema,
          401: t.Object({ message: t.String() }),
        },
      },
    );
