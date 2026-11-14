// ----------------------------------------------------------------------------
// パターン (P)
// ----------------------------------------------------------------------------

/** Matcher を、リテラルやオブジェクトのパターンと区別するための印 */
export const MATCHER = Symbol("@nw-union/nw-utils/lib/match/matcher");

/** P.union のパターンを区別するための印 */
export const UNION = Symbol("@nw-union/nw-utils/lib/match/union");

/**
 * 値を判定するパターン (`P.string` など)
 *
 * - `T`: 一致したときの値の型 (型ガードで表す)
 * - `S`: 一致した値を handler に渡すか (`P.select()` のときだけ true)
 */
export interface Matcher<T, S extends boolean = false> {
  readonly [MATCHER]: {
    readonly match: (value: unknown) => value is T;
    readonly select: S;
  };
}

/** いずれかのパターンに一致するパターン (`P.union`) */
export interface UnionPattern<Ps extends readonly unknown[]> {
  readonly [UNION]: Ps;
}

const matcher = <T, S extends boolean>(
  match: (value: unknown) => value is T,
  select: S,
): Matcher<T, S> =>
  Object.freeze({ [MATCHER]: Object.freeze({ match, select }) });

const always = (_v: unknown): _v is unknown => true;
const wildcard = matcher(always, false);
const selectAll = matcher(always, true);

/** `match(...).with()` に渡すパターン */
export const P = Object.freeze({
  /** 何にでも一致する (値は取り出さない) */
  _: wildcard,

  /** 文字列に一致する */
  string: matcher((v): v is string => typeof v === "string", false),

  /** true / false に一致する */
  boolean: matcher((v): v is boolean => typeof v === "boolean", false),

  /** クラスのインスタンス (`instanceof`) に一致する */
  instanceOf: <C extends abstract new (...args: never[]) => unknown>(
    cls: C,
  ): Matcher<InstanceType<C>> =>
    matcher((v): v is InstanceType<C> => v instanceof cls, false),

  /** 渡したパターンのいずれかに一致する (前から順に試す) */
  union: <const Ps extends readonly [unknown, ...unknown[]]>(
    ...patterns: Ps
  ): UnionPattern<Ps> => Object.freeze({ [UNION]: patterns }),

  /**
   * 何にでも一致し、その位置の値を handler に渡す
   * (1 つのパターンに 1 つだけ書ける)
   */
  select: (): Matcher<unknown, true> => selectAll,
});

// ----------------------------------------------------------------------------
// 型: パターン
// ----------------------------------------------------------------------------

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * 入力 `I` に対して書けるパターン
 *
 * - Matcher (`P.string` など)
 * - `P.union(...)` (中身も `I` に対するパターン)
 * - `I` が取りうるリテラル
 * - オブジェクト (部分一致。`I` にあるキーだけ書ける)
 */
export type Pattern<I> = unknown extends I
  ? unknown
  :
      | Matcher<unknown, boolean>
      | UnionPattern<readonly Pattern<I>[]>
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
  Pat extends UnionPattern<infer Ps>
    ? number extends Ps["length"]
      ? I // タプルでない配列 (型パラメータの制約そのもの) は展開しない
      : NarrowEach<I, Ps[number]>
    : Pat extends Matcher<infer T, boolean>
      ? unknown extends T
        ? I
        : NarrowLeaf<I, T>
      : Pat extends Primitive
        ? NarrowLeaf<I, Pat>
        : I extends object
          ? NarrowObject<I, Pat>
          : never;

/** union の各パターンで絞り込んだ結果の union */
type NarrowEach<I, Q> = Q extends unknown ? NarrowOne<I, Q> : never;

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
  Pat extends UnionPattern<infer Ps>
    ? number extends Ps["length"]
      ? never
      : FindSelect<I, Ps[number]>
    : Pat extends Matcher<unknown, infer S>
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
// - P.union → 中のパターンを前から順に取り除く

/** `R` からパターン `Pat` に必ず一致する部分を取り除く */
export type ExcludeMatched<R, Pat> = R extends unknown
  ? ExcludeOne<R, Pat>
  : never;

type ExcludeOne<R, Pat> =
  Pat extends UnionPattern<infer Ps>
    ? ExcludeAll<R, Ps>
    : Pat extends Matcher<infer T, boolean>
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
            : [Extract<keyof Pat, OptionalKeys<R>>] extends [never]
              ? ExcludeFields<
                  R,
                  { [K in keyof Pat]: ExcludeMatched<R[K & keyof R], Pat[K]> }
                >
              : R // 省略できるキーは、値がなければ一致しないので取り除かない
          : R;

/** 省略できる (`?:`) キー */
type OptionalKeys<R> = {
  [K in keyof R]-?: {} extends Pick<R, K> ? K : never;
}[keyof R];

