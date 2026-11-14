// ----------------------------------------------------------------------------
// パターン (P)
// ----------------------------------------------------------------------------

/** Matcher を、リテラルやオブジェクトのパターンと区別するための印 */
export const MATCHER = Symbol("@nw-union/nw-utils/lib/match");

/**
 * 値を判定するパターン (`P.string` など)
 *
 * - `T`: 一致したときの値の型 (型ガードで表す)
 * - `S`: 一致した値を handler に渡すか (`P.select()` のときだけ true)
 */
export type Matcher<T, S extends boolean = false> = {
  readonly [MATCHER]: {
    readonly match: (value: unknown) => value is T;
    readonly select: S;
  };
};

const matcher = <T, S extends boolean>(
  match: (value: unknown) => value is T,
  select: S,
): Matcher<T, S> =>
  Object.freeze({ [MATCHER]: Object.freeze({ match, select }) });

const isString = matcher((v): v is string => typeof v === "string", false);
const isBoolean = matcher((v): v is boolean => typeof v === "boolean", false);
const anything = matcher((_v): _v is unknown => true, true);

/** `match(...).with()` に渡すパターン */
export const P = Object.freeze({
  /** 文字列に一致する */
  string: isString,

  /** true / false に一致する */
  boolean: isBoolean,

  /** クラスのインスタンス (`instanceof`) に一致する */
  instanceOf: <C extends abstract new (...args: never[]) => unknown>(
    cls: C,
  ): Matcher<InstanceType<C>> =>
    matcher((v): v is InstanceType<C> => v instanceof cls, false),

  /**
   * 何にでも一致し、その位置の値を handler に渡す
   * (1 つのパターンに 1 つだけ書ける)
   */
  select: (): Matcher<unknown, true> => anything,
});

// ----------------------------------------------------------------------------
// 型: パターン
// ----------------------------------------------------------------------------

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * 入力 `I` に対して書けるパターン
 *
 * - Matcher (`P.string` など)
 * - `I` が取りうるリテラル
 * - オブジェクト (部分一致。`I` にあるキーだけ書ける)
 */
export type Pattern<I> = unknown extends I
  ? unknown
  :
      | Matcher<unknown, boolean>
      | (I extends Primitive ? I : never)
      | (I extends object
          ? { readonly [K in keyof I]?: Pattern<I[K]> }
          : never);

// ----------------------------------------------------------------------------
// 型: 絞り込み (handler が受け取る型)
// ----------------------------------------------------------------------------

/** 葉 (リテラル / Matcher) で絞り込む。I は union を分配済みの 1 メンバー */
type NarrowLeaf<I, T> = [I] extends [T] ? I : [T] extends [I] ? T : never;

/** パターン `Pat` に一致しうる `I` の部分 */
export type Narrow<I, Pat> = unknown extends I
  ? I
  : I extends unknown
    ? NarrowOne<I, Pat>
    : never;

type NarrowOne<I, Pat> =
  Pat extends Matcher<infer T, boolean>
    ? unknown extends T
      ? I
      : NarrowLeaf<I, T>
    : Pat extends Primitive
      ? NarrowLeaf<I, Pat>
      : I extends object
        ? NarrowObject<I, Pat>
        : never;

type NarrowObject<I, Pat> = [Exclude<keyof Pat, keyof I>] extends [never]
  ? NarrowFields<I, Pat, { [K in keyof Pat]: Narrow<I[K & keyof I], Pat[K]> }>
  : never;

type NarrowFields<I, Pat, N> = [
  { [K in keyof N]: [N[K]] extends [never] ? K : never }[keyof N],
] extends [never]
  ? ChangedKeys<I, N> extends infer C extends keyof N & keyof I
    ? [C] extends [never]
      ? I
      : Omit<I, C> & { readonly [K in C]: N[K] }
    : never
  : never;

/** 絞り込みで型が変わったキー */
type ChangedKeys<I, N> = {
  [K in keyof N]: [I[K & keyof I]] extends [N[K]] ? never : K;
}[keyof N];

// ----------------------------------------------------------------------------
// 型: P.select()
// ----------------------------------------------------------------------------

type PropOf<I, K> = I extends unknown
  ? K extends keyof I
    ? I[K]
    : never
  : never;

/** P.select() の位置にある型を `[T]` で返す (select がなければ never) */
type FindSelect<I, Pat> =
  Pat extends Matcher<unknown, infer S>
    ? [S] extends [true]
      ? [I]
      : never
    : Pat extends Primitive
      ? never
      : { [K in keyof Pat]-?: FindSelect<PropOf<I, K>, Pat[K]> }[keyof Pat];

/** handler が受け取る型 (select があればその値、なければ絞り込んだ入力) */
export type Handled<I, Pat> = [FindSelect<Narrow<I, Pat>, Pat>] extends [never]
  ? Narrow<I, Pat>
  : FindSelect<Narrow<I, Pat>, Pat> extends [infer S]
    ? S
    : never;

// ----------------------------------------------------------------------------
// 型: 網羅性 (まだ一致していない型)
// ----------------------------------------------------------------------------
// 取り除くのは、確実に一致するとわかる場合だけ (保守的)
// - パターンがメンバーを完全に覆う → 取り除く
// - 完全に覆っていないキーが 1 つだけ → そのキーの型だけを狭める
// - それ以外 → 取り除かない

