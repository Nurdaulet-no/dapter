import { t } from "elysia";

export const authUserSchema = t.Object({
  id: t.String(),
  email: t.String(),
  nickname: t.String({ minLength: 1, maxLength: 7, pattern: "^[a-z0-9]+$" }),
});

export const authTokensSchema = t.Object({
  accessToken: t.String(),
  refreshToken: t.String(),
});

export const authSuccessSchema = t.Object({
  user: authUserSchema,
  authenticated: t.Boolean(),
});

export const registerBodySchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8, maxLength: 128 }),
});

export const loginBodySchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8, maxLength: 128 }),
});

export const refreshBodySchema = t.Optional(
  t.Object({
    refreshToken: t.Optional(t.String({ minLength: 10 })),
  }),
);

export const googleCallbackQuerySchema = t.Object({
  code: t.String({ minLength: 10 }),
  state: t.String({ minLength: 10 }),
});

export const logoutBodySchema = t.Optional(
  t.Object({
    refreshToken: t.Optional(t.String({ minLength: 10 })),
  }),
);

export const updateNicknameBodySchema = t.Object({
  nickname: t.String({ minLength: 1, maxLength: 7, pattern: "^[a-zA-Z0-9]+$" }),
});