type ExcludeAll<R, Ps> = Ps extends readonly [infer H, ...infer T]
  ? ExcludeAll<ExcludeMatched<R, H>, T>
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
 * 到達しない分岐のパターンに付く型
 *
 * `Remaining` (まだ一致していない型) にパターンが一致しうる部分がなければ、パターンを渡せなくする
 * (`Remaining` は実際より広めに見積もっているので、ここでエラーになる分岐は本当に到達しない)
 */
type Reachable<Remaining, Pat> = [Narrow<Remaining, Pat>] extends [never]
  ? { readonly 到達しない分岐です: Remaining }
  : unknown;

/**
 * `match(value)` が返すビルダー
 *
 * - `I`: 入力の型
 * - `R`: handler の戻り値の union
 * - `Remaining`: まだどの分岐にも一致していない型
 */
export type Match<I, R, Remaining> = {
  /**
   * パターンに一致したら handler を呼ぶ (最初に一致した分岐だけ)
   *
   * それより前の分岐ですべて一致済みで、到達しない分岐を書くと型エラーになる
   */
  with<const Pat extends Pattern<I>, Out>(
    pattern: Pat & Reachable<Remaining, Pat>,
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

const show = (v: unknown): string => {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

/** どの分岐にも一致しなかったときのエラー */
export class NonExhaustiveError extends Error {
  constructor(readonly input: unknown) {
    super(`Pattern matching error: no pattern matches value ${show(input)}`);
    this.name = "NonExhaustiveError";
  }
}

/**
 * パターンに一致した結果
 *
 * - `[]`: 一致した (select なし)
 * - `[v]`: 一致し、P.select() の位置の値が v
 * - 一致しなければ undefined
 */
type Hit = readonly [] | readonly [selected: unknown];

const NO_SELECT: Hit = Object.freeze([]);

const isMatcher = (p: unknown): p is Matcher<unknown, boolean> =>
  typeof p === "object" && p !== null && MATCHER in p;

const isUnion = (p: unknown): p is UnionPattern<readonly unknown[]> =>
  typeof p === "object" && p !== null && UNION in p;

const isObjectLike = (v: unknown): v is Record<PropertyKey, unknown> =>
  (typeof v === "object" && v !== null) || typeof v === "function";

/** 2 つの一致結果をまとめる (どちらかが一致しなければ一致しない。select は先のものを優先) */
const both = (
  a: Hit | undefined,
  b: () => Hit | undefined,
): Hit | undefined => {
  if (a === undefined) return undefined;
  const hb = b();
  if (hb === undefined) return undefined;
  return a.length > 0 ? a : hb;
};

/** パターンに一致するか (純粋関数) */
const matchPattern = (pattern: unknown, value: unknown): Hit | undefined => {
  if (isUnion(pattern))
    return pattern[UNION].reduce<Hit | undefined>(
      (hit, p) => hit ?? matchPattern(p, value),
      undefined,
    );
  if (isMatcher(pattern)) {
    const m = pattern[MATCHER];
    if (!m.match(value)) return undefined;
    return m.select ? [value] : NO_SELECT;
  }
  if (isObjectLike(pattern)) {
    if (!isObjectLike(value)) return undefined;
    return Object.keys(pattern).reduce<Hit | undefined>(
      (hit, k) =>
        both(hit, () =>
          k in value ? matchPattern(pattern[k], value[k]) : undefined,
        ),
      NO_SELECT,
    );
  }
  return pattern === value ? NO_SELECT : undefined;
};

type State =
  | { readonly matched: false }
  | { readonly matched: true; readonly output: unknown };

const NOT_MATCHED: State = Object.freeze({ matched: false });

const builder = (input: unknown, state: State) => {
  const self = Object.freeze({
    with(pattern: unknown, handler: (v: unknown) => unknown) {
      if (state.matched) return self;
      const hit = matchPattern(pattern, input);
      if (hit === undefined) return self;
      const output = handler(hit.length > 0 ? hit[0] : input);
      return builder(input, Object.freeze({ matched: true, output }));
    },
    exhaustive() {
      if (state.matched) return state.output;
      throw new NonExhaustiveError(input);
    },
  });
  return self;
};

/**
 * パターンマッチを始める
 *
 * @example
 * ```typescript
 * const status = match(r) // Result<User, NotFoundError | ForbiddenError>
 *   .with({ type: "Success" }, ({ value }) => 200)
 *   .with({ type: "Failure", error: P.union(P.instanceOf(NotFoundError), P.instanceOf(ForbiddenError)) }, () => 400)
 *   .exhaustive();
 * ```
 */
export const match = <I>(value: I): Match<I, never, I> =>
  builder(value, NOT_MATCHED) as unknown as Match<I, never, I>;
