# @nw-union/nw-utils/lib/rslt

外部依存のない、最小限の Result 型ライブラリです。

例外を投げる代わりに「成功」か「失敗」かを値として返し、エラーを型で明示的に扱えるようにします。

```typescript
import { err, isErr, ok, pipe, rslt, type Result } from "@nw-union/nw-utils/lib/rslt";

const r: Result<number, Error> = pipe(ok(1), rslt.map((n) => n + 1));
```

- よく使うもの (`ok` / `err` / `isOk` / `isErr` / `pipe` / `flow` / `flowAsync` / `through` / `throughAsync` / `sequence` / `collect` と型) は名前で import します
- それ以外 (`map` / `mapErr` / `andThen` / `orElse` / `try` / `tryAsync` など) は `rslt` を import して `rslt.map` のように使います。`map` のような一般的な名前を直接 import すると利用側の名前とぶつかりやすく、`try` は予約語なので単独の名前としては import できないためです

## 特徴

- **neverthrow に近い名前**: `ok(v)` / `err(e)` で作り、`isOk(r)` / `isErr(r)` で判定します
- **plain object**: Result はクラスではなく、`{ type, value }` / `{ type, error }` だけを持つ frozen object です。スプレッドや JSON への変換をしてもデータとして扱えます
- **tree-shaking が効く**: すべて独立した関数として export しているので、import した関数 (と、その関数が内部で使う関数) だけがバンドルに入ります。`rslt.map` のように `rslt` 経由で使っても同じです。`ok` と `isOk` だけなら 113 bytes、全部入りでも約 1.8KB (minify 後)
- **同期関数のみ**: 変換関数 (`rslt.map` など) はすべて同期です。非同期は `flowAsync` か async/await で書きます
- **data-last**: `rslt.map(fn)` は「Result を受け取って変換する関数」を返します。`pipe` の中に並べて使います
- **外部依存なし**: 実装は 1 ファイルです

## 型

```typescript
type Success<T> = { readonly type: "Success"; readonly value: T };
type Failure<E> = { readonly type: "Failure"; readonly error: E };

type Result<T, E> = Success<T> | Failure<E>;
type ResultAsync<T, E> = Promise<Result<T, E>>;
```

型は `Result<T, E>` / `ResultAsync<T, E>` として参照します。

```typescript
const parseAge = (s: string): Result<number, ValidationError> => { ... };
const fetchUser = async (id: string): ResultAsync<User, AppError> => { ... };
```

## API

### 生成

| 関数 | 説明 |
| --- | --- |
| `ok(value)` | 成功の Result を作る。引数なしなら `Result<void, never>` |
| `err(error)` | 失敗の Result を作る |
| `rslt.try(fn, onError)` | 同期関数を実行し、throw されたら `onError` の戻り値で Failure にする |
| `rslt.tryAsync(fn, onError)` | 非同期関数を実行し、reject (または同期的な throw) を Failure にする |

```typescript
ok(1); // { type: "Success", value: 1 }
ok(); // { type: "Success", value: undefined }
err(new ValidationError("invalid")); // { type: "Failure", error: ValidationError }

// 例外を投げうる処理を Result に変換する
const parsed = rslt.try(
  () => JSON.parse(text) as unknown,
  (e) => new ValidationError(`Invalid JSON: ${(e as Error).message}`),
);

// 非同期処理を ResultAsync に変換する
const res = await rslt.tryAsync(
  () => fetch(url),
  (e) => new SystemError(`Failed to fetch: ${(e as Error).message}`),
);
```

> [!WARNING]
> `rslt.try` に Promise を返す関数を渡すと型エラーになります。非同期処理には `rslt.tryAsync` を使ってください。
>
> ```typescript
> rslt.try(async () => 1, toError); // ❌ 型エラー
> await rslt.tryAsync(async () => 1, toError); // ✅
> ```

### 判定

