/**
 * 最小限の Result 型ライブラリ
 *
 * - 書き味は neverthrow に寄せている (`ok` / `err` / `r.isOk()` / `r.isErr()`)
 * - Result は `{ type, value }` / `{ type, error }` の frozen object。メソッドは共有プロトタイプにのみ持つ
 * - 変換関数はすべて data-first の同期関数。非同期は `flowAsync` か async/await で扱う
 *
 * @example
 * ```typescript
 * import { err, ok, Result } from "@nw-union/nw-utils/lib/result";
 *
 * const parse = (s: string): Result.Result<number, Error> =>
 *   Result.try(() => JSON.parse(s) as number, (e) => new Error(String(e)));
 *
 * const r = parse("1");
 * if (r.isOk()) console.log(r.value);
 *
 * const fetchUser = async (id: string): Result.ResultAsync<User, AppError> => {
 *   const valid = validateId(id);
 *   if (valid.isErr()) return valid;
 *   return Result.tryAsync(() => api.get(valid.value), toAppError);
 * };
 * ```
 */
export * as Result from "./result.js";
export { err, ok } from "./result.js";
