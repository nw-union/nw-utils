/**
 * 最小限のパーサー (スキーマ)
 *
 * - パーサーは「入力を受け取って Result を返す関数」(Parser)。型チェックも検証も同じ形
 * - 引数のないパーサーは値 (`v.string`)、引数があるものは関数 (`v.minLength(3)`)
 * - `chain` はパーサーを左から順につなげる (Kleisli 合成)。最初の失敗で止まり、エラーは 1 件
 * - すべて同期・純粋
 */
import { err, isErr, ok, type Result } from "../rslt/index.js";

// ----------------------------------------------------------------------------
// 型
// ----------------------------------------------------------------------------

/** パースの失敗 */
export type Issue = { readonly message: string };

/** I を受け取り、O か Issue を返すパーサー */
export type Parser<I, O> = (input: I) => Result<O, Issue>;

/** unknown を受け取れるパーサー。newVo に渡すのはこれ */
export type Schema<O> = Parser<unknown, O>;

/** パーサーの出力の型 */
// biome-ignore lint/suspicious/noExplicitAny: 入力の型は問わない
export type InferOutput<P extends Parser<any, unknown>> =
  // biome-ignore lint/suspicious/noExplicitAny: 入力の型は問わない
  P extends Parser<any, infer O> ? O : never;

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

const fail = (message: string): Result<never, Issue> => err({ message });

// 条件を満たせば入力をそのまま返し、満たさなければ Issue を返すパーサーを作る
const check =
  <T>(cond: (v: T) => boolean, message: (v: T) => string): Parser<T, T> =>
  (input) =>
    cond(input) ? ok(input) : fail(message(input));

// 型チェックをするパーサーを作る
const typed =
  <T>(expected: string, guard: (v: unknown) => v is T): Schema<T> =>
  (input) =>
    guard(input)
      ? ok(input)
      : fail(`Invalid type: Expected ${expected} but received ${show(input)}`);

// ----------------------------------------------------------------------------
// 型チェック
// ----------------------------------------------------------------------------

/** 文字列 */
export const string: Schema<string> = typed(
  "string",
  (v): v is string => typeof v === "string",
);

/** 数値 (NaN を除く) */
export const number: Schema<number> = typed(
  "number",
  (v): v is number => typeof v === "number" && !Number.isNaN(v),
);

/** 真偽値 */
export const boolean: Schema<boolean> = typed(
  "boolean",
  (v): v is boolean => typeof v === "boolean",
);

// ----------------------------------------------------------------------------
// 検証 (文字列)
// ----------------------------------------------------------------------------

/** 文字数が min 以上 */
export const minLength = (min: number): Parser<string, string> =>
  check(
    (v) => v.length >= min,
    (v) => `Invalid length: Expected >=${min} but received ${v.length}`,
  );

/** 文字数が max 以下 */
export const maxLength = (max: number): Parser<string, string> =>
  check(
    (v) => v.length <= max,
    (v) => `Invalid length: Expected <=${max} but received ${v.length}`,
  );

/** 文字数がちょうど len */
export const length = (len: number): Parser<string, string> =>
  check(
    (v) => v.length === len,
    (v) => `Invalid length: Expected ${len} but received ${v.length}`,
  );

/** 空文字列でない */
export const nonEmpty: Parser<string, string> = check(
  (v) => v.length > 0,
  () => "Invalid length: Expected !0 but received 0",
);

/**
 * 正規表現に一致する
 *
 * 渡された RegExp は書き換えない (g / y フラグを外したコピーで判定する)
 */
export const regex = (re: RegExp): Parser<string, string> => {
  const r = new RegExp(re.source, re.flags.replace(/[gy]/g, ""));
  return check(
    (v) => r.test(v),
    (v) => `Invalid format: Expected ${re} but received ${show(v)}`,
  );
};

// valibot の EMAIL_REGEX と同じ
const EMAIL_REGEX =
  /^[\w+-]+(?:\.[\w+-]+)*@[\da-z]+(?:[.-][\da-z]+)*\.[a-z]{2,}$/iu;

/** メールアドレスの形式 */
export const email: Parser<string, string> = check(
  (v) => EMAIL_REGEX.test(v),
  (v) => `Invalid email: Received ${show(v)}`,
);

// ----------------------------------------------------------------------------
// 検証 (数値)
// ----------------------------------------------------------------------------

/** min 以上 */
export const minValue = (min: number): Parser<number, number> =>
  check(
    (v) => v >= min,
    (v) => `Invalid value: Expected >=${min} but received ${v}`,
  );

/** max 以下 */
export const maxValue = (max: number): Parser<number, number> =>
  check(
    (v) => v <= max,
    (v) => `Invalid value: Expected <=${max} but received ${v}`,
  );

