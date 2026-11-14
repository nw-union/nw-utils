import { AuthError } from "../../error.js";
import type { Auth, User } from "../../interface.js";
import {
  flowAsync,
  ok,
  pipe,
  type Result,
  rslt,
} from "../../lib/rslt/index.js";
import { getTokenFromCookie, getTokenFromHeader } from "../util.js";

const AUTH_HEADER_KEY = "Mock-Access-Assertion";
const AUTH_COOKIE_KEY = "Mock_Authorization";

export const newAuthMock = (): Auth => ({
  auth: (req: Request) => flowAsync(ok(req), getToken, tokenToUser),
});

const getToken = (req: Request): Result<string, AuthError> =>
  pipe(
    getTokenFromHeader(req, AUTH_HEADER_KEY),
    rslt.orElse(() => getTokenFromCookie(req, AUTH_COOKIE_KEY)),
  );

const tokenToUser = (mail: string): User => ({
  id: "mock-user-id",
  mail,
});
