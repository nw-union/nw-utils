/**
 * 最小限の Result 型ライブラリ
 *
 * - Result は `{ type, value }` / `{ type, error }` の plain object (frozen)
 * - すべての関数を個別に export しているので、使った関数だけがバンドルに入る
 *   (`rslt.map` のように `rslt` 経由で使っても同じ)
 * - 変換関数 (`rslt.map(fn)` など) は「Result を受け取る関数」を返す (data-last)。`pipe` に並べて使う。すべて同期
 * - 非同期は `flowAsync` か async/await で扱う
 *
 * よく使うもの (`ok`, `err`, `isOk`, `isErr`, `pipe`, `flow`, `flowAsync`, `through`, `throughAsync`, `sequence`, `collect`, 型) は名前で import し、
 * それ以外は `rslt` を import して `rslt.map` / `rslt.try` のように使う
 *
 * @example
 * ```typescript
 * import { isErr, isOk, pipe, rslt, type Result, type ResultAsync } from "@nw-union/nw-utils/lib/rslt";
 *
 * const parse = (s: string): Result<number, Error> =>
 *   rslt.try(() => JSON.parse(s) as number, (e) => new Error(String(e)));
 *
 * const r = pipe(parse("1"), rslt.map((n) => n + 1));
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
