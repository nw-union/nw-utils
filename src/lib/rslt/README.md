<samp>
<h1 align="center">@nw-union/nw-utils/lib/rslt</h1>

<p align="center">
外部依存のない、最小限の Result 型ライブラリ。<br/> 例外を投げる代わりに「成功」か「失敗」かを値として返し、エラーを型で扱えるようにします。
</p>

<br />

```typescript
import { err, isErr, ok, rslt, type Result } from "@nw-union/nw-utils/lib/rslt";

const parseAge = (s: string): Result<number, ValidationError> => {
  const n = Number(s);
  return Number.isInteger(n) ? ok(n) : err(new ValidationError("not a number"));
};

const r = parseAge(input);
if (isErr(r)) return r;   // r.error: ValidationError
console.log(r.value);     // r.value: number
```

## 型

```typescript
type Success<T> = { readonly type: "Success"; readonly value: T };
type Failure<E> = { readonly type: "Failure"; readonly error: E };

type Result<T, E> = Success<T> | Failure<E>;
type ResultAsync<T, E> = Promise<Result<T, E>>;
```

Result はクラスではなく、書き換え不可 (frozen) の普通のオブジェクトです。JSON にしたり、`lib/match` でそのまま分岐したりできます。

## 作る

| 関数 | 説明 |
| --- | --- |
| `ok(value)` | 成功の Result を作る。引数なしなら `Result<void, never>` |
| `err(error)` | 失敗の Result を作る |
| `rslt.try(fn, onError)` | 同期関数を実行し、throw されたら `onError(e)` を Failure にする |
| `rslt.tryAsync(fn, onError)` | 非同期関数を実行し、reject (同期的な throw も) を Failure にする |

```typescript
const json = rslt.try(() => JSON.parse(text), (e) => new ValidationError(String(e)));
const res = await rslt.tryAsync(() => fetch(url), (e) => new SystemError(String(e)));
```

`rslt.try` に Promise を返す関数を渡すと型エラーになります。非同期には `rslt.tryAsync` を使います。

## 分岐する

`isErr(r)` は型ガードです。絞り込むと `r.value` / `r.error` を使えます。

`isErr` で絞り込んだ Failure は、成功値の型が違う関数からもそのまま返せます。

```typescript
const toUser = (r: Result<string, AuthError>): Result<User, AuthError> => {
  if (isErr(r)) return r; // err(r.error) と書き直さなくてよい
  return ok({ mail: r.value });
};
```

### lib/match で値に変える

Result を最後に値 (レスポンス、メッセージなど) へ変えるときは、`lib/match` の `match` を使います。このライブラリに `match` / `fold` はありません。

```typescript
import { match, P } from "@nw-union/nw-utils/lib/match";

const status = match(findUser(id)) // Result<User, NotFoundError | ForbiddenError>
  .with({ type: "Success" }, ({ value }) => json(value, 200))
  .with({ type: "Failure", error: P.instanceOf(NotFoundError) }, () => json(null, 404))
  .with({ type: "Failure", error: P.instanceOf(ForbiddenError) }, () => json(null, 403))
  .exhaustive();
```

- `exhaustive()` を付けると、`Success` / `Failure` やエラーのクラスの分岐を書き忘れたときに型エラーになります
- `value` / `error` の中身でも分岐できます (`{ type: "Success", value: { role: "admin" } }` など)
- `rslt.pipe` の最後に `(r) => match(r)...exhaustive()` を置けば、変換から値への変換までを 1 つの式で書けます

## つなげる

つなげ方は 2 通りあります。

| | `step` / `stepAsync` | `rslt.pipe` |
| --- | --- | --- |
| 並べる関数 | **成功値を受け取る**普通の関数 | `rslt.map(f)` など、**Result を受け取る**関数 |
| `map` / `andThen` の区別 | 戻り値が Result かどうかで自動 | 明示する |
| 失敗側の処理 (`mapErr` など) | 書けない | 途中に書ける |
| 非同期 | `stepAsync` | なし |

```typescript
// 同じ処理を 2 通りで書く
step(ok(req), getToken, tokenToUser);
rslt.pipe(ok(req), rslt.andThen(getToken), rslt.map(tokenToUser));
```

### step / stepAsync

