/**
 * 外部依存のない最小限のパーサーと、Value Object 生成ヘルパー
 *
 * パーサーは `v` を import して作る
 *
 * @example
 * ```typescript
 * import { newVo, v } from "@nw-union/nw-utils/lib/vo";
 *
 * const email = v.chain(v.string, v.email, v.brand("Email"));
 * export type Email = v.InferOutput<typeof email>;
 * export const newEmail = newVo(email, "Email");
 * ```
 */
import { ValidationError } from "../../error.js";
import { err, isErr, type Result } from "../rslt/index.js";
import type { Brand, BrandName, Issue, Schema } from "./schema.js";

export type {
  Brand,
  BrandName,
  InferOutput,
  Issue,
  Parser,
  Schema,
} from "./schema.js";

// パーサーを v.string / v.chain() のように使うための入れ物
export * as v from "./schema.js";

// newVo が作ったエラーの元情報 (withName で表示名を差し替えるのに使う)
const sources = new WeakMap<ValidationError, { type: string; issue: Issue }>();

const toValidationError = (
  type: string,
  issue: Issue,
  name: string = type,
): ValidationError => {
  const e = new ValidationError(`${name} is invalid. ( type: ${type} )`, [
    `${name}: ${issue.message}`,
  ]);
  sources.set(e, { type, issue });
  return e;
};

/**
 * Value Object の生成関数を作る
 *
 * 返す関数は 1 引数なので、`Array.map` や `step` にそのまま渡せる
 *
 * 型で次のことを強制する (満たさなければコンパイルエラー)
 * - schema の出力に `v.brand` が付いていること (`v.emptyAsNull` で null が加わるのはよい)
 * - type が brand 名と一致すること
 *
 * @param schema パーサー (出力に brand が必要)
 * @param type VO の型名。brand 名と同じ文字列 (エラーメッセージに使う)
 *
 * @example
 * ```typescript
 * const email = v.chain(v.string, v.email, v.brand("Email"));
 * export type Email = v.InferOutput<typeof email>;
 * export const newEmail = newVo(email, "Email");
 *
 * newEmail("a@example.com"); // ok(Email)
 * inputs.map(newEmail);      // Result<Email, ValidationError>[]
 * ```
 */
export const newVo =
  <O extends Brand<string> | null>(schema: Schema<O>, type: BrandName<O>) =>
  (src: unknown): Result<O, ValidationError> => {
    const r = schema(src);
    return isErr(r) ? err(toValidationError(type, r.error)) : r;
  };

/**
 * newVo が返した ValidationError の表示名を差し替える関数を作る (`rslt.mapErr` 用)
 *
 * newVo 以外で作られた ValidationError は、そのまま返す
 *
 * @example
 * ```typescript
 * rslt.pipe(newEmail(input), rslt.mapErr(withName("userEmail")));
 * // error.message: "userEmail is invalid. ( type: Email )"
 * // error.details: ['userEmail: Invalid email: Received "..."']
 * ```
 */
export const withName =
  (name: string) =>
  (e: ValidationError): ValidationError => {
    const src = sources.get(e);
    return src ? toValidationError(src.type, src.issue, name) : e;
  };
