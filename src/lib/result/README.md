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
- **外部依存なし**: 実装は 1 ファイルです

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

3 つ以上の処理をつなげる場合は、次の `flow` / `flowAsync` を使います。

### 関数の連結 (flow / flowAsync)

| 関数 | 説明 |
| --- | --- |
| `flow(r, f1, f2, ...)` | 同期関数を順に適用する |
| `flowAsync(r, f1, f2, ...)` | 非同期を含む関数を順に適用し、必ず Promise を返す |

普通の関数をそのまま並べられます。各関数には直前の **成功値** が渡されます。

- 関数が Result を返したら、その Result を使う (`andThen` 相当)
- 関数が Result 以外の値を返したら、`succeed` で包む (`map` 相当)
- **途中で Failure になったら、その時点で残りの関数は呼ばずに Failure を返す**

```typescript
// getToken:    (req: Request) => Result<string, AuthError>
// tokenToUser: (token: string) => User
// saveUser:    (user: User) => Result<UserId, DbError>
const r = Result.flow(Result.succeed(req), getToken, tokenToUser, saveUser);
// r: Result<UserId, AuthError | DbError>
```

非同期関数を含む場合は `flowAsync` を使います。同期・非同期の関数を混ぜられ、最初の値に `ResultAsync` も渡せます。

```typescript
// verifyToken: (token: string) => ResultAsync<Payload, AuthError>
const r = await Result.flowAsync(
  Result.succeed(req),
  getToken,
  verifyToken,
  toUser,
);
// r: Result<User, AuthError>
```

> [!NOTE]
> - 最大 10 個の関数をつなげられます
> - `flow` に Promise を返す関数を渡すと型エラーになります
> - 関数が throw / reject した場合は Failure にならず、そのまま例外になります。例外を投げうる処理は `try` / `tryAsync` で Result に変換してから渡してください
> - `orElse` / `mapError` のような失敗側の処理は `flow` の中には書けません。`flow` の結果に対して呼んでください
> - Result かどうかは `{ type: "Success", value }` / `{ type: "Failure", error }` という形で判定します。成功値としてこの形のオブジェクトを返すと Result として扱われます (型の推論も同じ扱いになります)

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

変換関数 (`map`, `andThen` など) は同期の Result だけを受け取ります。非同期処理は `flowAsync` でつなげるか、async 関数の中で `await` と `isFailure` による早期 return でつなげます。

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
| `ok(v).andThen(f).map(g)` | `Result.pipe(r, Result.andThen(f), Result.map(g))` | `Result.flow(r, f, g)` |
| `okAsync(v).andThen(f).map(g)` | `Result.pipe(r, Result.andThen(f), Result.map(g))` | `Result.flowAsync(r, f, g)` |