普通の関数をそのまま並べます。各関数には直前の**成功値**が渡ります。

- 関数が Result を返したら、その Result を使う (`andThen` 相当)
- Result 以外の値を返したら、`ok` で包む (`map` 相当)
- 途中で Failure になったら、残りの関数は呼ばずにその Failure を返す

値を変えない処理 (検証やログ) は `through` で包みます。包んだ関数の戻り値は捨てられ、直前の成功値がそのまま次に渡ります (Failure を返したらそこで止まる)。

```typescript
// getToken:        (req: Request) => Result<string, AuthError>
// checkNotRevoked: (token: string) => Result<void, AuthError>
// tokenToUser:     (token: string) => User

const user = step(
  ok(req),
  getToken,
  through(checkNotRevoked),
  tokenToUser,
);
// user: Result<User, AuthError>

// 非同期の関数を含むなら stepAsync / throughAsync。必ず Promise を返す
const user2 = await stepAsync(ok(req), getToken, verifyToken, throughAsync(saveLog), toUser);
```

失敗しても本筋に影響させたくない副作用 (ログなど) は `tee` で包みます。`through` のエラーを無視する版で、戻り値の Failure も、例外も Promise の reject も握りつぶし、直前の成功値をそのまま次に渡します (非同期の完了は待ちません)。

```typescript
const user = step(
  ok(req),
  getToken,
  tee((token) => logger.info(`token: ${token}`)), // 失敗しても無視
  tokenToUser,
);
```

- `step` / `through` に Promise を返す関数を渡すと型エラーになります
- 「`void` を返したら自動で素通り」にしないのは、実行時に `void` と `undefined` を区別できず、`User | undefined` を返す関数の結果を取り違えるためです

> [!NOTE]
> **`step` は書き心地を優先し、関数型の法則 (Functor / Monad の法則) を満たしません。**
> 戻り値が Result なら自動で平らにする (`andThen` 扱い) ため、JavaScript の `Promise.then` と同じく、`Result<Result<T, E>, F>` のような Result の入れ子を作れません。
>
> ```typescript
> const wrap = (n: number) => ok(n);
> rslt.pipe(ok(1), rslt.map(wrap)); // ok(ok(1))  … map は法則どおり、包んだまま返す
> step(ok(1), wrap);                // ok(1)      … step は自動で平らにする
> ```
>
> 入れ子の Result を扱う場合や、`map` と `andThen` を厳密に区別したい場合は、`rslt.pipe` と `rslt.map` / `rslt.andThen` を使ってください。

### rslt.pipe

`rslt.map(f)` などは「Result を受け取る関数」を返します。それを `rslt.pipe` で左から順に通します。`r` は `Result<T, E>` とします。

| # | 関数 | f の型 | 返すもの | 動き |
| --- | --- | --- | --- | --- |
| 1 | `rslt.map(f)` | `T => U` | `Result<U, E>` | 成功値を変換する |
| 2 | `rslt.andThen(f)` | `T => Result<U, F>` | `Result<U, E \| F>` | 成功値を、Result を返す処理につなげる |
| 3 | `rslt.andThrough(f)` | `T => Result<unknown, F>` | `Result<T, E \| F>` | `f` が Success なら元の成功値、Failure ならその Failure |
| 4 | `rslt.andTee(f)` | `T => unknown` | `Result<T, E>` | `f` の結果を捨てて常に元の成功値。例外も握りつぶす |
| 5 | `rslt.mapErr(f)` | `E => F` | `Result<T, F>` | エラーを変換する |
| 6 | `rslt.orElse(f)` | `E => Result<U, F>` | `Result<T \| U, F>` | 失敗時に、別の Result で回復を試みる |
| 7 | `rslt.orThrough(f)` | `E => Result<unknown, F>` | `Result<T, E \| F>` | `f` が Success なら元のエラー、Failure ならその Failure |
| 8 | `rslt.orTee(f)` | `E => unknown` | `Result<T, E>` | `f` の結果を捨てて常に元のエラー。例外も握りつぶす |

1〜4 は失敗時、5〜8 は成功時には `f` を呼ばず、元の Result をそのまま返します。

