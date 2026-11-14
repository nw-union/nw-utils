# @nw-union/nw-utils/lib/vo

外部依存のない、最小限のスキーマバリデーションライブラリです。

valibot と同じ名前・同じ書き方でスキーマを作り、`newVo` で Value Object の生成関数に変換します。結果は `lib/rslt` の `Result` で返ります。valibot を使う `lib/valibot` から、valibot への依存をなくしたものです。

```typescript
import { newVo, v } from "@nw-union/nw-utils/lib/vo";

const email = v.pipe(v.string(), v.email(), v.brand("Email"));
export type Email = v.InferOutput<typeof email>;
export const newEmail = newVo(email, "Email");

newEmail("a@example.com"); // { type: "Success", value: "a@example.com" }
newEmail("invalid"); // { type: "Failure", error: ValidationError }
```

## 特徴

- **valibot と同じ書き方**: `v.pipe(v.string(), v.email(), v.brand("Email"))` がそのまま書けます。valibot からの移行は、ほとんどの場合 import を変えるだけで済みます
- **スキーマはただの関数**: スキーマも検証も、入力を受け取って `Result<O, Issue[]>` を返す関数です。`schema(input)` と直接呼び出せます
- **pipe は最初の失敗で止まる**: 失敗した時点で止まり、後ろの検証は実行しません。そのため Issue は常に 1 件です
- **同期のみ**: async の検証はありません
- **外部依存なし**: `lib/rslt` と `error.ts` だけを使います
- **tree-shaking が効く**: 使った関数だけがバンドルに入ります。メールアドレスの VO 1 つなら、`ValidationError` と rslt を含めて約 1.4KB (minify 後) です

## 型

```typescript
type Issue = { readonly message: string };

// I を受け取り、O か Issue[] を返す 1 ステップ
type Step<I, O> = (input: I) => Result<O, Issue[]>;

// unknown を受け取れる Step (= スキーマ)
type Schema<O> = Step<unknown, O>;

// Step の出力の型
type InferOutput<S> = ...;

// brand で付く型の印 (実行時には存在しない)
type Brand<B extends string> = ...;
```

型は `v.InferOutput` のように `v` 経由でも、`import { type InferOutput }` のように名前でも参照できます。

## API

### 型チェック (`Schema<T>`)

pipe の先頭に置き、`unknown` の入力を型で絞り込みます。

| 関数 | 説明 |
| --- | --- |
| `v.string()` | 文字列 |
| `v.number()` | 数値。`NaN` は失敗にします |
| `v.boolean()` | 真偽値 |

### 検証 (文字列: `Step<string, string>`)

| 関数 | 説明 |
| --- | --- |
| `v.minLength(n)` | 文字数が n 以上 |
| `v.maxLength(n)` | 文字数が n 以下 |
| `v.length(n)` | 文字数がちょうど n |
| `v.nonEmpty()` | 空文字列でない |
| `v.regex(re)` | 正規表現に一致する。`g` / `y` フラグ付きでも毎回先頭から判定します |
| `v.email()` | メールアドレスの形式 (valibot と同じ正規表現) |

文字数は `String.prototype.length` (UTF-16 のコード単位) で数えます。絵文字などは 1 文字が 2 と数えられることがあります。

### 検証 (数値: `Step<number, number>`)

| 関数 | 説明 |
| --- | --- |
| `v.minValue(n)` | n 以上 |
| `v.maxValue(n)` | n 以下 |
| `v.integer()` | 整数 |

### 合成

| 関数 | 説明 |
| --- | --- |
| `v.pipe(s1, s2, ...)` | Step を左から順に通します (最大 10 個)。最初の失敗で止まります。前の Step の出力型と次の Step の入力型が合わないと型エラーになります |
| `v.brand(name)` | 実行時は何もせず、型だけを `T & Brand<name>` にします |

