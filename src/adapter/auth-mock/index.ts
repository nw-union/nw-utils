import { okAsync, Result } from "neverthrow";
import { AuthError } from "../../error";
import type { Auth } from "../../interface";
import { getTokenFromCookie, getTokenFromHeader } from "../util";

const AUTH_HEADER_KEY = "Mock-Access-Assertion";
const AUTH_COOKIE_KEY = "Mock_Authorization";

export const newAuthMock = (): Auth => ({
  auth: (req: Request) =>
    okAsync(req).andThen(getToken),
});

const getToken = (req: Request): Result<string, AuthError> =>
  getTokenFromHeader(req, AUTH_HEADER_KEY).orElse(() =>
    getTokenFromCookie(req, AUTH_COOKIE_KEY),
  );
