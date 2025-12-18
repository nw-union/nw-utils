import { err, ok, Result } from "neverthrow";
import { match, P } from "ts-pattern";
import { AuthError } from "../error.js";

// Header からトークンを取得
export const getTokenFromHeader = (
  req: Request,
  headerKey: string,
): Result<string, AuthError> =>
  match(req.headers.get(headerKey))
    .with(P.string, (token) => ok(token))
    .with(null, () => err(new AuthError("No token found in headers")))
    .exhaustive();

// Cookie からトークンを取得
export const getTokenFromCookie = (
  req: Request,
  cookieKey: string,
): Result<string, AuthError> =>
  match(req.headers.get("Cookie"))
    .with(P.string, (cookieHeader) => {
      const cookies = parseCookie(cookieHeader);
      const token = cookies.get(cookieKey);
      return token
        ? ok(token.trim())
        : err(new AuthError("No token found in cookies"));
    })
    .with(null, () => err(new AuthError("No Cookie header found")))
    .exhaustive();

// Cookie パース用のヘルパー関数
const parseCookie = (cookieHeader: string): Map<string, string> =>
  new Map(
    cookieHeader
      .split(";")
      .map((cookie) => {
        const trimmedCookie = cookie.trim();
        const separatorIndex = trimmedCookie.indexOf("=");
        if (separatorIndex === -1) return ["", ""];

        const key = trimmedCookie.slice(0, separatorIndex).trim();
        const value = trimmedCookie.slice(separatorIndex + 1).trim();

        // Cookie値のデコード処理（RFC 6265準拠）
        try {
          return [decodeURIComponent(key), decodeURIComponent(value)];
        } catch {
          // デコードに失敗した場合は生の値を使用
          return [key, value];
        }
      })
      .filter(([key]) => key.length > 0) as [string, string][],
  );
