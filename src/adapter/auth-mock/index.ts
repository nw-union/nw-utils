import { AuthError } from "../../error.js";
import type { Auth, User } from "../../interface.js";
import { Result } from "../../lib/result/index.js";
import { getTokenFromCookie, getTokenFromHeader } from "../util.js";

const AUTH_HEADER_KEY = "Mock-Access-Assertion";
const AUTH_COOKIE_KEY = "Mock_Authorization";

export const newAuthMock = (): Auth => ({
  auth: async (req: Request) => Result.map(getToken(req), tokenToUser),
});

const getToken = (req: Request): Result.Result<string, AuthError> =>
  Result.orElse(getTokenFromHeader(req, AUTH_HEADER_KEY), () =>
    getTokenFromCookie(req, AUTH_COOKIE_KEY),
  );

const tokenToUser = (mail: string): User => ({
  id: "mock-user-id",
  mail,
});
