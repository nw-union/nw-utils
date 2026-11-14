// ----------------------------------------------------------------------------
// 型定義
// ----------------------------------------------------------------------------

/** 成功を表す値 */
export type Success<T> = { readonly type: "Success"; readonly value: T };

/** 失敗を表す値 */
export type Failure<E> = { readonly type: "Failure"; readonly error: E };

/** 成功 または 失敗 */
export type Result<T, E> = Success<T> | Failure<E>;

/** 非同期の Result */
export type ResultAsync<T, E> = Promise<Result<T, E>>;

// Promise を返す関数を同期の try / flow に渡せないようにするための型
// - union の一部でも Promise なら拒否する (`number | Promise<number>` も不可)
// - any は判定できないので許可する (JSON.parse などを渡せるように)
type NotPromise<T> = 0 extends 1 & T
  ? unknown
  : [Extract<T, PromiseLike<unknown>>] extends [never]
    ? unknown
    : never;

// ----------------------------------------------------------------------------
// 生成
// ----------------------------------------------------------------------------

/** 成功の Result を作る */
export function ok(): Result<void, never>;
export function ok<T>(value: T): Result<T, never>;
export function ok<T>(value?: T): Result<T | undefined, never> {
  return Object.freeze({ type: "Success", value });
}

/** 失敗の Result を作る */
export const err = <E>(error: E): Result<never, E> =>
  Object.freeze({ type: "Failure", error });

// ----------------------------------------------------------------------------
// 判定
// ----------------------------------------------------------------------------

/** 成功かどうか (型ガード) */
export const isOk = <T, E>(r: Result<T, E>): r is Success<T> =>
  r.type === "Success";

/** 失敗かどうか (型ガード) */
export const isErr = <T, E>(r: Result<T, E>): r is Failure<E> =>
  r.type === "Failure";

/**
 * 例外を投げうる同期関数を実行し、Result に変換する
 *
 * 非同期関数には `tryAsync` を使うこと
 */
const try_ = <T, E>(
  fn: () => T & NotPromise<T>,
  onError: (e: unknown) => E,
): Result<T, E> => {
  try {
    return ok(fn());
  } catch (e) {
    return err(onError(e));
  }
};

export { try_ as try };

/**
 * 例外を投げうる非同期関数を実行し、ResultAsync に変換する
 *
 * fn が同期的に例外を投げた場合や reject した場合も Failure になる
 */
export const tryAsync = async <T, E>(
  fn: () => Promise<T>,
  onError: (e: unknown) => E,
): ResultAsync<T, E> => {
  try {
    return ok(await fn());
  } catch (e) {
    return err(onError(e));
  }
};

// ----------------------------------------------------------------------------
// 変換 (すべて同期 / data-first)
//   非同期処理の合成は flowAsync か、async/await と isErr による早期 return で書く
// ----------------------------------------------------------------------------

/** 成功値を変換する */
export const map = <T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> =>
  isOk(r) ? ok(fn(r.value)) : r;

/** エラーを変換する */
export const mapError = <T, E, F>(
  r: Result<T, E>,
  fn: (e: E) => F,
): Result<T, F> => (isErr(r) ? err(fn(r.error)) : r);

/** 成功値から次の Result を返す処理につなげる */
export const andThen = <T, U, E, F>(
  r: Result<T, E>,
  fn: (v: T) => Result<U, F>,
): Result<U, E | F> => (isOk(r) ? fn(r.value) : r);

/** 失敗時に別の Result を返す処理にフォールバックする */
export const orElse = <T, U, E, F>(
  r: Result<T, E>,
  fn: (e: E) => Result<U, F>,
): Result<T | U, F> => (isErr(r) ? fn(r.error) : r);

// ----------------------------------------------------------------------------
// flow (関数の連結)
// ----------------------------------------------------------------------------

// 関数の戻り値 X から、次の関数に渡る値の型を求める (Result なら中身、それ以外はそのまま)
type Val<X> =
  X extends Failure<unknown> ? never : X extends Success<infer T> ? T : X;

// 関数の戻り値 X から、エラーの型を求める (Failure を含まなければ never)
type Err<X> = X extends Failure<infer E> ? E : never;

