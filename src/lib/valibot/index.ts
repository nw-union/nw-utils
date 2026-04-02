import { err, ok, type Result } from "neverthrow";
import { match } from "ts-pattern";
import {
  type BaseIssue,
  type GenericSchema,
  type InferOutput,
  safeParse,
  ValiError,
} from "valibot";
import { ValidationError } from "../../error.js";

/**
 * newType は, ValueObjectを生成関数を作成するためのヘルパー関数
 *
 * @param schema valibotのスキーマ
 * @param type VOの型名
 *
 * @example
 * ```typescript
 * // Email VO の定義
 * const email = v.pipe(v.string(), v.email(), v.brand("Email"));
 * export type Email = v.InferOutput<typeof email>;
 * export const newEmail = newType(email, "Email");
 *
 * // 使用方法
 * const result1 = newEmail(str); // VO の生成
 * const result2 = newEmail(str, "userEmail"); // エラーに userEmail と表示する場合
 *
 * ```
 */
export const newType =
  <T extends GenericSchema>(schema: T, type: string) =>
  (src: unknown, name?: string): Result<InferOutput<T>, ValidationError> =>
    match(safeParse(schema, src))
      .with({ success: true }, ({ output }) => ok(output))
      .with({ success: false }, ({ issues }) =>
        err(newValidationError(type, issues, name)),
      )
      .exhaustive();

const newValidationError = (
  type: string,
  issues: BaseIssue<unknown>[],
  name?: string,
) =>
  new ValidationError(
    `${name || type} is invalid. ( type: ${type} )`,
    issues.map((issue) => `${name || type}: ${issue.message}`),
    new ValiError(issues as [BaseIssue<unknown>, ...BaseIssue<unknown>[]]),
  );
