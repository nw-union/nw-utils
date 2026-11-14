/**
 * 最小限のスキーマバリデーション (valibot と同じ名前・使い方)
 *
 * - スキーマ・検証・変換はすべて「入力を受け取って Result を返す関数」(Step)
 * - `pipe` は Step を左から順に通し、最初の Failure で止まる
 * - すべて同期
 */
import { err, isErr, ok, type Result } from "../rslt/index.js";

// ----------------------------------------------------------------------------
// 型
// ----------------------------------------------------------------------------

/** バリデーションの問題 1 件 */
export type Issue = { readonly message: string };

/** I を受け取り、O か Issue[] を返す 1 ステップ (スキーマ・検証・変換の共通の形) */
export type Step<I, O> = (input: I) => Result<O, Issue[]>;

/** unknown を受け取れる Step。newVo などに渡すのはこれ */
export type Schema<O> = Step<unknown, O>;

/** Step の出力の型 */
// biome-ignore lint/suspicious/noExplicitAny: 入力の型は問わない
export type InferOutput<S extends Step<any, unknown>> =
  // biome-ignore lint/suspicious/noExplicitAny: 入力の型は問わない
  S extends Step<any, infer O> ? O : never;

declare const brandSymbol: unique symbol;

/** brand で付与される型の印 (実行時には存在しない) */
export type Brand<B extends string> = {
  readonly [brandSymbol]: { readonly [K in B]: B };
};

// ----------------------------------------------------------------------------
// 内部ヘルパー
// ----------------------------------------------------------------------------

// エラーメッセージ用に値を短い文字列にする
const show = (v: unknown): string => {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "bigint") return `${v}n`;
  if (v === null) return "null";
  if (Array.isArray(v)) return "Array";
  if (typeof v === "object") return "Object";
  if (typeof v === "function") return "Function";
  return String(v);
};

const fail = (message: string): Result<never, Issue[]> => err([{ message }]);

// 条件を満たせば入力をそのまま返し、満たさなければ Issue を返す Step を作る
const check =
  <T>(cond: (v: T) => boolean, message: (v: T) => string): Step<T, T> =>
  (input) =>
    cond(input) ? ok(input) : fail(message(input));

// 型チェックをする Schema を作る
const typed =
  <T>(expected: string, guard: (v: unknown) => v is T): Schema<T> =>
  (input) =>
    guard(input)
      ? ok(input)
      : fail(`Invalid type: Expected ${expected} but received ${show(input)}`);

// ----------------------------------------------------------------------------
// 型チェック
// ----------------------------------------------------------------------------

/** 文字列であることを検証する */
export const string = (): Schema<string> =>
  typed("string", (v): v is string => typeof v === "string");

/** 数値 (NaN を除く) であることを検証する */
export const number = (): Schema<number> =>
  typed(
    "number",
    (v): v is number => typeof v === "number" && !Number.isNaN(v),
  );

/** 真偽値であることを検証する */
export const boolean = (): Schema<boolean> =>
  typed("boolean", (v): v is boolean => typeof v === "boolean");

// ----------------------------------------------------------------------------
// 検証 (文字列)
// ----------------------------------------------------------------------------

/** 文字数が min 以上であることを検証する */
export const minLength = (min: number): Step<string, string> =>
  check(
    (v) => v.length >= min,
    (v) => `Invalid length: Expected >=${min} but received ${v.length}`,
  );

/** 文字数が max 以下であることを検証する */
export const maxLength = (max: number): Step<string, string> =>
  check(
    (v) => v.length <= max,
    (v) => `Invalid length: Expected <=${max} but received ${v.length}`,
  );

/** 文字数がちょうど len であることを検証する */
export const length = (len: number): Step<string, string> =>
  check(
    (v) => v.length === len,
    (v) => `Invalid length: Expected ${len} but received ${v.length}`,
  );

/** 空文字列でないことを検証する */
export const nonEmpty = (): Step<string, string> =>
  check(
    (v) => v.length > 0,
    () => "Invalid length: Expected !0 but received 0",
  );

/** 正規表現に一致することを検証する */
export const regex = (re: RegExp): Step<string, string> =>
  check(
    (v) => {
      re.lastIndex = 0; // g / y フラグ付きでも毎回先頭から判定する
      return re.test(v);
    },
    (v) => `Invalid format: Expected ${re} but received ${show(v)}`,
  );

// valibot の EMAIL_REGEX と同じ
const EMAIL_REGEX =
  /^[\w+-]+(?:\.[\w+-]+)*@[\da-z]+(?:[.-][\da-z]+)*\.[a-z]{2,}$/iu;

/** メールアドレスの形式であることを検証する */
export const email = (): Step<string, string> =>
  check(
    (v) => EMAIL_REGEX.test(v),
    (v) => `Invalid email: Received ${show(v)}`,
  );

// ----------------------------------------------------------------------------
// 検証 (数値)
// ----------------------------------------------------------------------------

