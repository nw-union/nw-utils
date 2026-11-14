# @nw-union/nw-utils/lib/vo

外部依存のない、最小限のパーサー (スキーマ) と Value Object 生成ヘルパーです。

パーサーを組み合わせて VO の形を宣言し、`newVo` で VO の生成関数にします。結果は `lib/rslt` の `Result` で返ります。

```typescript
import { newVo, v } from "@nw-union/nw-utils/lib/vo";

const email = v.chain(v.string, v.email, v.brand("Email"));
export type Email = v.InferOutput<typeof email>;
export const newEmail = newVo(email, "Email");

newEmail("a@example.com"); // { type: "Success", value: "a@example.com" }
newEmail("invalid"); // { type: "Failure", error: ValidationError }
```

## 特徴

- **パーサーはただの関数**: すべてのパーサーは `(input) => Result<O, Issue>` です。`v.string(x)` のように直接呼べて、`rslt.step` や `rslt.andThen` にもそのまま渡せます
- **引数のないパーサーは値**: `v.string` / `v.email` は値、`v.minLength(3)` のように引数があるものは「パーサーを返す関数」です
- **chain は最初の失敗で止まる**: 失敗した時点で止まり、エラーは常に 1 件 (`Issue`) です
- **生成関数は 1 引数**: `newVo` が返す関数は `(src: unknown) => Result<T, ValidationError>` なので、`inputs.map(newEmail)` のように関数として渡せます
- **純粋**: 引数を書き換えず、同じ入力には同じ結果を返します。すべて同期です
- **外部依存なし**: `lib/rslt` と `error.ts` だけを使います
- **tree-shaking が効く**: 使ったパーサーだけがバンドルに入ります

## 型

```typescript
type Issue = { readonly message: string };

// I を受け取り、O か Issue を返すパーサー
type Parser<I, O> = (input: I) => Result<O, Issue>;

// unknown を受け取れるパーサー (newVo に渡すもの)
type Schema<O> = Parser<unknown, O>;

// パーサーの出力の型
type InferOutput<P> = ...;

// brand で付く型の印 (実行時には存在しない)
type Brand<B extends string> = ...;
```

型は `v.InferOutput` のように `v` 経由でも、`import { type InferOutput }` のように名前でも参照できます。

## パーサー

### 型チェック (`Schema<T>`)

`unknown` の入力を型で絞り込みます。chain の先頭に置きます。

| パーサー | 説明 |
| --- | --- |
| `v.string` | 文字列 |
| `v.number` | 数値。`NaN` は失敗にします |
| `v.boolean` | 真偽値 |

### 検証 (文字列: `Parser<string, string>`)

| パーサー | 説明 |
| --- | --- |
| `v.minLength(n)` | 文字数が n 以上 |
| `v.maxLength(n)` | 文字数が n 以下 |
| `v.length(n)` | 文字数がちょうど n |
| `v.nonEmpty` | 空文字列でない |
| `v.regex(re)` | 正規表現に一致する。渡した RegExp は書き換えません (`g` / `y` フラグ付きでも毎回先頭から判定します) |
| `v.email` | メールアドレスの形式 (valibot と同じ正規表現) |

文字数は `String.prototype.length` (UTF-16 のコード単位) で数えます。絵文字などは 1 文字が 2 と数えられることがあります。

### 検証 (数値: `Parser<number, number>`)

| パーサー | 説明 |
| --- | --- |
| `v.minValue(n)` | n 以上 |
| `v.maxValue(n)` | n 以下 |
| `v.integer` | 整数 |

### 組み合わせ

| 関数 | 説明 |
| --- | --- |
| `v.chain(p1, p2, ...)` | パーサーを左から順につなげます (最大 10 個)。最初の失敗で止まります。前の出力型と次の入力型が合わないと型エラーになります |
| `v.brand(name)` | 実行時は何もせず、型だけを `T & Brand<name>` にします |
| `v.emptyAsNull(p)` | 空文字列 `""` なら `ok(null)`、それ以外は `p` に渡します。フォームの任意項目向けです |

```typescript
const age = v.chain(v.number, v.integer, v.minValue(0), v.maxValue(150));

// chain は入れ子にできる
const name = v.chain(v.string, v.nonEmpty, v.maxLength(20));
const userName = v.chain(name, v.regex(/^[a-z0-9_]+$/), v.brand("UserName"));

// 任意項目
const optionalEmail = v.emptyAsNull(email); // Schema<Email | null>

// 型が合わない組み合わせは型エラーになる
v.chain(v.string, v.minValue(1)); // ❌ minValue は number 用
```

