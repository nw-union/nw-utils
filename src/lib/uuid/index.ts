import { err, ok, type Result } from "neverthrow";

/**
 * Web Crypto API を使用した UUID v4 生成
 * (Cloudflare Workers 環境対応)
 */
export const uuidv4 = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // バージョンとバリアントの設定
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant bits

  // バイト配列を16進文字列に変換
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // UUID フォーマットに整形
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

// --------------------------------------------
// UUID v4 短縮/復元（Base64URL）
// --------------------------------------------
/**
 * UUID文字列(例: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)をBase64URLで可逆に短縮する
 * - 出力はURLセーフな 22 文字
 * - 入力はUUID v4 前提だが、16バイトのUUIDであれば一般に動作
 */
export const toShortUuid = (uuid: string): Result<string, Error> =>
  uuidToBytes(uuid).map(base64UrlEncode);

/**
 * Base64URLで短縮されたUUID文字列(22文字)を通常のUUID表記に復元する
 */
export const fromShortUuid = (short: string): Result<string, Error> =>
  base64UrlDecode(short).andThen(bytesToUuid);

// ----------------------------------------------------------------------------
// Internal Utils
// ----------------------------------------------------------------------------
const uuidRegex =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const uuidToBytes = (uuid: string): Result<Uint8Array, Error> => {
  if (!uuidRegex.test(uuid)) {
    return err(new Error(`Invalid UUID format: ${uuid}`));
  }
  const hex = uuid.replace(/-/g, "").toLowerCase();
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const v = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(v)) return err(new Error("Invalid hex in UUID"));
    bytes[i] = v;
  }
  return ok(bytes);
};

const bytesToUuid = (bytes: Uint8Array): Result<string, Error> => {
  if (bytes.length !== 16) {
    return err(new Error(`Invalid byte length for UUID: ${bytes.length}`));
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return ok(
    [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-"),
  );
};

const base64UrlEncode = (bytes: Uint8Array): string => {
  // 16バイトのため安全に展開可能
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (short: string): Result<Uint8Array, Error> => {
  if (!/^[A-Za-z0-9_-]{22,24}$/.test(short)) {
    return err(new Error(`Invalid short UUID format: ${short}`));
  }
  let base64 = short.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return ok(bytes);
  } catch (_e) {
    return err(new Error("Invalid base64 input"));
  }
};