/** min 以上であることを検証する */
export const minValue = (min: number): Step<number, number> =>
  check(
    (v) => v >= min,
    (v) => `Invalid value: Expected >=${min} but received ${v}`,
  );

/** max 以下であることを検証する */
export const maxValue = (max: number): Step<number, number> =>
  check(
    (v) => v <= max,
    (v) => `Invalid value: Expected <=${max} but received ${v}`,
  );

/** 整数であることを検証する */
export const integer = (): Step<number, number> =>
  check<number>(Number.isInteger, (v) => `Invalid integer: Received ${v}`);

// ----------------------------------------------------------------------------
// 合成
// ----------------------------------------------------------------------------

/**
 * 型に印を付ける。実行時は何もせず、型だけを `T & Brand<B>` に変える
 *
 * @example
 * ```typescript
 * const email = v.pipe(v.string(), v.email(), v.brand("Email"));
 * type Email = v.InferOutput<typeof email>; // string & Brand<"Email">
 * ```
 */
export const brand =
  <B extends string>(_name: B) =>
  <T>(input: T): Result<T & Brand<B>, Issue[]> =>
    ok(input as T & Brand<B>);

/**
 * Step を左から順に通す。最初に Failure になった Step で止まる (最大 10 個)
 *
 * @example
 * ```typescript
 * const age = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150));
 * ```
 */
// <generated:pipe> scripts/gen-flow-overloads.ts で生成 (bun run gen)。直接編集しないこと
export function pipe<A, B1>(s1: Step<A, B1>): Step<A, B1>;
export function pipe<A, B1, B2>(s1: Step<A, B1>, s2: Step<B1, B2>): Step<A, B2>;
export function pipe<A, B1, B2, B3>(
  s1: Step<A, B1>,
  s2: Step<B1, B2>,
  s3: Step<B2, B3>,
): Step<A, B3>;
export function pipe<A, B1, B2, B3, B4>(
  s1: Step<A, B1>,
  s2: Step<B1, B2>,
  s3: Step<B2, B3>,
  s4: Step<B3, B4>,
): Step<A, B4>;
export function pipe<A, B1, B2, B3, B4, B5>(
  s1: Step<A, B1>,
  s2: Step<B1, B2>,
  s3: Step<B2, B3>,
  s4: Step<B3, B4>,
  s5: Step<B4, B5>,
): Step<A, B5>;
export function pipe<A, B1, B2, B3, B4, B5, B6>(
  s1: Step<A, B1>,
  s2: Step<B1, B2>,
  s3: Step<B2, B3>,
  s4: Step<B3, B4>,
  s5: Step<B4, B5>,
  s6: Step<B5, B6>,
): Step<A, B6>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7>(
  s1: Step<A, B1>,
  s2: Step<B1, B2>,
  s3: Step<B2, B3>,
  s4: Step<B3, B4>,
  s5: Step<B4, B5>,
  s6: Step<B5, B6>,
  s7: Step<B6, B7>,
): Step<A, B7>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8>(
  s1: Step<A, B1>,
  s2: Step<B1, B2>,
  s3: Step<B2, B3>,
  s4: Step<B3, B4>,
  s5: Step<B4, B5>,
  s6: Step<B5, B6>,
  s7: Step<B6, B7>,
  s8: Step<B7, B8>,
): Step<A, B8>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8, B9>(
  s1: Step<A, B1>,
  s2: Step<B1, B2>,
  s3: Step<B2, B3>,
  s4: Step<B3, B4>,
  s5: Step<B4, B5>,
  s6: Step<B5, B6>,
  s7: Step<B6, B7>,
  s8: Step<B7, B8>,
  s9: Step<B8, B9>,
): Step<A, B9>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8, B9, B10>(
  s1: Step<A, B1>,
  s2: Step<B1, B2>,
  s3: Step<B2, B3>,
  s4: Step<B3, B4>,
  s5: Step<B4, B5>,
  s6: Step<B5, B6>,
  s7: Step<B6, B7>,
  s8: Step<B7, B8>,
  s9: Step<B8, B9>,
  s10: Step<B9, B10>,
): Step<A, B10>;
// </generated:pipe>
// biome-ignore lint/suspicious/noExplicitAny: 型はオーバーロードで付ける
export function pipe(...steps: Step<any, unknown>[]): Step<unknown, unknown> {
  return (input) => {
    let value = input;
    for (const step of steps) {
      const r = step(value);
      if (isErr(r)) return r;
      value = r.value;
    }
    return ok(value);
  };
}

// ----------------------------------------------------------------------------
// 実行
// ----------------------------------------------------------------------------

/**
 * スキーマで入力を検証する。`schema(input)` と同じ
 *
 * @example
 * ```typescript
 * const r = v.parse(v.string(), input); // Result<string, Issue[]>
 * ```
 */
export const parse = <O>(
  schema: Schema<O>,
  input: unknown,
): Result<O, Issue[]> => schema(input);
