/**
 * 最小限の Result 型ライブラリ
 *
 * - Result は `{ type, value }` / `{ type, error }` の plain object (frozen)
 * - すべての関数を個別に export しているので、使った関数だけがバンドルに入る
 *   (`import * as rslt` で `rslt.map` のように使っても同じ)
 * - 変換関数はすべて data-first の同期関数。非同期は `flowAsync` か async/await で扱う
 *
 * よく使うもの (`ok`, `err`, `isOk`, `isErr`, `flow`, `flowAsync`, `sequence`, `collect`, 型) は名前で import し、
 * それ以外は `import * as rslt` して `rslt.map` / `rslt.try` のように使う
 *
 * @example
 * ```typescript
 * import * as rslt from "@nw-union/nw-utils/lib/rslt";
 * import { isErr, isOk, type Result, type ResultAsync } from "@nw-union/nw-utils/lib/rslt";
 *
 * const parse = (s: string): Result<number, Error> =>
 *   rslt.try(() => JSON.parse(s) as number, (e) => new Error(String(e)));
 *
 * const r = rslt.map(parse("1"), (n) => n + 1);
 * if (isOk(r)) console.log(r.value);
 *
 * const fetchUser = async (id: string): ResultAsync<User, AppError> => {
 *   const valid = validateId(id);
 *   if (isErr(valid)) return valid;
 *   return rslt.tryAsync(() => api.get(valid.value), toAppError);
 * };
 * ```
 */
export * from "./result.js";
