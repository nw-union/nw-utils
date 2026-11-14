/**
 * 最小限のパターンマッチライブラリ (ts-pattern の必要な機能だけを抜き出したもの)
 *
 * - `match(value).with(pattern, handler).exhaustive()` だけを持つ (入力が Result なら `.ok` / `.err` も使える)
 * - パターン: リテラル / オブジェクト (部分一致) / `P._` / `P.string` / `P.boolean` / `P.instanceOf` / `P.union` / `P.select()`
 * - `exhaustive()` は分岐が足りないと型エラー、到達しない分岐も型エラーになる
 *
 * @example
 * ```typescript
 * import { match, P } from "@nw-union/nw-utils/lib/match";
 *
 * const status = match(findUser(id)) // Result<User, NotFoundError | ForbiddenError>
 *   .ok((user) => json(user, 200))
 *   .err(P.instanceOf(NotFoundError), () => json(null, 404))
 *   .err(P.instanceOf(ForbiddenError), () => json(null, 403))
 *   .exhaustive();
 *
 * const label = match(kind) // "admin" | "member" | "guest"
 *   .with("admin", () => "管理者")
 *   .with(P.union("member", "guest"), () => "一般")
 *   .exhaustive();
 * ```
 */
export {
  type Match,
  type Matcher,
  match,
  NonExhaustiveError,
  P,
  type Pattern,
  type UnionPattern,
} from "./match.js";