/** `R` からパターン `Pat` に必ず一致する部分を取り除く */
export type ExcludeMatched<R, Pat> = R extends unknown
  ? ExcludeOne<R, Pat>
  : never;

type ExcludeOne<R, Pat> =
  Pat extends Matcher<infer T, boolean>
    ? unknown extends T
      ? never
      : [R] extends [T]
        ? never
        : R
    : Pat extends Primitive
      ? [R] extends [Pat]
        ? never
        : R
      : R extends object
        ? [NarrowObject<R, Pat>] extends [never]
          ? R
          : ExcludeFields<
              R,
              { [K in keyof Pat]: ExcludeMatched<R[K & keyof R], Pat[K]> }
            >
        : R;

type ExcludeFields<R, E> = {
  [K in keyof E]: [E[K]] extends [never] ? never : K;
}[keyof E] extends infer U extends keyof E & keyof R
  ? [U] extends [never]
    ? never
    : [IsSingle<U>] extends [true]
      ? [R[U]] extends [E[U]]
        ? R
        : Omit<R, U> & { readonly [K in U]: E[K] }
      : R
  : never;

type IsSingle<U, All = U> = U extends unknown
  ? [Exclude<All, U>] extends [never]
    ? true
    : false
  : never;

// ----------------------------------------------------------------------------
// 型: ビルダー
// ----------------------------------------------------------------------------

/** 網羅されていないときに `.exhaustive` が取る型 (`Remaining` が残っている型) */
export type NonExhaustive<Remaining> = {
  readonly 分岐が足りません: Remaining;
};

/**
 * `match(value)` が返すビルダー
 *
 * - `I`: 入力の型
 * - `R`: handler の戻り値の union
 * - `Remaining`: まだどの分岐にも一致していない型
 */
export type Match<I, R, Remaining> = {
  /** パターンに一致したら handler を呼ぶ (最初に一致した分岐だけ) */
  with<const Pat extends Pattern<I>, Out>(
    pattern: Pat,
    handler: (value: Handled<I, Pat>) => Out,
  ): Match<I, R | Out, ExcludeMatched<Remaining, Pat>>;

  /**
   * 一致した分岐の戻り値を返す
   *
   * 分岐が足りないと型エラーになる。型をごまかして渡した値がどれにも一致しなければ NonExhaustiveError を throw する
   */
  readonly exhaustive: [Remaining] extends [never]
    ? () => R
    : NonExhaustive<Remaining>;
};

// ----------------------------------------------------------------------------
// 実行時
// ----------------------------------------------------------------------------

/** どの分岐にも一致しなかったときのエラー */
export class NonExhaustiveError extends Error {
  constructor(readonly input: unknown) {
    let shown: string;
    try {
      shown = JSON.stringify(input) ?? String(input);
    } catch {
      shown = String(input);
    }
    super(`Pattern matching error: no pattern matches value ${shown}`);
    this.name = "NonExhaustiveError";
  }
}

const isMatcher = (p: unknown): p is Matcher<unknown, boolean> =>
  typeof p === "object" && p !== null && MATCHER in p;

/** パターンに一致するか。select の値は onSelect に渡す */
const matchPattern = (
  pattern: unknown,
  value: unknown,
  onSelect: (v: unknown) => void,
): boolean => {
  if (isMatcher(pattern)) {
    const m = pattern[MATCHER];
    if (!m.match(value)) return false;
    if (m.select) onSelect(value);
    return true;
  }
  if (typeof pattern === "object" && pattern !== null) {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null
    )
      return false;
    const obj = value as Record<string, unknown>;
    return Object.keys(pattern).every(
      (k) =>
        k in obj &&
        matchPattern((pattern as Record<string, unknown>)[k], obj[k], onSelect),
    );
  }
  return pattern === value;
};

type State = { matched: false } | { matched: true; output: unknown };

const NOT_MATCHED: State = { matched: false };

const builder = (input: unknown, state: State) => {
  const self = {
    with(pattern: unknown, handler: (v: unknown) => unknown) {
      if (state.matched) return self;
      let selected: { value: unknown } | undefined;
      const ok = matchPattern(pattern, input, (v) => {
        selected = { value: v };
      });
      if (!ok) return self;
      const output = handler(selected ? selected.value : input);
      return builder(input, { matched: true, output });
    },
    exhaustive() {
      if (state.matched) return state.output;
      throw new NonExhaustiveError(input);
    },
  };
  return self;
};

/**
 * パターンマッチを始める
 *
 * @example
 * ```typescript
 * const status = match(r) // Result<User, NotFoundError | ForbiddenError>
 *   .with({ type: "Success" }, ({ value }) => 200)
 *   .with({ type: "Failure", error: P.instanceOf(NotFoundError) }, () => 404)
 *   .with({ type: "Failure", error: P.instanceOf(ForbiddenError) }, () => 403)
 *   .exhaustive();
 * ```
 */
export const match = <I>(value: I): Match<I, never, I> =>
  builder(value, NOT_MATCHED) as unknown as Match<I, never, I>;
