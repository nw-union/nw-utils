import { err, ok, type Result } from "neverthrow";
import { match } from "ts-pattern";
import type { ZodError, z } from "zod";
import { ValidationError } from "../../error";

/**
 * newType は, ValueObjectを生成関数を作成するためのヘルパー関数
 *
 * @param schema zodのスキーマ
 * @param type VOの型名
 *
 * @example
 * ```typescript
 * // Email VO の定義
 * const email = z.string().email().brand("Email");
 * export type Email = z.infer<typeof email>;
 * export const newEmail = newType(email, "Email");
 *
 * // 使用方法
 * const result1 = newEmail(str); // VO の生成
 * const result2 = newEmail(str, "userEmail"); // エラーに userEmail と表示する場合
 *
 * ```
 */
export const newType =
  <T extends z.ZodTypeAny>(schema: T, type: string) =>
  (src: unknown, name?: string): Result<z.infer<T>, ValidationError> =>
    match(schema.safeParse(src))
      .with({ success: true }, ({ data }) => ok(data))
      .with({ success: false }, ({ error }) =>
        err(newValidationError(type, error, name)),
      )
      .exhaustive();

const newValidationError = (type: string, e: ZodError, name?: string) =>
  new ValidationError(
    `${name || type} is invalid. ( type: ${type} )`,
    e.issues.map((issue) => `${name || type}: ${issue.message}`),
    e,
  );
