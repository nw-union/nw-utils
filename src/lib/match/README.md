# lib/match

ts-pattern から、このプロジェクトで使う機能だけを抜き出したパターンマッチライブラリです。外部依存はありません。

```typescript
import { match, P } from "@nw-union/nw-utils/lib/match";

const status = match(findUser(id)) // Result<User, NotFoundError | ForbiddenError>
  .with({ type: "Success" }, ({ value }) => json(value, 200))
  .with({ type: "Failure", error: P.instanceOf(NotFoundError) }, () => json(null, 404))
  .with({ type: "Failure", error: P.instanceOf(ForbiddenError) }, () => json(null, 403))
  .exhaustive();
```

## API

| | |
| --- | --- |
| `match(value)` | マッチを始める |
| `.with(pattern, handler)` | パターンに一致したら handler を呼ぶ。最初に一致した分岐だけが実行される。**到達しない分岐**を書くと型エラー |
| `.exhaustive()` | 一致した分岐の戻り値を返す。分岐が足りないと**型エラー**、実行時にどれにも一致しなければ `NonExhaustiveError` を throw |

戻り値の型は、すべての handler の戻り値の union です。

## Result の分岐 (`.ok` / `.err`)

入力に lib/rslt の `Result` が含まれるときだけ、`.ok` / `.err` が使えます。handler は Success の**値** / Failure の**エラー**を直接受け取ります。

```typescript
const status = match(findUser(id)) // Result<User, NotFoundError | ForbiddenError>
  .ok({ role: "admin" }, (admin) => json(admin, 201)) // 値がパターンに一致するときだけ
  .ok((user) => json(user, 200))
  .err(P.instanceOf(NotFoundError), () => json(null, 404))
  .err(P.instanceOf(ForbiddenError), () => json(null, 403))
  .exhaustive();
```

| | |
| --- | --- |
| `.ok(handler)` | Success なら値を渡す (`.with({ type: "Success" }, ...)` と同じ判定) |
| `.ok(pattern, handler)` | Success で、値が pattern に一致するときだけ呼ぶ。handler は絞り込んだ値 (`P.select()` があればその値) を受け取る |
| `.err(handler)` / `.err(pattern, handler)` | Failure について同じ |

- `.with` と混ぜて書けます。`Result<T, E> | null` のような union なら、残りの `null` は `.with(null, ...)` で受けます
- Result 以外の入力では `.ok` / `.err` は型に存在しません (型をごまかして渡しても、一致せずに次の分岐へ進むだけです)
- `ok(1)` の型 `Result<number, never>` のように、存在しえない側 (`Failure<never>` / `Success<never>`) の分岐は書かなくても網羅になります
- `.ok` / `.err` はビルダーのメソッドなので、`P.union` やオブジェクトの中では使えません。そこでは `{ type: "Success", value: ... }` と書いてください

## パターン

| パターン | 一致する条件 | handler が受け取る型 |
| --- | --- | --- |
| リテラル (`"a"`, `1`, `true`, `null`, `undefined`) | `===` | そのリテラル型 |
| オブジェクト `{ k: pattern }` | 部分一致 (キーがあり、値が再帰的に一致)。null やプリミティブには一致しない | パターンで絞り込んだ型 |
| `P._` | 何にでも一致 (値は取り出さない) | 入力そのもの |
| `P.string` | `typeof v === "string"` | `string` |
| `P.boolean` | `typeof v === "boolean"` | `boolean` |
| `P.instanceOf(Class)` | `v instanceof Class` | `Class` のインスタンス |
| `P.union(p1, p2, ...)` | いずれかのパターンに一致 (前から順に試す) | 各パターンで絞り込んだ型の union |
| `P.select()` | 何にでも一致 | handler は**その位置の値**を受け取る |

```typescript
match(r)
  .with({ type: "Success", value: { name: P.select() } }, (name) => name) // name: string
  .with({ type: "Failure" }, ({ error }) => error.message)
  .exhaustive();
```

```typescript
// 関数型言語の `| A | B -> ...` に当たる書き方
match(r)
  .with({ type: "Success" }, ({ value }) => json(value, 200))
  .with({ type: "Failure", error: P.union(P.instanceOf(NotFoundError), P.instanceOf(ForbiddenError)) }, () => json(null, 400))
  .exhaustive();

// 残りすべては P._ で受ける
match(kind)
  .with("admin", () => "管理者")
  .with(P._, () => "一般")
  .exhaustive();
```

- `P._` は「何でもよい」、`P.select()` は「その値を取り出す」です。残りすべてを受けるだけなら `P._` を使ってください
- `P.select()` は 1 つのパターンに 1 つだけ書けます (名前付きの select はありません)
- 入力の型にないキーや、取りえないリテラルを書くと型エラーになります

## 網羅性チェック

`.with` のたびに、パターンに**確実に**一致する型を取り除き、何も残っていなければ `.exhaustive()` を呼べます。取り除くのは次の場合だけです (保守的)。

- パターンがその型を完全に覆う (`{ type: "Success" }` は `Success<T>` を取り除く)
- 完全に覆っていないキーが 1 つだけ → そのキーの型だけを狭める (`{ type: "Failure", error: P.instanceOf(NotFound) }` は `Failure<NotFound | Forbidden>` を `Failure<Forbidden>` にする)
- `P.union` → 中のパターンを前から順に取り除く
- 省略できるキー (`a?:`) に触れるパターンでは取り除かない (キーがない値には一致しないため)

それ以外は取り除かないので、「網羅していないのに通る」ことはありません。逆に、網羅しているのに型エラーになる場合は、分岐を分けて書いてください。

`P.instanceOf` で区別するクラスは、TypeScript の構造的型付けのため、プロパティで区別できるようにしてください (`readonly kind = "NotFound"` など)。中身が同じクラス同士は同じ型とみなされます。

## 到達しない分岐

前の分岐ですでに一致済みの分岐を書くと、そのパターンの位置で型エラーになります (関数型言語の「使われない match ケース」の警告に当たります)。

```typescript
match(r)
  .with({ type: "Success" }, () => 1)
  .with({ type: "Success" }, () => 2) // 型エラー: 到達しない分岐です
  .with({ type: "Failure" }, () => 3)
  .exhaustive();
```

網羅性チェックが保守的なぶん、「一致済み」と判定される範囲も狭くなります。到達しないのにエラーにならないことはありますが、到達する分岐がエラーになることはありません。

## ts-pattern との違い

持っていないもの: `.otherwise` / `.when` / `.run` / `.returnType` / `P.number` などその他の P / `P.not` / `P.optional` / 配列・タプルのパターン / 名前付き select / 複数パターンの `.with` / `isMatching`

ts-pattern にないもの: 到達しない分岐の検出 / Result 用の `.ok` / `.err`
