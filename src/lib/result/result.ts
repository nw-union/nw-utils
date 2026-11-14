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
