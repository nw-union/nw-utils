<samp>
<h1 align="center">@nw-union/nw-utils/lib/match</h1>

<p align="center">
外部依存のない、最小限のパターンマッチライブラリ。<br/> ts-pattern から必要な機能だけを抜き出し、分岐の書き忘れと到達しない分岐を型エラーにします。
</p>

<br />

```typescript
import { match, P } from "@nw-union/nw-utils/lib/match";

const status = match(findUser(id)) // Result<User, NotFoundError | ForbiddenError>
  .ok((user) => json(user, 200))
  .err(P.instanceOf(NotFoundError), () => json(null, 404))
  .err(P.instanceOf(ForbiddenError), () => json(null, 403))
  .exhaustive();

const label = match(kind) // "admin" | "member" | "guest"
  .with("admin", () => "管理者")
  .with(P.union("member", "guest"), () => "一般")
  .exhaustive();
```

## 分岐する

| メソッド | 説明 |
| --- | --- |
| `match(value)` | マッチを始める |
| `.with(pattern, handler)` | パターンに一致したら handler を呼ぶ。最初に一致した分岐だけが実行される |
| `.exhaustive()` | 一致した分岐の戻り値を返す。分岐が足りないと型エラー |

`match` は文ではなく式です。戻り値の型は、すべての handler の戻り値の union になります。

```typescript
const shape = (s: Shape) => // { kind: "circle"; r: number } | { kind: "rect"; w: number; h: number }
  match(s)
    .with({ kind: "circle" }, ({ r }) => r * r * Math.PI) // { kind: "circle"; r: number } に絞り込まれる
    .with({ kind: "rect" }, ({ w, h }) => w * h)
    .exhaustive();
```

## Result を分岐する

入力に lib/rslt の `Result` が含まれるときだけ、`.ok` / `.err` が使えます。handler は Success の**値** / Failure の**エラー**を直接受け取ります。

| メソッド | 説明 |
| --- | --- |
| `.ok(handler)` | Success なら値を渡す |
| `.ok(pattern, handler)` | Success で、値が pattern に一致するときだけ呼ぶ。handler は絞り込んだ値を受け取る |
| `.err(handler)` | Failure ならエラーを渡す |
| `.err(pattern, handler)` | Failure で、エラーが pattern に一致するときだけ呼ぶ。handler は絞り込んだエラーを受け取る |

```typescript
const status = match(findUser(id))
  .ok({ role: "admin" }, (admin) => json(admin, 201)) // admin.role: "admin"
  .ok((user) => json(user, 200))
  .err(P.union(P.instanceOf(NotFoundError), P.instanceOf(ForbiddenError)), () => json(null, 400))
  .exhaustive();
```

- `.with` と混ぜて書けます。`Result<T, E> | null` のような union なら、残りの `null` は `.with(null, ...)` で受けます
- `ok(1)` の型 `Result<number, never>` のように、存在しえない側 (`Failure<never>` / `Success<never>`) の分岐は書かなくても網羅になります
- `rslt.pipe` の最後に `(r) => match(r)...exhaustive()` を置けば、変換から値への変換までを 1 つの式で書けます

## パターン

| パターン | 一致する条件 | handler が受け取る型 |
| --- | --- | --- |
| リテラル (`"a"`, `1`, `true`, `null`, `undefined`) | `===` で等しい | そのリテラル型 |
| オブジェクト `{ k: pattern }` | キーがあり、値がパターンに一致する (部分一致・ネスト可)。null やプリミティブには一致しない | パターンで絞り込んだ型 |
| `P._` | 何にでも一致する | 入力そのもの |
| `P.string` | `typeof v === "string"` | `string` |
| `P.boolean` | `typeof v === "boolean"` | `boolean` |
| `P.instanceOf(Class)` | `v instanceof Class` | `Class` のインスタンス |
| `P.union(p1, p2, ...)` | いずれかのパターンに一致する (前から順に試す) | 各パターンで絞り込んだ型の union |
| `P.select()` | 何にでも一致し、その位置の値を取り出す | 取り出した値 |

