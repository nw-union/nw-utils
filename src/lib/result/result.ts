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

// Promise を返す関数を同期の try に渡せないようにするための型
type NotPromise<T> = T extends PromiseLike<unknown> ? never : unknown;

// ----------------------------------------------------------------------------
// 生成
// ----------------------------------------------------------------------------

/** 成功の Result を作る */
export function succeed(): Result<void, never>;
export function succeed<T>(value: T): Result<T, never>;
export function succeed<T>(value?: T): Result<T | undefined, never> {
  return { type: "Success", value };
}

/** 失敗の Result を作る */
export const fail = <E>(error: E): Result<never, E> => ({
  type: "Failure",
  error,
});

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
    return succeed(fn());
  } catch (e) {
    return fail(onError(e));
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
    return succeed(await fn());
  } catch (e) {
    return fail(onError(e));
  }
};

// ----------------------------------------------------------------------------
// 判定
// ----------------------------------------------------------------------------

/** 成功かどうか (型ガード) */
export const isSuccess = <T, E>(r: Result<T, E>): r is Success<T> =>
  r.type === "Success";

/** 失敗かどうか (型ガード) */
export const isFailure = <T, E>(r: Result<T, E>): r is Failure<E> =>
  r.type === "Failure";

// ----------------------------------------------------------------------------
// 変換 (すべて同期 / data-first)
//   非同期処理の合成は async/await と isFailure による早期 return で書く
// ----------------------------------------------------------------------------

/** 成功値を変換する */
export const map = <T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> =>
  isSuccess(r) ? succeed(fn(r.value)) : r;

/** エラーを変換する */
export const mapError = <T, E, F>(
  r: Result<T, E>,
  fn: (e: E) => F,
): Result<T, F> => (isFailure(r) ? fail(fn(r.error)) : r);

/** 成功値から次の Result を返す処理につなげる */
export const andThen = <T, U, E, F>(
  r: Result<T, E>,
  fn: (v: T) => Result<U, F>,
): Result<U, E | F> => (isSuccess(r) ? fn(r.value) : r);

/** 失敗時に別の Result を返す処理にフォールバックする */
export const orElse = <T, U, E, F>(
  r: Result<T, E>,
  fn: (e: E) => Result<U, F>,
): Result<T | U, F> => (isFailure(r) ? fn(r.error) : r);

// ----------------------------------------------------------------------------
// flow (関数の連結)
// ----------------------------------------------------------------------------

// 関数の戻り値 X から、次の関数に渡る値の型を求める (Result なら中身、それ以外はそのまま)
type Val<X> =
  X extends Failure<unknown> ? never : X extends Success<infer T> ? T : X;

// 関数の戻り値 X から、エラーの型を求める (Failure を含まなければ never)
type Err<X> = X extends Failure<infer E> ? E : never;

// 値が Result かどうかを形で判定する (型の Val / Err と同じ判定基準)
const isResult = (x: unknown): x is Result<unknown, unknown> => {
  if (typeof x !== "object" || x === null) return false;
  const t = (x as { type?: unknown }).type;
  return (t === "Success" && "value" in x) || (t === "Failure" && "error" in x);
};

/**
 * Result に関数を順に適用する
 *
 * - 各関数には直前の成功値が渡される
 * - 関数が Result を返せばそれを使い (andThen 相当)、それ以外の値なら succeed で包む (map 相当)
 * - 途中で Failure になったら、残りの関数は呼ばずにその Failure を返す
 * - Promise を返す関数は渡せない (型エラー)。非同期には `flowAsync` を使う
 *
 * @example
 * ```typescript
 * const user = Result.flow(Result.succeed(req), getToken, tokenToUser);
 * // getToken: (req: Request) => Result<string, AuthError>
 * // tokenToUser: (token: string) => User
 * // user: Result<User, AuthError>
 * ```
 */
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
export function flow(
  a: Result<unknown, unknown>,
  ...fns: ((v: unknown) => unknown)[]
): Result<unknown, unknown> {
  let cur = a;
  for (const fn of fns) {
    if (isFailure(cur)) return cur;
    const out = fn(cur.value);
    cur = isResult(out) ? out : succeed(out);
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
 * const user = await Result.flowAsync(Result.succeed(req), getToken, verifyToken, toUser);
 * // verifyToken: (token: string) => ResultAsync<Payload, AuthError>
 * ```
 */
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
export async function flowAsync(
  a: Result<unknown, unknown> | ResultAsync<unknown, unknown>,
  ...fns: ((v: unknown) => unknown)[]
): ResultAsync<unknown, unknown> {
  let cur = await a;
  for (const fn of fns) {
    if (isFailure(cur)) return cur;
    const out = await fn(cur.value);
    cur = isResult(out) ? out : succeed(out);
  }
  return cur;
}

// ----------------------------------------------------------------------------
// 取り出し
// ----------------------------------------------------------------------------

/** 成功値を取り出す。失敗の場合は error を throw する (主にテスト用) */
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (isFailure(r)) throw r.error;
  return r.value;
};

/** エラーを取り出す。成功の場合は throw する (主にテスト用) */
export const unwrapError = <T, E>(r: Result<T, E>): E => {
  if (isSuccess(r)) throw new Error("Called unwrapError on a Success");
  return r.error;
};
