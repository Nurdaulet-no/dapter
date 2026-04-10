export interface JwtAccessPayload {
  sub: string;
  email: string;
  type: "access";
}

export interface JwtRefreshPayload {
  sub: string;
  sessionId: string;
  type: "refresh";
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUserView {
  id: string;
  email: string;
}

