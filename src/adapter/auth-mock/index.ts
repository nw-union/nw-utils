import { Result } from "@praha/byethrow";
import { AuthError } from "../../error.js";
import type { Auth, User } from "../../interface.js";
import { getTokenFromCookie, getTokenFromHeader } from "../util.js";

const AUTH_HEADER_KEY = "Mock-Access-Assertion";
const AUTH_COOKIE_KEY = "Mock_Authorization";

export const newAuthMock = (): Auth => ({
  auth: async (req: Request) =>
    Result.pipe(getToken(req), Result.map(tokenToUser)),
});

const getToken = (req: Request): Result.Result<string, AuthError> =>
  Result.pipe(
    getTokenFromHeader(req, AUTH_HEADER_KEY),
    Result.orElse(() => getTokenFromCookie(req, AUTH_COOKIE_KEY)),
  );

const tokenToUser = (mail: string): User => ({
  id: "mock-user-id",
  mail,
});
