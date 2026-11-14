/**
 * 外部依存のない最小限のパーサーと、Value Object 生成ヘルパー
 *
 * パーサーは `v` を import して作り、`newVo` で brand 付きの VO 生成関数にする
 *
 * @example
 * ```typescript
 * import { type InferVo, newVo, v } from "@nw-union/nw-utils/lib/vo";
 *
 * export const newEmail = newVo("Email", v.chain(v.string, v.email));
 * export type Email = InferVo<typeof newEmail>; // string & Brand<"Email">
 * ```
 */
import { ValidationError } from "../../error.js";
import { err, isErr, type Result } from "../rslt/index.js";
import type { Issue, Schema } from "./schema.js";

export type { InferOutput, Issue, Parser, Schema } from "./schema.js";

// パーサーを v.string / v.chain() のように使うための入れ物
export * as v from "./schema.js";

// ----------------------------------------------------------------------------
// 型
// ----------------------------------------------------------------------------

declare const brandSymbol: unique symbol;

/** VO の型に付く印 (実行時には存在しない) */
export type Brand<B extends string> = {
  readonly [brandSymbol]: { readonly [K in B]: B };
};

/** O に brand B を付けた型。null には付けない (emptyAsNull の任意項目用) */
export type Vo<O, B extends string> =
  | (Exclude<O, null> & Brand<B>)
  | Extract<O, null>;

/** newVo が返す生成関数から、VO の型を取り出す */
export type InferVo<F extends (src: unknown) => Result<unknown, unknown>> =
  F extends (src: unknown) => Result<infer T, unknown> ? T : never;

// ----------------------------------------------------------------------------
// エラー
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// VO ヘルパー
// ----------------------------------------------------------------------------

/**
 * Value Object の生成関数を作る。成功値には brand `type` が付く
 *
 * - brand は newVo が付けるので、付け忘れや、型名と brand 名の食い違いは起きない
 * - 返す関数は 1 引数なので、`Array.map` や `step` にそのまま渡せる
 *
 * @param type VO の型名。brand 名と、エラーメッセージに使う
 * @param schema パーサー (`v.string` などの型チェックで始まるもの)
 *
 * @example
 * ```typescript
 * const email = v.chain(v.string, v.email);
 * export const newEmail = newVo("Email", email);
 * export type Email = InferVo<typeof newEmail>; // string & Brand<"Email">
 *
 * newEmail("a@example.com"); // ok(Email)
 * inputs.map(newEmail);      // Result<Email, ValidationError>[]
 *
 * // 任意項目 (空文字列は null)。null には brand が付かない
 * export const newOptionalEmail = newVo("Email", v.emptyAsNull(email)); // Email | null
 * ```
 */
export const newVo =
  <B extends string, O>(type: B, schema: Schema<O>) =>
  (src: unknown): Result<Vo<O, B>, ValidationError> => {
    const r = schema(src);
    // brand は型だけの印なので、実行時は値をそのまま返す
    return isErr(r)
      ? err(toValidationError(type, r.error))
      : (r as Result<Vo<O, B>, never>);
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
