/**
 * 最小限の Result 型ライブラリ
 *
 * - Result はクラスではなく plain object (`{ type, value }` / `{ type, error }`)
 * - 関数はすべて data-first の同期関数。sync/async が混ざる自動判定はしない
 * - 非同期は `ResultAsync<T, E>` (= `Promise<Result<T, E>>`) と async/await で扱う
 *
 * @example
 * ```typescript
 * import { Result } from "@nw-union/nw-utils/lib/result";
 *
 * const parse = (s: string): Result.Result<number, Error> =>
 *   Result.try(() => JSON.parse(s) as number, (e) => new Error(String(e)));
 *
 * const r = Result.map(parse("1"), (n) => n + 1); // Success<2>
 *
 * const fetchUser = async (id: string): Result.ResultAsync<User, AppError> => {
 *   const valid = validateId(id);
 *   if (Result.isFailure(valid)) return valid;
 *   return Result.tryAsync(() => api.get(valid.value), toAppError);
 * };
 * ```
 */
export * as Result from "./result.js";
