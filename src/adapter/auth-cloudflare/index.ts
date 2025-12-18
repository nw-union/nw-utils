import { err, fromPromise, ok, okAsync, Result, ResultAsync } from "neverthrow";
import { AuthError } from "../../error.js";
import { Auth } from "../../interface.js";
import { getTokenFromCookie, getTokenFromHeader } from "../util.js";

// JWKS型定義
interface JWK {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string; // RSA modulus
  e?: string; // RSA exponent
  x?: string; // EC x coordinate
  y?: string; // EC y coordinate
  crv?: string; // EC curve
}

interface JWKS {
  keys: JWK[];
}

interface JWTHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JWTPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  email?: string;
  [key: string]: unknown;
}

export const newAuthCloudflare = (teamDomain: string, aud?: string): Auth => ({
  auth: (req: Request) =>
    okAsync(req)
      // step.1 request からトークンを取得
      .andThen(getToken)
      // step.2 トークンを検証
      .andThen(
        tokenVerify(`${teamDomain}/cdn-cgi/access/certs`, teamDomain, aud),
      ),
});

// Base64URL デコード
const base64UrlDecode = (str: string): string => {
  // Base64URL を Base64 に変換
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // パディングを追加
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
};

// JWT をデコード
const decodeJWT = (
  token: string,
): Result<
  { header: JWTHeader; payload: JWTPayload; signature: string },
  AuthError
> => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return err(new AuthError("Invalid JWT format"));
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(base64UrlDecode(headerB64)) as JWTHeader;
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as JWTPayload;

    return ok({ header, payload, signature: signatureB64 });
  } catch (e) {
    return err(new AuthError(`Failed to decode JWT: ${(e as Error).message}`));
  }
};

// JWKS を取得
const fetchJWKS = async (jwksUrl: string): Promise<JWKS> => {
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.statusText}`);
  }
  return (await response.json()) as JWKS;
};

// JWK から公開鍵を生成
const importPublicKey = async (jwk: JWK): Promise<CryptoKey> => {
  // const algorithm = jwk.alg || "RS256";

  if (jwk.kty === "RSA") {
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" },
      },
      false,
      ["verify"],
    );
  }

  if (jwk.kty === "EC") {
    const namedCurve = jwk.crv === "P-256" ? "P-256" : "P-384";
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "ECDSA",
        namedCurve,
      },
      false,
      ["verify"],
    );
  }

  throw new Error(`Unsupported key type: ${jwk.kty}`);
};

// JWT 署名を検証
const verifySignature = async (
  token: string,
  publicKey: CryptoKey,
  algorithm: string,
): Promise<boolean> => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const signature = Uint8Array.from(base64UrlDecode(signatureB64), (c) =>
    c.charCodeAt(0),
  );

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  if (algorithm.startsWith("RS")) {
    return await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      signature,
      dataBuffer,
    );
  }

  if (algorithm.startsWith("ES")) {
    const hashAlgorithm = algorithm === "ES256" ? "SHA-256" : "SHA-384";
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: hashAlgorithm } },
      publicKey,
      signature,
      dataBuffer,
    );
  }

  throw new Error(`Unsupported algorithm: ${algorithm}`);
};

// JWT ペイロードを検証
const validatePayload = (
  payload: JWTPayload,
  issuer: string,
  audience?: string,
): Result<void, AuthError> => {
  const now = Math.floor(Date.now() / 1000);

  // exp (有効期限) チェック
  if (payload.exp && payload.exp < now) {
    return err(new AuthError("Token has expired"));
  }

  // nbf (有効開始時刻) チェック
  if (payload.nbf && payload.nbf > now) {
    return err(new AuthError("Token is not yet valid"));
  }

  // iss (発行者) チェック
  if (payload.iss !== issuer) {
    return err(
      new AuthError(`Invalid issuer: expected ${issuer}, got ${payload.iss}`),
    );
  }

  // aud (対象者) チェック
  if (audience) {
    const audiences = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud
        ? [payload.aud]
        : [];
    if (!audiences.includes(audience)) {
      return err(
        new AuthError(
          `Invalid audience: expected ${audience}, got ${payload.aud}`,
        ),
      );
    }
  }

  return ok(undefined);
};

/**
 * JWT トークンを検証してユーザーのメールアドレスを取得する
 *
 * @param jwksUrl - JWKS (JSON Web Key Set) を取得するための URL
 * @param issuer - トークンの発行者（iss クレーム）の期待値
 * @param audience - トークンの対象者（aud クレーム）の期待値（オプション）
 * @returns トークン文字列を受け取り、検証済みのメールアドレスを返す関数
 *
 * 検証フロー:
 * 1. JWT をデコードしてヘッダーとペイロードを取得
 * 2. ペイロードを検証（有効期限、発行者、対象者など）
 * 3. JWKS エンドポイントから公開鍵一覧を取得
 * 4. JWT ヘッダーの kid に一致する公開鍵を検索
 * 5. 公開鍵をインポートして署名を検証
 * 6. ペイロードからメールアドレスを抽出して返す
 */
const tokenVerify =
  (jwksUrl: string, issuer: string, audience?: string) =>
  (token: string): ResultAsync<string, AuthError> =>
    fromPromise(
      (async () => {
        // JWT をデコード
        const decoded = decodeJWT(token);
        if (decoded.isErr()) {
          throw new AuthError(decoded.error.message);
        }

        const { header, payload } = decoded.value;

        // ペイロードを検証
        const payloadValidation = validatePayload(payload, issuer, audience);
        if (payloadValidation.isErr()) {
          throw new AuthError(payloadValidation.error.message);
        }

        // JWKS を取得
        const jwks = await fetchJWKS(jwksUrl);

        // kid に一致する JWK を探す
        const jwk = jwks.keys.find((key) => key.kid === header.kid);
        if (!jwk) {
          throw new AuthError(`No matching key found for kid: ${header.kid}`);
        }

        // 公開鍵をインポート
        const publicKey = await importPublicKey(jwk);

        // 署名を検証
        const isValid = await verifySignature(token, publicKey, header.alg);
        if (!isValid) {
          throw new AuthError("Invalid signature");
        }

        // email を取得
        const userEmail =
          typeof payload.email === "string" ? payload.email : null;
        if (!userEmail) {
          throw new AuthError("No email found in JWT payload");
        }

        return userEmail;
      })(),
      (e) => new AuthError(`Invalid JWT token: ${(e as Error).message}`),
    );

const AUTH_HEADER_KEY = "Cf-Access-Jwt-Assertion";
const AUTH_COOKIE_KEY = "CF_Authorization";

/*
 * リクエストからトークンを取得
 * header で取得できればその値を, できなければ, Cookie から取得を試みる
 * どちらでも取得できなければエラーを返す
 */
const getToken = (req: Request): Result<string, AuthError> =>
  getTokenFromHeader(req, AUTH_HEADER_KEY).orElse(() =>
    getTokenFromCookie(req, AUTH_COOKIE_KEY),
  );