```typescript
const age = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150));

// pipe は入れ子にできる
const name = v.pipe(v.string(), v.nonEmpty(), v.maxLength(20));
const userName = v.pipe(name, v.regex(/^[a-z0-9_]+$/), v.brand("UserName"));

// 型が合わない組み合わせは型エラーになる
v.pipe(v.string(), v.minValue(1)); // ❌ minValue は number 用
```

### 実行

| 関数 | 説明 |
| --- | --- |
| `v.parse(schema, input)` | `Result<O, Issue[]>` を返します。`schema(input)` と同じです |

```typescript
const r = v.parse(age, 20); // { type: "Success", value: 20 }
const r2 = age("20"); // { type: "Failure", error: [{ message: 'Invalid type: Expected number but received "20"' }] }
```

### Value Object ヘルパー

| 関数 | 説明 |
| --- | --- |
| `newVo(schema, type)` | `(src: unknown, name?: string) => Result<T, ValidationError>` を返します |
| `newVoOrNone(schema, type)` | `newVo` と同じですが、空文字列 `""` は `ok(null)` を返します。フォームの任意項目向けです |

```typescript
const email = v.pipe(v.string(), v.email(), v.brand("Email"));
export type Email = v.InferOutput<typeof email>;
export const newEmail = newVo(email, "Email");
export const newOptionalEmail = newVoOrNone(email, "Email");

newEmail("a@example.com"); // ok(Email)
newEmail("invalid", "userEmail"); // err(ValidationError)。エラー表示に userEmail を使う
newOptionalEmail(""); // ok(null)
newOptionalEmail("a@example.com"); // ok(Email)
```

失敗時の `ValidationError` は次のとおりです (`name` を省略した場合は `type` を使います)。

```typescript
error.code; // "Validation Error"
error.message; // "userEmail is invalid. ( type: Email )"
error.details; // ['userEmail: Invalid email: Received "invalid"']
```

## エラーメッセージ

メッセージは valibot に近い英語で、変更はできません。

| 関数 | メッセージの例 |
| --- | --- |
| `string` / `number` / `boolean` | `Invalid type: Expected string but received 1` |
| `minLength` / `maxLength` / `length` | `Invalid length: Expected >=3 but received 2` |
| `nonEmpty` | `Invalid length: Expected !0 but received 0` |
| `regex` | `Invalid format: Expected /^\d+$/ but received "a"` |
| `email` | `Invalid email: Received "invalid"` |
| `minValue` / `maxValue` | `Invalid value: Expected >=0 but received -1` |
| `integer` | `Invalid integer: Received 1.5` |

## lib/valibot からの移行

```diff
- import * as v from "valibot";
- import { newType } from "@nw-union/nw-utils/lib/valibot";
+ import { newVo, v } from "@nw-union/nw-utils/lib/vo";
```

`newType` は `newVo` に名前が変わります。引数と戻り値、`ValidationError` の `message` / `details` の形は `lib/valibot` の `newType` / `newVoOrNone` と同じです。

```diff
- export const newEmail = newType(email, "Email");
+ export const newEmail = newVo(email, "Email");
```

次の点は valibot と違います。

- `v.safeParse` はありません。`v.parse(schema, input)` が、例外を投げずに `Result` を返します
- pipe は最初の失敗で止まるので、Issue は 1 件だけです
- `ValidationError` に cause (スタックトレースに連結される `ValiError`) は付きません
- エラーメッセージを引数で上書きすることはできません
- 次の機能はありません: `object` / `array` / `optional` / `nullable` / `literal` / `picklist` / `trim` / `transform` / `check` / `url` / `uuid` など。必要になったら追加します

## 独自の Step を書く

Step はただの関数なので、足りない検証は自分で書いて pipe に入れられます。

```typescript
import { err, ok } from "@nw-union/nw-utils/lib/rslt";
import { type Step, v } from "@nw-union/nw-utils/lib/vo";

const startsWithA: Step<string, string> = (s) =>
  s.startsWith("a") ? ok(s) : err([{ message: "Must start with a" }]);

const code = v.pipe(v.string(), startsWithA, v.brand("Code"));
```