| 関数 | 説明 |
| --- | --- |
| `isOk(r)` | 成功なら `true`。型ガードとして `r.value` にアクセスできるようになる |
| `isErr(r)` | 失敗なら `true`。型ガードとして `r.error` にアクセスできるようになる |

```typescript
const r = newEmail(input);
if (isErr(r)) {
  logger.warn("invalid email", r.error); // r.error: ValidationError
  return;
}
sendMail(r.value); // r.value: Email
```

`isErr` で絞り込んだ Failure は、成功値の型が違う関数からもそのまま返せます。

```typescript
const toUser = (r: Result<string, AuthError>): Result<User, AuthError> => {
  if (isErr(r)) return r; // err(r.error) と書き直さなくてよい
  return ok({ mail: r.value });
};
```

### 変換 (pipe)

変換関数は、関数を渡すと「Result を受け取って変換する関数」を返します (data-last)。`pipe` で Result を左から順に通して使います。

`r` は `Result<T, E>` とします。

| # | 関数 | f の型 | 最終的に返すもの | 動き |
| --- | --- | --- | --- | --- |
| 1 | `rslt.map(f)` | `T => U` | `Result<U, E>` | 成功値を変換する |
| 2 | `rslt.andThen(f)` | `T => Result<U, F>` | `Result<U, E \| F>` | 成功値を、Result を返す処理につなげる。`f` が Failure ならその Failure を返す |
| 3 | `rslt.andThrough(f)` | `T => Result<unknown, F>` | `Result<T, E \| F>` | `f` を実行する。`f` が Success なら元の成功値を返し、Failure ならその Failure を返す |
| 4 | `rslt.andTee(f)` | `T => unknown` | `Result<T, E>` | `f` を実行して結果を捨て、常に元の成功値を返す。`f` の例外も握りつぶす |
| 5 | `rslt.mapErr(f)` | `E => F` | `Result<T, F>` | エラーを変換する |
| 6 | `rslt.orElse(f)` | `E => Result<U, F>` | `Result<T \| U, F>` | 失敗時に、別の Result で回復を試みる。`f` が Success ならその値、Failure ならその Failure を返す |
| 7 | `rslt.orThrough(f)` | `E => Result<unknown, F>` | `Result<T, E \| F>` | `f` を実行する。`f` が Success なら元のエラーを返し、Failure ならその Failure を返す |
| 8 | `rslt.orTee(f)` | `E => unknown` | `Result<T, E>` | `f` を実行して結果を捨て、常に元のエラーを返す。`f` の例外も握りつぶす |

1〜4 は、`r` が Failure なら `f` を呼ばずに元の Failure を返します。5〜8 は、`r` が Success なら `f` を呼ばずに元の Success を返します。

- **Through と Tee の使い分け**: `Through` は「失敗しうる処理を挟み、失敗したら止めたい」とき (検証、失敗の記録など)、`Tee` は「失敗しても本筋に影響させたくない」副作用のとき (ログ、メトリクス送信など) に使います
- **Tee の例外の扱い**: `andTee` / `orTee` は、`f` が投げた例外も、`f` が返した Promise の reject も握りつぶします。Promise の完了は待ちません

```typescript
const r = pipe(
  newEmail(input),                          // Result<Email, ValidationError>
  rslt.map((email) => email.toLowerCase()), // 引数の型は直前の成功値から推論される
  rslt.andThrough(checkNotBlocked),         // (email) => Result<void, BlockedError>
  rslt.andThen(findUserByEmail),            // (email) => Result<User, NotFoundError>
  rslt.mapErr((e) => toAppError(e)),
);
// r: Result<User, AppError>

// 失敗したら別の方法を試す
const token = pipe(
  getTokenFromHeader(req, "Authorization"),
  rslt.orElse(() => getTokenFromCookie(req, "token")),
);
```

`pipe` は Result 専用ではなく、引数を 1 つ受け取る関数なら何でも並べられます (最大 10 個)。

