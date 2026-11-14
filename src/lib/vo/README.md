<samp>
<h1 align="center">@nw-union/nw-utils/lib/vo</h1>

<p align="center">
外部依存のない、最小限のパーサーと Value Object 生成ヘルパー。<br/> パーサーを組み合わせて値の形を宣言し、brand 付きの VO を Result で返します。
</p>

<br />

```typescript
import { type InferVo, newVo, v } from "@nw-union/nw-utils/lib/vo";
import { isErr } from "@nw-union/nw-utils/lib/rslt";

export const newEmail = newVo("Email", v.chain(v.string, v.email));
export type Email = InferVo<typeof newEmail>; // string & Brand<"Email">

const r = newEmail(input);  // Result<Email, ValidationError>
if (isErr(r)) return r;     // r.error.message: "Email is invalid. ( type: Email )"
console.log(r.value);       // r.value: Email
```

## 型

```typescript
type Issue = { readonly message: string };

type Parser<I, O> = (input: I) => Result<O, Issue>; // I を受け取り、O か Issue を返す
type Schema<O> = Parser<unknown, O>;                // unknown を受け取れるパーサー (newVo に渡すもの)
```

パーサーはクラスではなく、ただの関数です。`v.string(x)` のように直接呼べて、`step` や `rslt.andThen` にもそのまま渡せます。引数を書き換えず、同じ入力には同じ結果を返します。

| 型 | 説明 |
| --- | --- |
| `InferOutput<P>` | パーサーの出力の型 (`v.InferOutput` でも参照できる) |
| `Brand<B>` | VO の型に付く印。実行時には存在しない |
| `InferVo<F>` | `newVo` が返した生成関数から、VO の型を取り出す |

## パーサー

引数のないパーサーは値、引数があるものは「パーサーを返す関数」です。

### 型チェック

`unknown` の入力を型で絞り込みます (`Schema<T>`)。`v.chain` の先頭に置きます。

| パーサー | 説明 |
| --- | --- |
| `v.string` | 文字列 |
| `v.number` | 数値。`NaN` は失敗にする |
| `v.boolean` | 真偽値 |

### 文字列の検証

`Parser<string, string>` です。

| パーサー | 説明 |
| --- | --- |
| `v.minLength(n)` | 文字数が n 以上 |
| `v.maxLength(n)` | 文字数が n 以下 |
| `v.length(n)` | 文字数がちょうど n |
| `v.nonEmpty` | 空文字列でない |
| `v.regex(re)` | 正規表現に一致する |
| `v.email` | メールアドレスの形式 (valibot と同じ正規表現) |

### 数値の検証

`Parser<number, number>` です。

| パーサー | 説明 |
| --- | --- |
| `v.minValue(n)` | n 以上 |
| `v.maxValue(n)` | n 以下 |
| `v.integer` | 整数 |

## つなげる

| 関数 | 説明 |
| --- | --- |
| `v.chain(p1, p2, ...)` | パーサーを左から順につなげて、1 つのパーサーにする。最初の失敗で止まる |
| `v.emptyAsNull(p)` | 空文字列 `""` なら `ok(null)`、それ以外は `p` に渡す。フォームの任意項目向け |

```typescript
const age = v.chain(v.number, v.integer, v.minValue(0), v.maxValue(150));

age(20);   // ok(20)
age("20"); // err({ message: 'Invalid type: Expected number but received "20"' })

// 共通の部品を作って使い回せる
const name = v.chain(v.string, v.nonEmpty, v.maxLength(20));
const userName = v.chain(name, v.regex(/^[a-z0-9_]+$/));
const optionalName = v.emptyAsNull(name); // Schema<string | null>
```

- 前のパーサーの出力型と、次のパーサーの入力型が合わないと型エラーになります (`v.chain(v.string, v.minValue(1))` など)
- 最初の失敗で止まるので、エラーは常に 1 件 (`Issue`) です
- `v.chain` はパーサー (関数) を合成して新しいパーサーを作ります。値を関数に通す `rslt.pipe` とは別物です

## VO を作る

| 関数 | 説明 |
| --- | --- |
| `newVo(type, schema)` | `(src: unknown) => Result<T, ValidationError>` を返す。成功値の型には brand `type` が付く |
| `withName(name)` | `newVo` が返した `ValidationError` の表示名を差し替える関数を返す (`rslt.mapErr` 用) |

```typescript
const email = v.chain(v.string, v.email);

export const newEmail = newVo("Email", email);
export type Email = InferVo<typeof newEmail>; // string & Brand<"Email">

// 任意項目。null には brand を付けない
export const newOptionalEmail = newVo("Email", v.emptyAsNull(email)); // Result<Email | null, ValidationError>

inputs.map(newEmail); // 生成関数は 1 引数なので、そのまま渡せる
```