// 値が Result かどうかを形で判定する (型の Val / Err と同じ判定基準)
// `ok()` / `ok(undefined)` は JSON を経由すると value が消えて `{ type: "Success" }` になるため、
// type だけを持つ object も Success とみなす
const isResult = (x: unknown): x is Result<unknown, unknown> => {
  if (typeof x !== "object" || x === null) return false;
  const t = (x as { type?: unknown }).type;
  if (t === "Failure") return "error" in x;
  if (t === "Success") return "value" in x || Object.keys(x).length === 1;
  return false;
};

/**
 * Result に関数を順に適用する
 *
 * - 各関数には直前の成功値が渡される
 * - 関数が Result を返せばそれを使い (andThen 相当)、それ以外の値なら ok で包む (map 相当)
 * - 途中で Failure になったら、残りの関数は呼ばずにその Failure を返す
 * - Promise を返す関数は渡せない (型エラー)。非同期には `flowAsync` を使う
 *
 * @example
 * ```typescript
 * const user = Result.flow(ok(req), getToken, tokenToUser);
 * // getToken: (req: Request) => Result<string, AuthError>
 * // tokenToUser: (token: string) => User
 * // user: Result<User, AuthError>
 * ```
 */
// <generated:flow> scripts/gen-flow-overloads.ts で生成 (bun run gen)。直接編集しないこと
export function flow<A, E, B1>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
): Result<Val<B1>, E | Err<B1>>;
export function flow<A, E, B1, B2>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
): Result<Val<B2>, E | Err<B1> | Err<B2>>;
export function flow<A, E, B1, B2, B3>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
  f3: (v: Val<B2>) => B3 & NotPromise<B3>,
): Result<Val<B3>, E | Err<B1> | Err<B2> | Err<B3>>;
export function flow<A, E, B1, B2, B3, B4>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
  f3: (v: Val<B2>) => B3 & NotPromise<B3>,
  f4: (v: Val<B3>) => B4 & NotPromise<B4>,
): Result<Val<B4>, E | Err<B1> | Err<B2> | Err<B3> | Err<B4>>;
export function flow<A, E, B1, B2, B3, B4, B5>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
  f3: (v: Val<B2>) => B3 & NotPromise<B3>,
  f4: (v: Val<B3>) => B4 & NotPromise<B4>,
  f5: (v: Val<B4>) => B5 & NotPromise<B5>,
): Result<Val<B5>, E | Err<B1> | Err<B2> | Err<B3> | Err<B4> | Err<B5>>;
export function flow<A, E, B1, B2, B3, B4, B5, B6>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
  f3: (v: Val<B2>) => B3 & NotPromise<B3>,
  f4: (v: Val<B3>) => B4 & NotPromise<B4>,
  f5: (v: Val<B4>) => B5 & NotPromise<B5>,
  f6: (v: Val<B5>) => B6 & NotPromise<B6>,
): Result<
  Val<B6>,
  E | Err<B1> | Err<B2> | Err<B3> | Err<B4> | Err<B5> | Err<B6>
>;
export function flow<A, E, B1, B2, B3, B4, B5, B6, B7>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
  f3: (v: Val<B2>) => B3 & NotPromise<B3>,
  f4: (v: Val<B3>) => B4 & NotPromise<B4>,
  f5: (v: Val<B4>) => B5 & NotPromise<B5>,
  f6: (v: Val<B5>) => B6 & NotPromise<B6>,
  f7: (v: Val<B6>) => B7 & NotPromise<B7>,
): Result<
  Val<B7>,
  E | Err<B1> | Err<B2> | Err<B3> | Err<B4> | Err<B5> | Err<B6> | Err<B7>
>;
export function flow<A, E, B1, B2, B3, B4, B5, B6, B7, B8>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
  f3: (v: Val<B2>) => B3 & NotPromise<B3>,
  f4: (v: Val<B3>) => B4 & NotPromise<B4>,
  f5: (v: Val<B4>) => B5 & NotPromise<B5>,
  f6: (v: Val<B5>) => B6 & NotPromise<B6>,
  f7: (v: Val<B6>) => B7 & NotPromise<B7>,
  f8: (v: Val<B7>) => B8 & NotPromise<B8>,
): Result<
  Val<B8>,
  | E
  | Err<B1>
  | Err<B2>
  | Err<B3>
  | Err<B4>
  | Err<B5>
  | Err<B6>
  | Err<B7>
  | Err<B8>
