# @nw-union/nw-utils/lib/result

外部依存のない、最小限の Result 型ライブラリです。

例外を投げる代わりに「成功」か「失敗」かを値として返し、エラーを型で明示的に扱えるようにします。

```typescript
import { err, ok, Result } from "@nw-union/nw-utils/lib/result";
```

`ok` / `err` は `Result.ok` / `Result.err` と同じものです。よく使うので直接 import できるようにしています。

## 特徴

- **neverthrow に近い書き味**: `ok(v)` / `err(e)` で作り、`r.isOk()` / `r.isErr()` で判定します
- **クラスを使わない**: Result は `{ type, value }` / `{ type, error }` だけを持つ frozen object です。`isOk` / `isErr` は全 Result で共有する 1 つのプロトタイプにだけ置いています
- **同期関数のみ**: 変換関数 (`map` など) はすべて同期です。非同期は `flowAsync` か async/await で書きます
- **data-first**: `Result.map(result, fn)` のように、Result を第 1 引数に取ります
- **外部依存なし**: 実装は 1 ファイルです

## 型

```typescript
type Success<T> = { readonly type: "Success"; readonly value: T } & { isOk(); isErr() };
type Failure<E> = { readonly type: "Failure"; readonly error: E } & { isOk(); isErr() };

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
| `ok(value)` | 成功の Result を作る。引数なしなら `Result<void, never>` |
| `err(error)` | 失敗の Result を作る |
| `try(fn, onError)` | 同期関数を実行し、throw されたら `onError` の戻り値で Failure にする |
| `tryAsync(fn, onError)` | 非同期関数を実行し、reject (または同期的な throw) を Failure にする |

```typescript
ok(1); // { type: "Success", value: 1 }
ok(); // { type: "Success", value: undefined }
err(new ValidationError("invalid")); // { type: "Failure", error: ValidationError }

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
| `r.isOk()` | 成功なら `true`。型ガードとして `r.value` にアクセスできるようになる |
| `r.isErr()` | 失敗なら `true`。型ガードとして `r.error` にアクセスできるようになる |

```typescript
const r = newEmail(input);
if (r.isErr()) {
  logger.warn("invalid email", r.error); // r.error: ValidationError
  return;
}
sendMail(r.value); // r.value: Email
```

`isErr()` で絞り込んだ Failure は、成功値の型が違う関数からもそのまま返せます。

```typescript
const toUser = (r: Result.Result<string, AuthError>): Result.Result<User, AuthError> => {
  if (r.isErr()) return r; // err(r.error) と書き直さなくてよい
  return ok({ mail: r.value });
};
```

> [!NOTE]
> Result の実体は「共有プロトタイプ + own プロパティ (`type`, `value` / `error`)」です。次の操作をするとメソッドが失われるので、Result として扱いたい場合は `ok` / `err` で作り直してください。
> - スプレッド (`{ ...r }`) や `structuredClone`
> - `JSON.stringify` → `JSON.parse` (JSON に出るのは `{"type":"Success","value":...}` だけ)

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
- 関数が Result 以外の値を返したら、`ok` で包む (`map` 相当)
- **途中で Failure になったら、その時点で残りの関数は呼ばずに Failure を返す**

```typescript
// getToken:    (req: Request) => Result<string, AuthError>
// tokenToUser: (token: string) => User
// saveUser:    (user: User) => Result<UserId, DbError>
const r = Result.flow(ok(req), getToken, tokenToUser, saveUser);
// r: Result<UserId, AuthError | DbError>
```

非同期関数を含む場合は `flowAsync` を使います。同期・非同期の関数を混ぜられ、最初の値に `ResultAsync` も渡せます。

```typescript
// verifyToken: (token: string) => ResultAsync<Payload, AuthError>
const r = await Result.flowAsync(
  ok(req),
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
> - Result かどうかは `ok` / `err` で作られたかどうかで判定します。`{ type: "Failure", error }` のような形のデータを返しても Result としては扱われません (型の推論も同じ扱いになります)

### 取り出し

| 関数 | 説明 |
| --- | --- |
| `unwrap(r)` | 成功値を取り出す。失敗なら `error` を throw する |
| `unwrapError(r)` | エラーを取り出す。成功なら throw する |

throw するので、主にテストで使います。アプリケーションコードでは `r.isOk()` / `r.isErr()` で分岐してください。

```typescript
expect(Result.unwrap(newEmail("a@example.com"))).toBe("a@example.com");
expect(Result.unwrapError(newEmail("invalid")).code).toBe("Validation Error");
```

## 非同期処理の書き方

変換関数 (`map`, `andThen` など) は同期の Result だけを受け取ります。非同期処理は `flowAsync` でつなげるか、async 関数の中で `await` と `r.isErr()` による早期 return でつなげます。

```typescript
const auth = async (req: Request): Result.ResultAsync<User, AuthError> => {
  // step.1 同期処理
  const token = getToken(req);
  if (token.isErr()) return token;

  // step.2 非同期処理
  const payload = await verifyToken(token.value);
  if (payload.isErr()) return payload;

  // step.3 同期の変換
  return Result.map(payload, toUser);
};
```

`ResultAsync` を返す関数は `async` 関数にしてください。どの分岐で return しても必ず Promise が返ります。

## パターンマッチ

Result は `type` を持つオブジェクトなので、`ts-pattern` でそのまま分岐できます。

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
| `ok(v)` / `err(e)` | `Result.succeed(v)` / `Result.fail(e)` | `ok(v)` / `err(e)` |
| `r.isOk()` / `r.isErr()` | `Result.isSuccess(r)` / `Result.isFailure(r)` | `r.isOk()` / `r.isErr()` |
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
