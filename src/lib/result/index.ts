/**
 * 最小限の Result 型ライブラリ
 *
 * - Result は `{ type, value }` / `{ type, error }` の plain object (frozen)
 * - すべての関数を個別に export しているので、import した関数だけがバンドルに入る
 * - 変換関数はすべて data-first の同期関数。非同期は `flowAsync` か async/await で扱う
 *
 * @example
 * ```typescript
 * import { isErr, isOk, rsltTry, rsltTryAsync, type Result, type ResultAsync } from "@nw-union/nw-utils/lib/result";
 *
 * const parse = (s: string): Result<number, Error> =>
 *   rsltTry(() => JSON.parse(s) as number, (e) => new Error(String(e)));
 *
 * const r = parse("1");
 * if (isOk(r)) console.log(r.value);
 *
 * const fetchUser = async (id: string): ResultAsync<User, AppError> => {
 *   const valid = validateId(id);
 *   if (isErr(valid)) return valid;
 *   return rsltTryAsync(() => api.get(valid.value), toAppError);
 * };
 * ```
 */
export * from "./result.js";