```typescript
// P.select(): 取り出した値だけを受け取る
match(user)
  .with({ profile: { name: P.select() } }, (name) => name) // name: string
  .exhaustive();

// P.union: 関数型言語の `| A | B -> ...` に当たる
match(event)
  .with(P.union({ kind: "click" }, { kind: "tap" }), ({ x }) => x)
  .with({ kind: "key" }, ({ code }) => code)
  .exhaustive();

// P._: 残りすべてを受ける
match(kind)
  .with("admin", () => "管理者")
  .with(P._, () => "一般")
  .exhaustive();
```

- `P._` は「何でもよい」、`P.select()` は「その値を取り出す」です。残りすべてを受けるだけなら `P._` を使います
- 入力の型にないキーや、取りえないリテラルを書くと型エラーになります

## 網羅性

`.with` / `.ok` / `.err` のたびに、パターンに**確実に**一致する型を取り除きます。何も残っていなければ `.exhaustive()` を呼べ、残っていれば型エラーになります (残っている型がエラーメッセージに出ます)。

```typescript
match(findUser(id))
  .ok(() => 200)
  .err(P.instanceOf(NotFoundError), () => 404)
  .exhaustive(); // 型エラー: ForbiddenError の Failure が残っている
```

取り除くのは次の場合だけです。それ以外は取り除かないので、「網羅していないのに通る」ことはありません。

| パターン | 取り除くもの |
| --- | --- |
| 型を完全に覆う (`{ type: "Success" }` など) | その型 |
| 完全に覆っていないキーが 1 つだけ (`.err(P.instanceOf(NotFound))` など) | そのキーの型だけを狭める (`Failure<NotFound \| Forbidden>` → `Failure<Forbidden>`) |
| `P.union(...)` | 中のパターンを前から順に取り除く |
| 省略できるキー (`a?:`) に触れる | 取り除かない (キーがない値には一致しないため) |

### 到達しない分岐

前の分岐ですでに一致済みの分岐を書くと、そのパターンの位置で型エラーになります (関数型言語の「使われない match ケース」の警告に当たります)。

```typescript
match(findUser(id))
  .ok(() => 200)
  .ok(() => 201) // 型エラー: 到達しない分岐です
  .err(() => 400)
  .exhaustive();
```

## 注意点

- **保守的な判定**: 網羅性の判定が保守的なため、網羅しているのに型エラーになることがあります。そのときは分岐を分けて書いてください。到達しない分岐の検出も同じ理由で、到達しないのにエラーにならないことがあります (到達する分岐がエラーになることはありません)
- **クラスの区別**: TypeScript の型は構造で比べるため、中身が同じクラス同士は同じ型とみなされます。`P.instanceOf` で区別するクラスには `readonly kind = "NotFound"` のようなプロパティを持たせてください
- **`.ok` / `.err` は組み合わせられない**: ビルダーのメソッドなので、`P.union` やオブジェクトの中では使えません。そこでは `{ type: "Success", value: ... }` / `{ type: "Failure", error: ... }` と書きます
- **`P.select()` は 1 つだけ**: 1 つのパターンに 1 つだけ書けます (名前付きの select はありません)
- **実行時のエラー**: 型をごまかして渡した値がどの分岐にも一致しなければ、`.exhaustive()` が `NonExhaustiveError` を投げます
- **ts-pattern との違い**: `.otherwise` / `.when` / `.run` / `.returnType` / `P.number` などその他の P / `P.not` / `P.optional` / 配列・タプルのパターン / 名前付き select / 複数パターンの `.with` / `isMatching` はありません。到達しない分岐の検出と `.ok` / `.err` は ts-pattern にない機能です

## テストでの書き方

分岐の書き忘れは `@ts-expect-error` で確かめられます。

```typescript
expect(toStatus(ok(user))).toBe(200);

const _check = (r: Result<User, NotFoundError | ForbiddenError>) =>
  match(r)
    .ok(() => 200)
    .err(P.instanceOf(NotFoundError), () => 404)
    // @ts-expect-error ForbiddenError の分岐がない
    .exhaustive();
```

</samp>
