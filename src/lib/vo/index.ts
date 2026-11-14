/**
 * 外部依存のない最小限のスキーマバリデーションと、Value Object 生成ヘルパー
 *
 * スキーマは `v` を import して valibot と同じ書き方で作る
 *
 * @example
 * ```typescript
 * import { newVo, v } from "@nw-union/nw-utils/lib/vo";
 *
 * const email = v.pipe(v.string(), v.email(), v.brand("Email"));
 * export type Email = v.InferOutput<typeof email>;
 * export const newEmail = newVo(email, "Email");
 * ```
 */
import { ValidationError } from "../../error.js";
import { err, isErr, ok, type Result } from "../rslt/index.js";
import type { InferOutput, Issue, Schema } from "./schema.js";

export type { Brand, InferOutput, Issue, Schema, Step } from "./schema.js";

// スキーマ部品を v.string() / v.pipe() のように使うための入れ物
export * as v from "./schema.js";

/**
 * newVo は, Value Object の生成関数を作るヘルパー関数
 *
 * @param schema スキーマ
 * @param type VOの型名
 *
 * @example
 * ```typescript
 * // Email VO の定義
 * const email = v.pipe(v.string(), v.email(), v.brand("Email"));
 * export type Email = v.InferOutput<typeof email>;
 * export const newEmail = newVo(email, "Email");
 *
 * // 使用方法
 * const result1 = newEmail(str); // VO の生成
 * const result2 = newEmail(str, "userEmail"); // エラーに userEmail と表示する場合
 * ```
 */
export const newVo =
  <S extends Schema<unknown>>(schema: S, type: string) =>
  (src: unknown, name?: string): Result<InferOutput<S>, ValidationError> => {
    const r = schema(src);
    return isErr(r)
      ? err(newValidationError(type, r.error, name))
      : ok(r.value as InferOutput<S>);
  };

/**
 * newVoOrNone は, 空文字列を null として扱う ValueObject 生成関数を作成するためのヘルパー関数
 *
 * 入力が空文字列 (`""`) の場合は `ok(null)` を返し、それ以外は `newVo` に委譲する。
 * フォーム入力など、未入力を null で表現したい任意フィールドに適している。
 *
 * @param schema スキーマ
 * @param type VOの型名
 *
 * @example
 * ```typescript
 * const email = v.pipe(v.string(), v.email(), v.brand("Email"));
 * export const newOptionalEmail = newVoOrNone(email, "Email");
 *
 * newOptionalEmail("");              // ok(null)
 * newOptionalEmail("a@example.com"); // ok(Email)
 * newOptionalEmail("invalid");       // err(ValidationError)
 * ```
 */
export const newVoOrNone = <S extends Schema<unknown>>(
  schema: S,
  type: string,
) => {
  const f = newVo(schema, type);
  return (
    src: unknown,
    name?: string,
  ): Result<InferOutput<S> | null, ValidationError> =>
    src === "" ? ok(null) : f(src, name);
};

const newValidationError = (type: string, issues: Issue[], name?: string) =>
  new ValidationError(
    `${name || type} is invalid. ( type: ${type} )`,
    issues.map((issue) => `${name || type}: ${issue.message}`),
  );