>;
export function flow<A, E, B1, B2, B3, B4, B5, B6, B7, B8, B9>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
  f3: (v: Val<B2>) => B3 & NotPromise<B3>,
  f4: (v: Val<B3>) => B4 & NotPromise<B4>,
  f5: (v: Val<B4>) => B5 & NotPromise<B5>,
  f6: (v: Val<B5>) => B6 & NotPromise<B6>,
  f7: (v: Val<B6>) => B7 & NotPromise<B7>,
  f8: (v: Val<B7>) => B8 & NotPromise<B8>,
  f9: (v: Val<B8>) => B9 & NotPromise<B9>,
): Result<
  Val<B9>,
  | E
  | Err<B1>
  | Err<B2>
  | Err<B3>
  | Err<B4>
  | Err<B5>
  | Err<B6>
  | Err<B7>
  | Err<B8>
  | Err<B9>
>;
export function flow<A, E, B1, B2, B3, B4, B5, B6, B7, B8, B9, B10>(
  a: Result<A, E>,
  f1: (v: A) => B1 & NotPromise<B1>,
  f2: (v: Val<B1>) => B2 & NotPromise<B2>,
  f3: (v: Val<B2>) => B3 & NotPromise<B3>,
  f4: (v: Val<B3>) => B4 & NotPromise<B4>,
  f5: (v: Val<B4>) => B5 & NotPromise<B5>,
  f6: (v: Val<B5>) => B6 & NotPromise<B6>,
  f7: (v: Val<B6>) => B7 & NotPromise<B7>,
  f8: (v: Val<B7>) => B8 & NotPromise<B8>,
  f9: (v: Val<B8>) => B9 & NotPromise<B9>,
  f10: (v: Val<B9>) => B10 & NotPromise<B10>,
): Result<
  Val<B10>,
  | E
  | Err<B1>
  | Err<B2>
  | Err<B3>
  | Err<B4>
  | Err<B5>
  | Err<B6>
  | Err<B7>
  | Err<B8>
  | Err<B9>
  | Err<B10>
>;
// </generated:flow>
export function flow(
  a: Result<unknown, unknown>,
  ...fns: ((v: unknown) => unknown)[]
): Result<unknown, unknown> {
  let cur = a;
  for (const fn of fns) {
    if (isErr(cur)) return cur;
    const out = fn(cur.value);
    cur = isResult(out) ? out : ok(out);
  }
  return cur;
}

/**
 * Result に (非同期を含む) 関数を順に適用する
 *
 * `flow` と同じ動きで、各関数は Promise を返してもよい。
 * どこで終わっても (途中で Failure になっても) 必ず Promise を返す
 *
 * @example
 * ```typescript
 * const user = await Result.flowAsync(ok(req), getToken, verifyToken, toUser);
 * // verifyToken: (token: string) => ResultAsync<Payload, AuthError>
 * ```
 */
// <generated:flowAsync> scripts/gen-flow-overloads.ts で生成 (bun run gen)。直接編集しないこと
export function flowAsync<A, E, B1>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
): ResultAsync<Val<Awaited<B1>>, E | Err<Awaited<B1>>>;
export function flowAsync<A, E, B1, B2>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
): ResultAsync<Val<Awaited<B2>>, E | Err<Awaited<B1>> | Err<Awaited<B2>>>;
export function flowAsync<A, E, B1, B2, B3>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
  f3: (v: Val<Awaited<B2>>) => B3,
): ResultAsync<
  Val<Awaited<B3>>,
  E | Err<Awaited<B1>> | Err<Awaited<B2>> | Err<Awaited<B3>>