brand は `newVo` が付けるので、型名を書くのは 1 か所だけです。パーサーは brand のない部品のままなので、使い回せます。

brand が違う VO は、中身が同じ `string` でも互いに代入できません。

```typescript
const newUserId = newVo("UserId", v.string);
const newPostId = newVo("PostId", v.string);

const postId: InferVo<typeof newPostId> = userId; // ❌ 型エラー
const s: string = userId;                         // ✅ string としては使える
```

`schema` は `v.string` などの型チェックで始める必要があります。`newVo("Email", v.email)` は、`v.email` が `string` しか受け取れないので型エラーになります。

### エラー

失敗すると `ValidationError` を返します。

```typescript
error.code;    // "Validation Error"
error.message; // "Email is invalid. ( type: Email )"
error.details; // ['Email: Invalid email: Received "invalid"']
```

エラーに表示する名前を変えたいときは、`withName` でエラー側を差し替えます。生成関数は 1 引数のままです。

```typescript
rslt.pipe(newEmail(input), rslt.mapErr(withName("userEmail")));
// error.message: "userEmail is invalid. ( type: Email )"
// error.details: ['userEmail: Invalid email: Received "..."']
```

`details` に入るメッセージは valibot に近い英語で、変更はできません。

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

パーサーはただの関数なので、足りないものは自分で書いて `v.chain` に入れられます。

```typescript
import { err, ok } from "@nw-union/nw-utils/lib/rslt";
import { newVo, type Parser, v } from "@nw-union/nw-utils/lib/vo";

const startsWithA: Parser<string, string> = (s) =>
  s.startsWith("a") ? ok(s) : err({ message: "Must start with a" });

export const newCode = newVo("Code", v.chain(v.string, startsWithA));
```

## lib/valibot からの移行

```diff
- import * as v from "valibot";
- import { newType, newVoOrNone } from "@nw-union/nw-utils/lib/valibot";
+ import { type InferVo, newVo, v } from "@nw-union/nw-utils/lib/vo";

- const email = v.pipe(v.string(), v.email(), v.brand("Email"));
- export type Email = v.InferOutput<typeof email>;
- export const newEmail = newType(email, "Email");
- export const newOptionalEmail = newVoOrNone(email, "Email");
+ const email = v.chain(v.string, v.email);
+ export const newEmail = newVo("Email", email);
+ export type Email = InferVo<typeof newEmail>;
+ export const newOptionalEmail = newVo("Email", v.emptyAsNull(email));
```

| lib/valibot | lib/vo |
| --- | --- |
| `v.pipe(...)` | `v.chain(...)` |
| `v.string()` / `v.email()` など引数のないもの | `v.string` / `v.email` (値) |
| `v.brand("Email")` | なし (`newVo("Email", ...)` が付ける) |
| `v.InferOutput<typeof email>` (VO の型) | `InferVo<typeof newEmail>` |
| `newType(schema, type)` | `newVo(type, schema)` (引数の順番が逆) |
| `newVoOrNone(schema, type)` | `newVo(type, v.emptyAsNull(schema))` |
| `newEmail(src, name)` | `rslt.mapErr(withName(name))` |
| `v.safeParse(schema, input)` | `schema(input)` |

`ValidationError` の `message` / `details` の形は同じです。

## 注意点

- **型を外した呼び出し**: 検証のパーサー (`v.minValue` など) は、型チェック済みの値が来る前提です。`as any` などで型を外して別の型の値を渡すと、`v.minValue(0)("5")` が成功するなど、正しく判定できません
- **文字数**: `v.minLength` などは `String.prototype.length` (UTF-16 のコード単位) で数えます。絵文字などは 1 文字が 2 と数えられることがあります
- **正規表現**: `v.regex` は渡した RegExp を書き換えません。`g` / `y` フラグ付きでも毎回先頭から判定します
- **パーサーの数**: `v.chain` につなげられるパーサーは最大 10 個です。超える場合は `v.chain` を入れ子にします
- **ないもの**: `object` / `array` / `optional` / `literal` / `picklist` / `transform` / `url` / `uuid` などはありません。エラーメッセージの上書きや、`ValidationError` への cause (`ValiError`) の連結もありません

## テストでの書き方

Result とエラーの `Issue` は普通のオブジェクトなので、そのまま比較できます。

```typescript
expect(age(20)).toEqual(ok(20));
expect(age(200)).toEqual(err({ message: "Invalid value: Expected <=150 but received 200" }));

const r = newEmail("invalid");
expect(isErr(r)).toBe(true);
if (isErr(r)) expect(r.error.details).toEqual(['Email: Invalid email: Received "invalid"']);
```

</samp>
