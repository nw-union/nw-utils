# @nw-union/nw-utils/lib/result

外部依存のない、最小限の Result 型ライブラリです。

例外を投げる代わりに「成功」か「失敗」かを値として返し、エラーを型で明示的に扱えるようにします。

```typescript
import { Result } from "@nw-union/nw-utils/lib/result";
```

## 特徴

- **plain object**: Result はクラスではなく、ただのオブジェクトです
- **同期関数のみ**: 変換関数 (`map` など) はすべて同期です。非同期は async/await で書きます
- **data-first**: `Result.map(result, fn)` のように、Result を第 1 引数に取ります
- **外部依存なし**: 実装は 1 ファイル、約 120 行です

## 型

```typescript
type Success<T> = { readonly type: "Success"; readonly value: T };
type Failure<E> = { readonly type: "Failure"; readonly error: E };

type Result<T, E> = Success<T> | Failure<E>;
type ResultAsync<T, E> = Promise<Result<T, E>>;
```

型は `Result.Result<T, E>` / `Result.ResultAsync<T, E>` として参照します。

```typescript
const parseAge = (s: string): Result.Result<number, ValidationError> => { ... };
const fetchUser = async (id: string): Result.ResultAsync<User, AppError> => { ... };
```

## API

### 生成

| 関数 | 説明 |
| --- | --- |
| `succeed(value)` | 成功の Result を作る。引数なしなら `Result<void, never>` |
| `fail(error)` | 失敗の Result を作る |
| `try(fn, onError)` | 同期関数を実行し、throw されたら `onError` の戻り値で Failure にする |
| `tryAsync(fn, onError)` | 非同期関数を実行し、reject (または同期的な throw) を Failure にする |

```typescript
Result.succeed(1); // { type: "Success", value: 1 }
Result.succeed(); // { type: "Success", value: undefined }
Result.fail(new ValidationError("invalid")); // { type: "Failure", error: ValidationError }

// 例外を投げうる処理を Result に変換する
const parsed = Result.try(
  () => JSON.parse(text) as unknown,
  (e) => new ValidationError(`Invalid JSON: ${(e as Error).message}`),
);

// 非同期処理を ResultAsync に変換する
const res = await Result.tryAsync(
  () => fetch(url),
  (e) => new SystemError(`Failed to fetch: ${(e as Error).message}`),
);
```

> [!WARNING]
> `Result.try` に Promise を返す関数を渡すと型エラーになります。非同期処理には `Result.tryAsync` を使ってください。
>
> ```typescript
> Result.try(async () => 1, toError); // ❌ 型エラー
> await Result.tryAsync(async () => 1, toError); // ✅
> ```

### 判定

| 関数 | 説明 |
| --- | --- |
| `isSuccess(r)` | 成功なら `true`。型ガードとして `r.value` にアクセスできるようになる |
| `isFailure(r)` | 失敗なら `true`。型ガードとして `r.error` にアクセスできるようになる |

```typescript
const r = newEmail(input);
if (Result.isFailure(r)) {
  logger.warn("invalid email", r.error); // r.error: ValidationError
  return;
}
sendMail(r.value); // r.value: Email
```

### 変換

| 関数 | 説明 |
| --- | --- |
| `map(r, fn)` | 成功値を `fn` で変換する。失敗ならそのまま |
| `mapError(r, fn)` | エラーを `fn` で変換する。成功ならそのまま |
| `andThen(r, fn)` | 成功値を Result を返す `fn` に渡す。失敗ならそのまま |
| `orElse(r, fn)` | 失敗時に Result を返す `fn` でフォールバックする。成功ならそのまま |

```typescript
// map: 成功値を変換
Result.map(toShortUuid(uuid), (s) => s.toUpperCase());

// mapError: エラーの種類を変える
Result.mapError(parsed, (e) => new SystemError(e.message, [], e));

// andThen: Result を返す処理をつなげる (エラー型は E | F になる)
Result.andThen(base64UrlDecode(short), bytesToUuid);

// orElse: 失敗したら別の方法を試す
Result.orElse(getTokenFromHeader(req, "Authorization"), () =>
  getTokenFromCookie(req, "token"),
);
```

3 つ以上の処理をつなげる場合は、ネストさせるよりも変数に分けて書く方が読みやすくなります。

```typescript
const bytes = uuidToBytes(uuid);
const short = Result.map(bytes, base64UrlEncode);
const upper = Result.map(short, (s) => s.toUpperCase());
```

### 取り出し

| 関数 | 説明 |
| --- | --- |
| `unwrap(r)` | 成功値を取り出す。失敗なら `error` を throw する |
| `unwrapError(r)` | エラーを取り出す。成功なら throw する |

throw するので、主にテストで使います。アプリケーションコードでは `isSuccess` / `isFailure` で分岐してください。

```typescript
expect(Result.unwrap(newEmail("a@example.com"))).toBe("a@example.com");
expect(Result.unwrapError(newEmail("invalid")).code).toBe("Validation Error");
```

## 非同期処理の書き方

変換関数 (`map`, `andThen` など) は同期の Result だけを受け取ります。非同期処理は async 関数の中で `await` と `isFailure` による早期 return でつなげます。

```typescript
const auth = async (req: Request): Result.ResultAsync<User, AuthError> => {
  // step.1 同期処理
  const token = getToken(req);
  if (Result.isFailure(token)) return token;

  // step.2 非同期処理
  const payload = await verifyToken(token.value);
  if (Result.isFailure(payload)) return payload;

  // step.3 同期の変換
  return Result.map(payload, toUser);
};
```

`ResultAsync` を返す関数は `async` 関数にしてください。どの分岐で return しても必ず Promise が返ります。

## パターンマッチ

Result は plain object なので、`ts-pattern` でそのまま分岐できます。

```typescript
import { match } from "ts-pattern";

const message = match(result)
  .with({ type: "Success" }, ({ value }) => `Hello, ${value.mail}`)
  .with({ type: "Failure" }, ({ error }) => `Error: ${error.message}`)
  .exhaustive();
```

## 他ライブラリとの対応

| neverthrow | @praha/byethrow | lib/result |
| --- | --- | --- |
| `ok(v)` / `err(e)` | `Result.succeed(v)` / `Result.fail(e)` | `Result.succeed(v)` / `Result.fail(e)` |
| `r.isOk()` / `r.isErr()` | `Result.isSuccess(r)` / `Result.isFailure(r)` | `Result.isSuccess(r)` / `Result.isFailure(r)` |
| `r.map(f)` | `Result.pipe(r, Result.map(f))` | `Result.map(r, f)` |
| `r.mapErr(f)` | `Result.pipe(r, Result.mapError(f))` | `Result.mapError(r, f)` |
| `r.andThen(f)` | `Result.pipe(r, Result.andThen(f))` | `Result.andThen(r, f)` |
| `r.orElse(f)` | `Result.pipe(r, Result.orElse(f))` | `Result.orElse(r, f)` |
| `Result.fromThrowable(fn, onErr)()` | `Result.try({ try, catch })` | `Result.try(fn, onError)` |
| `ResultAsync.fromPromise(p, onErr)` | `Result.try({ try, catch })` | `Result.tryAsync(fn, onError)` |
| `r._unsafeUnwrap()` | `Result.unwrap(r)` | `Result.unwrap(r)` |
| `r._unsafeUnwrapErr()` | `Result.unwrapError(r)` | `Result.unwrapError(r)` |
| `okAsync(v).andThen(...)` | `Result.pipe(...)` | async 関数 + `isFailure` で早期 return |