```typescript
const r = rslt.pipe(
  newEmail(input),                            // Result<Email, ValidationError>
  rslt.map((email) => email.toLowerCase()),   // 引数の型は直前の成功値から推論される
  rslt.andThrough(checkNotBlocked),           // 失敗しうる検証。Failure なら止まる
  rslt.andTee((email) => logger.info(email)), // ログ。失敗しても無視
  rslt.andThen(findUserByEmail),
  rslt.mapErr((e) => toAppError(e)),
);
```

- **Through と Tee**: 失敗したら止めたい処理 (検証など) は Through、失敗しても本筋に影響させたくない副作用 (ログなど) は Tee を使います (step では `through` / `tee`、pipe では `rslt.andThrough` / `rslt.andTee`)。Tee は `f` の例外も Promise の reject も握りつぶします (完了は待ちません)
- `rslt.pipe` は Result 専用ではなく、引数を 1 つ受け取る関数なら何でも並べられます
- `rslt.map(f)` を `rslt.pipe` の外で作るときは、引数の型を書きます: `const double = rslt.map((n: number) => n * 2)`

## まとめる

| 関数 | 説明 |
| --- | --- |
| `sequence(x)` | すべて成功なら成功値をまとめる。失敗があれば**最初の** Failure |
| `collect(x)` | すべて成功なら成功値をまとめる。失敗があれば**すべての**エラーを配列で返す |
| `sequenceAsync(x)` / `collectAsync(x)` | 非同期版。Result と ResultAsync を混ぜて渡せる |

配列 (タプル) とオブジェクトを受け取り、入力と同じ形・型で返します。

```typescript
sequence({ id: newId(x), mail: newEmail(y) }); // Result<{ id: Id; mail: Email }, ValidationError>
collect([newId(x), newEmail(y)]);              // Result<[Id, Email], ValidationError[]>
await sequenceAsync({ user: fetchUser(id), posts: fetchPosts(id) });
```

「最初の Failure」は入力の順番で決まります。非同期版は `Promise.all` ですべての完了を待ってから返します。

## 非同期の書き方

変換関数 (`rslt.map` など) は同期の Result だけを受け取ります。非同期は次のどれかで書きます。

```typescript
// 1. stepAsync でつなげる
const r1 = await stepAsync(ok(req), getToken, verifyToken, toUser);

// 2. stepAsync の結果に、失敗側の処理を rslt.pipe で続ける
const r2 = rslt.pipe(await stepAsync(ok(req), getToken, verifyToken), rslt.mapErr(toAppError));

// 3. async 関数の中で isErr による早期 return
const auth = async (req: Request): ResultAsync<User, AuthError> => {
  const token = getToken(req);
  if (isErr(token)) return token;
  const payload = await verifyToken(token.value);
  if (isErr(payload)) return payload;
  return ok(toUser(payload.value));
};
```

`ResultAsync` を返す関数は `async` 関数にしてください。どの分岐で return しても必ず Promise が返ります。

## 注意点

- **例外**: `step` / `through` / `andThrough` / `orThrough` に渡した関数の例外は Failure にならず、そのまま投げられます。例外を投げうる処理は `rslt.try` / `rslt.tryAsync` で Result にしてから渡してください (`tee` / `rslt.andTee` / `rslt.orTee` だけは握りつぶします)
- **Result の判定**: `step` は戻り値が Result かを `{ type: "Success", value }` / `{ type: "Failure", error }` という形で判定します。成功値としてこの形のデータを返すと Result として扱われます (型の推論も同じ扱い)
- **関数の数**: `rslt.pipe` / `step` / `stepAsync` につなげられる関数は最大 10 個です
- **JSON**: `ok()` を JSON にすると `value` が消えて `{"type":"Success"}` になりますが、成功として扱えます。`JSON.parse` の結果は型が保証されないので、バリデーションしてから使ってください
- **freeze のコスト**: Result は作るたびに `Object.freeze` します。大量の Result をループで作る処理 (CSV の全行の検証など) ではわずかにコストがかかります

## テストでの書き方

値を取り出す `unwrap` はありません。Result は普通のオブジェクトなので、そのまま比較できます。

```typescript
expect(parseAge("20")).toEqual(ok(20));

const r = newEmail("invalid");
expect(isErr(r)).toBe(true);
if (isErr(r)) expect(r.error.code).toBe("Validation Error");
```

</samp>