`v.chain` はパーサー (関数) を合成して新しいパーサーを作ります。値を関数に通す `rslt.pipe` とは別物です。

```typescript
age(20); // { type: "Success", value: 20 }
age("20"); // { type: "Failure", error: { message: 'Invalid type: Expected number but received "20"' } }
```

## Value Object ヘルパー

| 関数 | 説明 |
| --- | --- |
| `newVo(schema, type)` | `(src: unknown) => Result<T, ValidationError>` を返します |
| `withName(name)` | `newVo` が返した `ValidationError` の表示名を差し替える関数を返します (`rslt.mapErr` 用) |

```typescript
const email = v.chain(v.string, v.email, v.brand("Email"));
export type Email = v.InferOutput<typeof email>;
export const newEmail = newVo(email, "Email");
export const newOptionalEmail = newVo(v.emptyAsNull(email), "Email");

newEmail("a@example.com"); // ok(Email)
newOptionalEmail(""); // ok(null)
inputs.map(newEmail); // Result<Email, ValidationError>[]
```

失敗時の `ValidationError` は次のとおりです。

```typescript
error.code; // "Validation Error"
error.message; // "Email is invalid. ( type: Email )"
error.details; // ['Email: Invalid email: Received "invalid"']
```

エラーに表示する名前を変えたいときは、`withName` でエラー側を差し替えます。生成関数は 1 引数のままです。

```typescript
import { rslt } from "@nw-union/nw-utils/lib/rslt";

rslt.pipe(newEmail(input), rslt.mapErr(withName("userEmail")));
// error.message: "userEmail is invalid. ( type: Email )"
// error.details: ['userEmail: Invalid email: Received "..."']
```

## エラーメッセージ

メッセージは valibot に近い英語で、変更はできません。

| パーサー | メッセージの例 |
| --- | --- |
| `string` / `number` / `boolean` | `Invalid type: Expected string but received 1` |
| `minLength` / `maxLength` / `length` | `Invalid length: Expected >=3 but received 2` |
| `nonEmpty` | `Invalid length: Expected !0 but received 0` |
| `regex` | `Invalid format: Expected /^\d+$/ but received "a"` |
| `email` | `Invalid email: Received "invalid"` |
| `minValue` / `maxValue` | `Invalid value: Expected >=0 but received -1` |
| `integer` | `Invalid integer: Received 1.5` |

## 独自のパーサーを書く

パーサーはただの関数なので、足りないものは自分で書いて chain に入れられます。

```typescript
import { err, ok } from "@nw-union/nw-utils/lib/rslt";
import { type Parser, v } from "@nw-union/nw-utils/lib/vo";

const startsWithA: Parser<string, string> = (s) =>
  s.startsWith("a") ? ok(s) : err({ message: "Must start with a" });

const code = v.chain(v.string, startsWithA, v.brand("Code"));
```

## lib/valibot からの移行

```diff
- import * as v from "valibot";
- import { newType, newVoOrNone } from "@nw-union/nw-utils/lib/valibot";
+ import { newVo, v } from "@nw-union/nw-utils/lib/vo";

- const email = v.pipe(v.string(), v.email(), v.brand("Email"));
+ const email = v.chain(v.string, v.email, v.brand("Email"));
  export type Email = v.InferOutput<typeof email>;
- export const newEmail = newType(email, "Email");
- export const newOptionalEmail = newVoOrNone(email, "Email");
+ export const newEmail = newVo(email, "Email");
+ export const newOptionalEmail = newVo(v.emptyAsNull(email), "Email");

- newEmail(input, "userEmail");
+ rslt.pipe(newEmail(input), rslt.mapErr(withName("userEmail")));
```

| lib/valibot | lib/vo |
| --- | --- |
| `v.pipe(...)` | `v.chain(...)` |
| `v.string()` / `v.email()` など引数のないもの | `v.string` / `v.email` (値) |
| `newType(schema, type)` | `newVo(schema, type)` |
| `newVoOrNone(schema, type)` | `newVo(v.emptyAsNull(schema), type)` |
| `newEmail(src, name)` | `rslt.mapErr(withName(name))` |
| `v.safeParse(schema, input)` | `schema(input)` (Result を返す) |

`ValidationError` の `message` / `details` の形は同じです。そのほか、次の点が valibot と違います。

- chain は最初の失敗で止まるので、エラーは常に 1 件です
- エラーメッセージを引数で上書きすることはできません
- `ValidationError` に cause (スタックトレースに連結される `ValiError`) は付きません
- 次の機能はありません: `object` / `array` / `optional` / `nullable` / `literal` / `picklist` / `trim` / `transform` / `check` / `url` / `uuid` など。必要になったら追加します
