import { t } from "elysia";

export const authUserSchema = t.Object({
  id: t.String(),
  email: t.String(),
});

export const authTokensSchema = t.Object({
  accessToken: t.String(),
  refreshToken: t.String(),
});

export const authSuccessSchema = t.Object({
  user: authUserSchema,
  tokens: authTokensSchema,
});

export const registerBodySchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8, maxLength: 128 }),
});

export const loginBodySchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8, maxLength: 128 }),
});

export const refreshBodySchema = t.Object({
  refreshToken: t.String({ minLength: 10 }),
});

export const googleCallbackQuerySchema = t.Object({
  code: t.String({ minLength: 10 }),
  state: t.String({ minLength: 10 }),
});

export const logoutBodySchema = t.Object({
  refreshToken: t.String({ minLength: 10 }),
});