`rslt.map(f)` などは、`pipe` を使わずに直接呼ぶこともできます。その場合は、`f` の引数の型を書く必要があります (どの Result に使われるか、作った時点では分からないため)。

```typescript
const double = rslt.map((n: number) => n * 2); // (r: Result<number, E>) => Result<number, E>
double(ok(3)); // ok(6)
rslt.map((n: number) => n + 1)(ok(1)); // ok(2)
```

#### pipe と flow の使い分け

| | `pipe` | `flow` / `flowAsync` |
| --- | --- | --- |
| 並べる関数 | `rslt.map(f)` など、**Result を受け取る**関数 | **成功値を受け取る**普通の関数 |
| `map` / `andThen` の区別 | `rslt.map` / `rslt.andThen` で明示する | 戻り値が Result かどうかで自動で決まる |
| 失敗側の処理 (`mapErr` / `orElse` / `orThrough` / `orTee`) | 途中に書ける | 書けない (結果に対して `pipe` などで行う) |
| 非同期 | なし (同期のみ) | `flowAsync` |

```typescript
// 同じ処理を pipe と flow で書く
pipe(ok(req), rslt.andThen(getToken), rslt.map(tokenToUser));
flow(ok(req), getToken, tokenToUser);
```

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
const r = flow(ok(req), getToken, tokenToUser, saveUser);
// r: Result<UserId, AuthError | DbError>
```

非同期関数を含む場合は `flowAsync` を使います。同期・非同期の関数を混ぜられ、最初の値に `ResultAsync` も渡せます。

```typescript
// verifyToken: (token: string) => ResultAsync<Payload, AuthError>
const r = await flowAsync(ok(req), getToken, verifyToken, toUser);
// r: Result<User, AuthError>
```

> [!NOTE]
> - 最大 10 個の関数をつなげられます
> - `flow` に Promise を返す関数を渡すと型エラーになります
> - 関数が throw / reject した場合は Failure にならず、そのまま例外になります。例外を投げうる処理は `rslt.try` / `rslt.tryAsync` で Result に変換してから渡してください
> - `rslt.orElse` / `rslt.mapErr` のような失敗側の処理は `flow` の中には書けません。`flow` の結果に対して呼んでください
> - Result かどうかは `{ type: "Success", value }` / `{ type: "Failure", error }` という形で判定します。成功値としてこの形のオブジェクトを返すと Result として扱われます (型の推論も同じ扱いになります)

#### 値を変えない処理を挟む (through / throughAsync)

ログ出力や、値を変えない検証 (権限チェックなど) を `flow` の途中に挟みたいときは `through` で包みます。包んだ関数の戻り値は捨てられ、**直前の成功値がそのまま次の関数に渡ります**。

| 関数 | 説明 |
| --- | --- |
| `through(fn)` | `flow` 用。`fn` を実行し、直前の成功値をそのまま次に渡す |
| `throughAsync(fn)` | `flowAsync` 用。`fn` は Promise を返してもよい |

- `fn` が `void` / 成功の Result / それ以外の値を返したら、直前の成功値をそのまま次に渡す
- `fn` が Failure を返したら、そこで止まってその Failure を返す
- エラー型には `fn` が返しうる Failure の型だけが足される (`void` を返す関数ならエラー型は増えない)

```typescript
// checkNotRevoked: (token: string) => Result<void, AuthError>
// logToken:        (token: string) => void
// saveAccessLog:   (token: string) => ResultAsync<void, DbError>
const user = flow(
  ok(req),
  getToken,                  // Result<string, AuthError>
  through(checkNotRevoked),  // 失効していたらここで止まる
  through(logToken),         // ログを出すだけ
  tokenToUser,               // getToken の結果 (token) がそのまま渡る
);
// user: Result<User, AuthError>

