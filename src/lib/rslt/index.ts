/**
 * 最小限の Result 型ライブラリ
 *
 * - Result は `{ type, value }` / `{ type, error }` の plain object (frozen)
 * - すべての関数を個別に export しているので、使った関数だけがバンドルに入る
 *   (`rslt.map` のように `rslt` 経由で使っても同じ)
 * - 変換関数はすべて data-first の同期関数。非同期は `flowAsync` か async/await で扱う
 *
 * よく使うもの (`ok`, `err`, `isOk`, `isErr`, `flow`, `flowAsync`, `sequence`, `collect`, 型) は名前で import し、
 * それ以外は `rslt` を import して `rslt.map` / `rslt.try` のように使う
 *
 * @example
 * ```typescript
 * import { isErr, isOk, rslt, type Result, type ResultAsync } from "@nw-union/nw-utils/lib/rslt";
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

// すべての関数を rslt.map / rslt.try のように使うための入れ物
// (型 Result と名前がぶつからないよう、別の名前で export する)
export * as rslt from "./result.js";
