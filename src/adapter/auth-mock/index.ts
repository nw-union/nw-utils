import { okAsync, Result } from "neverthrow";
import { AuthError } from "../../error.js";
import type { Auth, User } from "../../interface.js";
import { getTokenFromCookie, getTokenFromHeader } from "../util.js";

const AUTH_HEADER_KEY = "Mock-Access-Assertion";
const AUTH_COOKIE_KEY = "Mock_Authorization";

export const newAuthMock = (): Auth => ({
  auth: (req: Request) => okAsync(req).andThen(getToken).map(tokenToUser),
});

const getToken = (req: Request): Result<string, AuthError> =>
  getTokenFromHeader(req, AUTH_HEADER_KEY).orElse(() =>
    getTokenFromCookie(req, AUTH_COOKIE_KEY),
  );

const tokenToUser = (mail: string): User => ({
  id: "mock-user-id",
  mail,
});