const user2 = await flowAsync(ok(req), getToken, throughAsync(saveAccessLog), tokenToUser);
// user2: Result<User, AuthError | DbError>
```

`pipe` の中では、`rslt.andThrough(fn)` (Result を返す処理) か `rslt.andTee(fn)` (副作用) を使います。`flow` の関数は成功値を受け取り、`pipe` の関数は Result を受け取るため、使い分けが必要です。

```typescript
const r = pipe(
  newEmail(input),
  rslt.andThrough(checkNotBlocked),           // Failure なら止まる
  rslt.andTee((email) => logger.info(email)), // 例外が出ても無視
);
```

> [!NOTE]
> `through` / `throughAsync` は `f` の戻り値が Result でも `void` でも受け取れます (Failure なら止まり、それ以外は無視)。`f` の例外は握りつぶしません。

> [!NOTE]
> `through` に Promise を返す関数を渡すと型エラーになります。非同期の処理は `throughAsync` を `flowAsync` の中で使ってください。

### 複数の Result をまとめる (sequence / collect)

| 関数 | 説明 |
| --- | --- |
| `sequence(x)` | すべて成功なら成功値をまとめた Result。1 つでも失敗なら **最初の** Failure を返す |
| `collect(x)` | すべて成功なら成功値をまとめた Result。失敗があれば **すべての** エラーを配列で返す |
| `sequenceAsync(x)` | `sequence` の非同期版 |
| `collectAsync(x)` | `collect` の非同期版 |

配列 (タプル) とオブジェクトのどちらも受け取れ、入力と同じ形で成功値を返します。型もタプルの並び・オブジェクトのキーを保ちます。

```typescript
// タプル
sequence([newId(x), newEmail(y)]);
// Result<[Id, Email], ValidationError>

// オブジェクト
sequence({ id: newId(x), mail: newEmail(y) });
// Result<{ id: Id; mail: Email }, ValidationError>

// フォームの全項目を検証し、エラーをまとめて返す
collect({ id: newId(x), mail: newEmail(y) });
// Result<{ id: Id; mail: Email }, ValidationError[]>
```

非同期版は Result と ResultAsync を混ぜて渡せ、必ず Promise を返します。

```typescript
const r = await sequenceAsync({ user: fetchUser(id), posts: fetchPosts(id) });
// Result<{ user: User; posts: Post[] }, ApiError>
```

> [!NOTE]
> - 「最初の Failure」は **入力の順番** で決まります (先に終わった失敗ではありません)。エラーの配列も入力の順番に並びます
> - 非同期版は `Promise.all` ですべての完了を待ってから結果を返します。途中で失敗しても待つのは、すでに走り出している他の処理を止められず、その reject を取りこぼさないためです
> - 処理が並列に走るのは、`fetchUser(id)` などを呼んだ時点です。`sequenceAsync` / `collectAsync` は完了を待つだけです

## 非同期処理の書き方

変換関数 (`rslt.map`, `rslt.andThen` など) は同期の Result だけを受け取ります。非同期処理は `flowAsync` でつなげるか、async 関数の中で `await` と `isErr` による早期 return でつなげます。

```typescript
const auth = async (req: Request): ResultAsync<User, AuthError> => {
  // step.1 同期処理
  const token = getToken(req);
  if (isErr(token)) return token;

  // step.2 非同期処理
  const payload = await verifyToken(token.value);
  if (isErr(payload)) return payload;

  // step.3 同期の変換
  return pipe(payload, rslt.map(toUser));
};
```

`ResultAsync` を返す関数は `async` 関数にしてください。どの分岐で return しても必ず Promise が返ります。

## 実装上の注意

### Object.freeze のコスト

`ok` / `err` は作った Result を `Object.freeze` で書き換え不可にしています。型でも `readonly` にしていますが、JS から直接書き換えられる経路も塞ぐためです。

その代わり、Result を作るたびに freeze の分だけわずかにコストがかかります。`flow` / `flowAsync` でも、値を返すステップごとに `ok` で包むので同じです。通常の用途では問題になりませんが、大量の Result をループで作るような処理 (CSV の全行の検証など) ではこの点を意識してください。

### JSON を経由した Result

`ok()` / `ok(undefined)` を JSON にすると、`value` が消えて `{"type":"Success"}` になります。`isOk` は `type` だけで判定するので、そのまま成功として扱えます。`flow` / `flowAsync` も、`type` だけを持つオブジェクトは Success として扱います。

ただし `JSON.parse` の結果は `any` なので、型は保証されません。外部から受け取ったデータは、バリデーションしてから Result として使ってください。

## パターンマッチ

Result は plain object なので、`ts-pattern` でそのまま分岐できます。

```typescript
import { match } from "ts-pattern";