/** 整数 */
export const integer: Parser<number, number> = check<number>(
  Number.isInteger,
  (v) => `Invalid integer: Received ${v}`,
);

// ----------------------------------------------------------------------------
// 組み合わせ
// ----------------------------------------------------------------------------

/**
 * 型に印を付ける。実行時は何もせず、型だけを `T & Brand<B>` に変える
 *
 * @example
 * ```typescript
 * const email = v.chain(v.string, v.email, v.brand("Email"));
 * type Email = v.InferOutput<typeof email>; // string & Brand<"Email">
 * ```
 */
export const brand =
  <B extends string>(_name: B) =>
  <T>(input: T): Result<T & Brand<B>, Issue> =>
    ok(input as T & Brand<B>);

/**
 * 空文字列なら null を返し、それ以外は parser に渡すパーサーを作る
 *
 * フォーム入力など、未入力を null で表現したい任意項目に使う
 *
 * @example
 * ```typescript
 * const optionalEmail = v.emptyAsNull(email); // Schema<Email | null>
 * optionalEmail("");              // ok(null)
 * optionalEmail("a@example.com"); // ok(Email)
 * ```
 */
export const emptyAsNull =
  <I, O>(parser: Parser<I, O>): Parser<I, O | null> =>
  (input) =>
    input === "" ? ok(null) : parser(input);

/**
 * パーサーを左から順につなげる (Kleisli 合成)。最初に失敗したパーサーで止まる (最大 10 個)
 *
 * 前のパーサーの出力型と、次のパーサーの入力型が合わないと型エラーになる
 *
 * @example
 * ```typescript
 * const age = v.chain(v.number, v.integer, v.minValue(0), v.maxValue(150));
 * ```
 */
// <generated:chain> scripts/gen-overloads.ts で生成 (bun run gen)。直接編集しないこと
export function chain<A, B1>(p1: Parser<A, B1>): Parser<A, B1>;
export function chain<A, B1, B2>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
): Parser<A, B2>;
export function chain<A, B1, B2, B3>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
  p3: Parser<B2, B3>,
): Parser<A, B3>;
export function chain<A, B1, B2, B3, B4>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
  p3: Parser<B2, B3>,
  p4: Parser<B3, B4>,
): Parser<A, B4>;
export function chain<A, B1, B2, B3, B4, B5>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
  p3: Parser<B2, B3>,
  p4: Parser<B3, B4>,
  p5: Parser<B4, B5>,
): Parser<A, B5>;
export function chain<A, B1, B2, B3, B4, B5, B6>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
  p3: Parser<B2, B3>,
  p4: Parser<B3, B4>,
  p5: Parser<B4, B5>,
  p6: Parser<B5, B6>,
): Parser<A, B6>;
export function chain<A, B1, B2, B3, B4, B5, B6, B7>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
  p3: Parser<B2, B3>,
  p4: Parser<B3, B4>,
  p5: Parser<B4, B5>,
  p6: Parser<B5, B6>,
  p7: Parser<B6, B7>,
): Parser<A, B7>;
export function chain<A, B1, B2, B3, B4, B5, B6, B7, B8>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
  p3: Parser<B2, B3>,
  p4: Parser<B3, B4>,
  p5: Parser<B4, B5>,
  p6: Parser<B5, B6>,
  p7: Parser<B6, B7>,
  p8: Parser<B7, B8>,
): Parser<A, B8>;
export function chain<A, B1, B2, B3, B4, B5, B6, B7, B8, B9>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
  p3: Parser<B2, B3>,
  p4: Parser<B3, B4>,
  p5: Parser<B4, B5>,
  p6: Parser<B5, B6>,
  p7: Parser<B6, B7>,
  p8: Parser<B7, B8>,
  p9: Parser<B8, B9>,
): Parser<A, B9>;
export function chain<A, B1, B2, B3, B4, B5, B6, B7, B8, B9, B10>(
  p1: Parser<A, B1>,
  p2: Parser<B1, B2>,
  p3: Parser<B2, B3>,
  p4: Parser<B3, B4>,
  p5: Parser<B4, B5>,
  p6: Parser<B5, B6>,
  p7: Parser<B6, B7>,
  p8: Parser<B7, B8>,
  p9: Parser<B8, B9>,
  p10: Parser<B9, B10>,
): Parser<A, B10>;
// </generated:chain>
// biome-ignore lint/suspicious/noExplicitAny: 型はオーバーロードで付ける
export function chain(
  ...parsers: Parser<any, unknown>[]
): Parser<unknown, unknown> {
  return (input) => {
    let value = input;
    for (const parser of parsers) {
      const r = parser(value);
      if (isErr(r)) return r;
      value = r.value;
    }
    return ok(value);
  };
}
