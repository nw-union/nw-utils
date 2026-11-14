/**
 * 最小限の Result 型ライブラリ
 *
 * - Result は `{ type, value }` / `{ type, error }` の plain object (frozen)
 * - すべて独立した関数なので tree-shaking が効く
 * - 変換関数はすべて data-first の同期関数。非同期は `flowAsync` か async/await で扱う
 * - よく使う関数 (`ok`, `err`, `isOk`, `isErr`, `flow`, `flowAsync`) は直接 import できる
 *
 * @example
 * ```typescript
 * import { err, isErr, isOk, ok, Result } from "@nw-union/nw-utils/lib/result";
 *
 * const parse = (s: string): Result.Result<number, Error> =>
 *   Result.try(() => JSON.parse(s) as number, (e) => new Error(String(e)));
 *
 * const r = parse("1");
 * if (isOk(r)) console.log(r.value);
 *
 * const fetchUser = async (id: string): Result.ResultAsync<User, AppError> => {
 *   const valid = validateId(id);
 *   if (isErr(valid)) return valid;
 *   return Result.tryAsync(() => api.get(valid.value), toAppError);
 * };
 * ```
 */
export * as Result from "./result.js";
export { err, flow, flowAsync, isErr, isOk, ok } from "./result.js";