>;
export function flowAsync<A, E, B1, B2, B3, B4>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
  f3: (v: Val<Awaited<B2>>) => B3,
  f4: (v: Val<Awaited<B3>>) => B4,
): ResultAsync<
  Val<Awaited<B4>>,
  E | Err<Awaited<B1>> | Err<Awaited<B2>> | Err<Awaited<B3>> | Err<Awaited<B4>>
>;
export function flowAsync<A, E, B1, B2, B3, B4, B5>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
  f3: (v: Val<Awaited<B2>>) => B3,
  f4: (v: Val<Awaited<B3>>) => B4,
  f5: (v: Val<Awaited<B4>>) => B5,
): ResultAsync<
  Val<Awaited<B5>>,
  | E
  | Err<Awaited<B1>>
  | Err<Awaited<B2>>
  | Err<Awaited<B3>>
  | Err<Awaited<B4>>
  | Err<Awaited<B5>>
>;
export function flowAsync<A, E, B1, B2, B3, B4, B5, B6>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
  f3: (v: Val<Awaited<B2>>) => B3,
  f4: (v: Val<Awaited<B3>>) => B4,
  f5: (v: Val<Awaited<B4>>) => B5,
  f6: (v: Val<Awaited<B5>>) => B6,
): ResultAsync<
  Val<Awaited<B6>>,
  | E
  | Err<Awaited<B1>>
  | Err<Awaited<B2>>
  | Err<Awaited<B3>>
  | Err<Awaited<B4>>
  | Err<Awaited<B5>>
  | Err<Awaited<B6>>
>;
export function flowAsync<A, E, B1, B2, B3, B4, B5, B6, B7>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
  f3: (v: Val<Awaited<B2>>) => B3,
  f4: (v: Val<Awaited<B3>>) => B4,
  f5: (v: Val<Awaited<B4>>) => B5,
  f6: (v: Val<Awaited<B5>>) => B6,
  f7: (v: Val<Awaited<B6>>) => B7,
): ResultAsync<
  Val<Awaited<B7>>,
  | E
  | Err<Awaited<B1>>
  | Err<Awaited<B2>>
  | Err<Awaited<B3>>
  | Err<Awaited<B4>>
  | Err<Awaited<B5>>
  | Err<Awaited<B6>>
  | Err<Awaited<B7>>
>;
export function flowAsync<A, E, B1, B2, B3, B4, B5, B6, B7, B8>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
  f3: (v: Val<Awaited<B2>>) => B3,
  f4: (v: Val<Awaited<B3>>) => B4,
  f5: (v: Val<Awaited<B4>>) => B5,
  f6: (v: Val<Awaited<B5>>) => B6,
  f7: (v: Val<Awaited<B6>>) => B7,
  f8: (v: Val<Awaited<B7>>) => B8,
): ResultAsync<
  Val<Awaited<B8>>,
  | E
  | Err<Awaited<B1>>
  | Err<Awaited<B2>>
  | Err<Awaited<B3>>
  | Err<Awaited<B4>>
  | Err<Awaited<B5>>
  | Err<Awaited<B6>>
  | Err<Awaited<B7>>
  | Err<Awaited<B8>>
>;
export function flowAsync<A, E, B1, B2, B3, B4, B5, B6, B7, B8, B9>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
  f3: (v: Val<Awaited<B2>>) => B3,
  f4: (v: Val<Awaited<B3>>) => B4,
  f5: (v: Val<Awaited<B4>>) => B5,
  f6: (v: Val<Awaited<B5>>) => B6,
  f7: (v: Val<Awaited<B6>>) => B7,
  f8: (v: Val<Awaited<B7>>) => B8,
  f9: (v: Val<Awaited<B8>>) => B9,
): ResultAsync<
  Val<Awaited<B9>>,
  | E
  | Err<Awaited<B1>>
  | Err<Awaited<B2>>
  | Err<Awaited<B3>>
  | Err<Awaited<B4>>
  | Err<Awaited<B5>>
  | Err<Awaited<B6>>
  | Err<Awaited<B7>>
  | Err<Awaited<B8>>
  | Err<Awaited<B9>>
