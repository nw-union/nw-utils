/**
 * 最小限のパターンマッチライブラリ (ts-pattern の必要な機能だけを抜き出したもの)
 *
 * - `match(value).with(pattern, handler).exhaustive()` だけを持つ
 * - パターン: リテラル / オブジェクト (部分一致) / `P.string` / `P.boolean` / `P.instanceOf` / `P.select()`
 * - `exhaustive()` は分岐が足りないと型エラーになる
 *
 * @example
 * ```typescript
 * import { match, P } from "@nw-union/nw-utils/lib/match";
 *
 * const status = match(findUser(id)) // Result<User, NotFoundError | ForbiddenError>
 *   .with({ type: "Success" }, ({ value }) => json(value, 200))
 *   .with({ type: "Failure", error: P.instanceOf(NotFoundError) }, () => json(null, 404))
 *   .with({ type: "Failure", error: P.instanceOf(ForbiddenError) }, () => json(null, 403))
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