const message = match(result)
  .with({ type: "Success" }, ({ value }) => `Hello, ${value.mail}`)
  .with({ type: "Failure" }, ({ error }) => `Error: ${error.message}`)
  .exhaustive();
```

## テストでの書き方

値を取り出す `unwrap` のような関数はありません。Result は plain object なので、そのまま比較できます。

```typescript
expect(parseAge("20")).toEqual(ok(20));

// エラーの中身を調べたい場合は isErr で絞り込む
const r = newEmail("invalid");
expect(isErr(r)).toBe(true);
if (isErr(r)) expect(r.error.code).toBe("Validation Error");
```

## 他ライブラリとの対応

| neverthrow | @praha/byethrow | lib/rslt |
| --- | --- | --- |
| `ok(v)` / `err(e)` | `Result.succeed(v)` / `Result.fail(e)` | `ok(v)` / `err(e)` |
| `r.isOk()` / `r.isErr()` | `Result.isSuccess(r)` / `Result.isFailure(r)` | `isOk(r)` / `isErr(r)` |
| `r.map(f)` | `Result.pipe(r, Result.map(f))` | `pipe(r, rslt.map(f))` |
| `r.mapErr(f)` | `Result.pipe(r, Result.mapError(f))` | `pipe(r, rslt.mapErr(f))` |
| `r.andThen(f)` | `Result.pipe(r, Result.andThen(f))` | `pipe(r, rslt.andThen(f))` |
| `r.orElse(f)` | `Result.pipe(r, Result.orElse(f))` | `pipe(r, rslt.orElse(f))` |
| `Result.fromThrowable(fn, onErr)()` | `Result.try({ try, catch })` | `rslt.try(fn, onError)` |
| `ResultAsync.fromPromise(p, onErr)` | `Result.try({ try, catch })` | `rslt.tryAsync(fn, onError)` |
| `Result.combine([...])` | `Result.sequence(x)` | `sequence(x)` |
| `Result.combineWithAllErrors([...])` | `Result.collect(x)` | `collect(x)` |
| `ResultAsync.combine([...])` | `Result.sequence(x)` | `sequenceAsync(x)` |
| `ResultAsync.combineWithAllErrors([...])` | `Result.collect(x)` | `collectAsync(x)` |
| `r.andThrough(f)` | `Result.pipe(r, Result.andThrough(f))` | `pipe(r, rslt.andThrough(f))` / `flow` の中では `through(f)` |
| `r.andTee(f)` | `Result.pipe(r, Result.inspect(f))` (例外は握りつぶさない) | `pipe(r, rslt.andTee(f))` |
| なし | `Result.pipe(r, Result.orThrough(f))` | `pipe(r, rslt.orThrough(f))` |
| `r.orTee(f)` | `Result.pipe(r, Result.inspectError(f))` (例外は握りつぶさない) | `pipe(r, rslt.orTee(f))` |
| `r._unsafeUnwrap()` | `Result.unwrap(r)` | なし (`toEqual(ok(v))` か `isOk` で絞り込む) |
| `ok(v).andThen(f).map(g)` | `Result.pipe(r, Result.andThen(f), Result.map(g))` | `flow(r, f, g)` |
| `okAsync(v).andThen(f).map(g)` | `Result.pipe(r, Result.andThen(f), Result.map(g))` | `flowAsync(r, f, g)` |