>;
export function flowAsync<A, E, B1, B2, B3, B4, B5, B6, B7, B8, B9, B10>(
  a: Result<A, E> | ResultAsync<A, E>,
  f1: (v: A) => B1,
  f2: (v: Val<Awaited<B1>>) => B2,
  f3: (v: Val<Awaited<B2>>) => B3,
  f4: (v: Val<Awaited<B3>>) => B4,
  f5: (v: Val<Awaited<B4>>) => B5,
  f6: (v: Val<Awaited<B5>>) => B6,
  f7: (v: Val<Awaited<B6>>) => B7,
  f8: (v: Val<Awaited<B7>>) => B8,
  f9: (v: Val<Awaited<B8>>) => B9,
  f10: (v: Val<Awaited<B9>>) => B10,
): ResultAsync<
  Val<Awaited<B10>>,
  | E
  | Err<Awaited<B1>>
  | Err<Awaited<B2>>
  | Err<Awaited<B3>>
  | Err<Awaited<B4>>
  | Err<Awaited<B5>>
  | Err<Awaited<B6>>
  | Err<Awaited<B7>>
  | Err<Awaited<B8>>
  | Err<Awaited<B9>>
  | Err<Awaited<B10>>
>;
// </generated:flowAsync>
export async function flowAsync(
  a: Result<unknown, unknown> | ResultAsync<unknown, unknown>,
  ...fns: ((v: unknown) => unknown)[]
): ResultAsync<unknown, unknown> {
  let cur = await a;
  for (const fn of fns) {
    if (isErr(cur)) return cur;
    const out = await fn(cur.value);
    cur = isResult(out) ? out : ok(out);
  }
  return cur;
}

// ----------------------------------------------------------------------------
// sequence / collect (複数の Result をまとめる)
// ----------------------------------------------------------------------------

// まとめる対象: Result の配列 (タプル) か、Result を値に持つオブジェクト (内部実装用)
type ResultRecord<R> = readonly R[] | { readonly [key: string]: R };

// 公開 API の引数の制約。T 自身のキーで判定するので、index signature を持たない interface も受け取れる
type ShapeOf<T, R> = { readonly [K in keyof T]: R };

// 配列なら要素、オブジェクトなら値の型
type Item<T> = T extends readonly unknown[] ? T[number] : T[keyof T];

// 成功値の型 / エラーの型を取り出す
type OkOf<R> = R extends Success<infer V> ? V : never;
type ErrOf<R> = R extends Failure<infer E> ? E : never;

// 各 Result を成功値に置き換えた型 (タプルの形・オブジェクトのキーを保つ)
type Values<T> = { -readonly [K in keyof T]: OkOf<T[K]> };
type ValuesAsync<T> = { -readonly [K in keyof T]: OkOf<Awaited<T[K]>> };

// 配列 / オブジェクトを [キー, 値] の並びにする
const toEntries = <R>(x: ResultRecord<R>): [string | number, R][] =>
  Array.isArray(x)
    ? x.map((v, i): [number, R] => [i, v])
    : Object.entries(x as { [key: string]: R });

// 成功値を、入力と同じ形 (配列 / オブジェクト) に詰め直す
const pack = (
  isArray: boolean,
  entries: [string | number, unknown][],
): unknown =>
  isArray ? entries.map(([, v]) => v) : Object.fromEntries(entries);

const sequenceImpl = (
  x: ResultRecord<Result<unknown, unknown>>,
): Result<unknown, unknown> => {
  const values: [string | number, unknown][] = [];
  for (const [key, r] of toEntries(x)) {
    if (isErr(r)) return r;
    values.push([key, r.value]);
  }
  return ok(pack(Array.isArray(x), values));
};

const collectImpl = (
  x: ResultRecord<Result<unknown, unknown>>,
): Result<unknown, unknown[]> => {
  const values: [string | number, unknown][] = [];
  const errors: unknown[] = [];
  for (const [key, r] of toEntries(x)) {
    if (isErr(r)) errors.push(r.error);
    else values.push([key, r.value]);
  }
  return errors.length > 0 ? err(errors) : ok(pack(Array.isArray(x), values));
};

