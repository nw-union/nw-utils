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
| `.with(pattern, handler)` | パターンに一致したら handler を呼ぶ。最初に一致した分岐だけが実行される |
| `.exhaustive()` | 一致した分岐の戻り値を返す。分岐が足りないと**型エラー**、実行時にどれにも一致しなければ `NonExhaustiveError` を throw |

戻り値の型は、すべての handler の戻り値の union です。

## パターン

| パターン | 一致する条件 | handler が受け取る型 |
| --- | --- | --- |
| リテラル (`"a"`, `1`, `true`, `null`, `undefined`) | `===` | そのリテラル型 |
| オブジェクト `{ k: pattern }` | 部分一致 (キーがあり、値が再帰的に一致)。null やプリミティブには一致しない | パターンで絞り込んだ型 |
| `P.string` | `typeof v === "string"` | `string` |
| `P.boolean` | `typeof v === "boolean"` | `boolean` |
| `P.instanceOf(Class)` | `v instanceof Class` | `Class` のインスタンス |
| `P.select()` | 何にでも一致 | handler は**その位置の値**を受け取る |

```typescript
match(r)
  .with({ type: "Success", value: { name: P.select() } }, (name) => name) // name: string
  .with({ type: "Failure" }, ({ error }) => error.message)
  .exhaustive();
```

- `P.select()` は 1 つのパターンに 1 つだけ書けます (名前付きの select はありません)
- 入力の型にないキーや、取りえないリテラルを書くと型エラーになります

## 網羅性チェック

`.with` のたびに、パターンに**確実に**一致する型を取り除き、何も残っていなければ `.exhaustive()` を呼べます。取り除くのは次の場合だけです (保守的)。

- パターンがその型を完全に覆う (`{ type: "Success" }` は `Success<T>` を取り除く)
- 完全に覆っていないキーが 1 つだけ → そのキーの型だけを狭める (`{ type: "Failure", error: P.instanceOf(NotFound) }` は `Failure<NotFound | Forbidden>` を `Failure<Forbidden>` にする)

それ以外は取り除かないので、「網羅していないのに通る」ことはありません。逆に、網羅しているのに型エラーになる場合は、分岐を分けて書いてください。

`P.instanceOf` で区別するクラスは、TypeScript の構造的型付けのため、プロパティで区別できるようにしてください (`readonly kind = "NotFound"` など)。中身が同じクラス同士は同じ型とみなされます。

## ts-pattern との違い

持っていないもの: `.otherwise` / `.when` / `.run` / `.returnType` / `P._` / `P.number` などその他の P / `P.union` / `P.not` / `P.optional` / 配列・タプルのパターン / 名前付き select / 複数パターンの `.with` / `isMatching`