// ResultAsync を含む配列 / オブジェクトをすべて await する
const awaitAll = async (
  x: ResultRecord<Result<unknown, unknown> | ResultAsync<unknown, unknown>>,
): Promise<ResultRecord<Result<unknown, unknown>>> => {
  const entries = toEntries(x);
  const settled = await Promise.all(entries.map(([, r]) => r));
  return Array.isArray(x)
    ? settled
    : Object.fromEntries(entries.map(([k], i) => [k, settled[i]]));
};

/**
 * 複数の Result をまとめる。すべて成功なら成功値をまとめた Result、1 つでも失敗なら最初の Failure を返す
 *
 * - 配列 (タプル) とオブジェクトを受け取れ、入力と同じ形で成功値を返す
 * - 「最初」は入力の順番で決まる
 *
 * @example
 * ```typescript
 * Result.sequence([ok(1), ok("a")]); // ok([1, "a"])  型: Result<[number, string], never>
 * Result.sequence({ id: newId(x), mail: newEmail(y) }); // Result<{ id: Id; mail: Email }, ValidationError>
 * ```
 */
export const sequence = <const T extends ShapeOf<T, Result<unknown, unknown>>>(
  x: T,
): Result<Values<T>, ErrOf<Item<T>>> =>
  sequenceImpl(x as ResultRecord<Result<unknown, unknown>>) as Result<
    Values<T>,
    ErrOf<Item<T>>
  >;

/**
 * 複数の Result をまとめる。すべて成功なら成功値をまとめた Result、失敗があればすべてのエラーを配列で返す
 *
 * - 配列 (タプル) とオブジェクトを受け取れ、入力と同じ形で成功値を返す
 * - エラーは入力の順番に並ぶ
 *
 * @example
 * ```typescript
 * // フォームの全項目を検証し、エラーをまとめて返す
 * Result.collect({ id: newId(x), mail: newEmail(y) });
 * // Result<{ id: Id; mail: Email }, ValidationError[]>
 * ```
 */
export const collect = <const T extends ShapeOf<T, Result<unknown, unknown>>>(
  x: T,
): Result<Values<T>, ErrOf<Item<T>>[]> =>
  collectImpl(x as ResultRecord<Result<unknown, unknown>>) as Result<
    Values<T>,
    ErrOf<Item<T>>[]
  >;

/**
 * `sequence` の非同期版。Result と ResultAsync を混ぜて渡せ、必ず Promise を返す
 *
 * すべての完了を待ってから、入力の順番で最初の Failure を返す
 * (途中で失敗しても他の処理は止まらないため、完了を待つことで reject の取りこぼしを防ぐ)
 *
 * @example
 * ```typescript
 * const r = await Result.sequenceAsync({ user: fetchUser(id), posts: fetchPosts(id) });
 * // Result<{ user: User; posts: Post[] }, ApiError>
 * ```
 */
export const sequenceAsync = async <
  const T extends ShapeOf<
    T,
    Result<unknown, unknown> | ResultAsync<unknown, unknown>
  >,
>(
  x: T,
): ResultAsync<ValuesAsync<T>, ErrOf<Awaited<Item<T>>>> =>
  sequenceImpl(
    await awaitAll(
      x as ResultRecord<
        Result<unknown, unknown> | ResultAsync<unknown, unknown>
      >,
    ),
  ) as Result<ValuesAsync<T>, ErrOf<Awaited<Item<T>>>>;

/**
 * `collect` の非同期版。Result と ResultAsync を混ぜて渡せ、必ず Promise を返す
 *
 * @example
 * ```typescript
 * const r = await Result.collectAsync([saveA(a), saveB(b)]);
 * // Result<[A, B], DbError[]>
 * ```
 */
export const collectAsync = async <
  const T extends ShapeOf<
    T,
    Result<unknown, unknown> | ResultAsync<unknown, unknown>
  >,
>(
  x: T,
): ResultAsync<ValuesAsync<T>, ErrOf<Awaited<Item<T>>>[]> =>
  collectImpl(
    await awaitAll(
      x as ResultRecord<
        Result<unknown, unknown> | ResultAsync<unknown, unknown>
      >,
    ),
  ) as Result<ValuesAsync<T>, ErrOf<Awaited<Item<T>>>[]>;
