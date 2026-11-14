# nw-utils

NWU のアプリケーションに使用する TypeScript ユーティリティライブラリ

## プロジェクト概要

このプロジェクトは、Cloudflare Workers 環境を含む複数のランタイムで動作する汎用ユーティリティライブラリです。エラーハンドリング、認証、バリデーション、UUID 生成などの基盤機能を提供します。

## 技術スタック

- **Runtime**: Bun
- **Language**: TypeScript
- **主要ライブラリ**:
  - `lib/rslt` (自前): Result 型による関数型エラーハンドリング (外部依存なし)
  - `lib/vo` (自前): 最小限のパーサーと VO 生成ヘルパー (外部依存なし)
  - `zod`: スキーマバリデーション
  - `lib/match` (自前): パターンマッチング (ts-pattern の必要な機能だけを抜き出したもの。外部依存なし)
- **Linter/Formatter**: Biome

## プロジェクト構成

```
src/
├── index.ts                  # メインエントリーポイント
├── error.ts                  # カスタムエラークラス定義
├── interface.ts              # 共通インターフェース定義
├── lib/
│   ├── match/                # パターンマッチ (match / P)
│   │   ├── index.ts
│   │   └── match.ts
│   ├── rslt/                 # Result 型ライブラリ
│   │   ├── index.ts
│   │   └── result.ts
│   ├── uuid/                 # UUID 生成・変換ユーティリティ
│   │   └── index.ts
│   ├── valibot/              # valibot を使った VO ヘルパー
│   │   └── index.ts
│   ├── vo/                   # 自前のパーサー + VO ヘルパー
│   │   ├── index.ts
│   │   └── schema.ts
│   └── zod/                  # Zod バリデーションヘルパー
│       └── index.ts
└── adapter/
    ├── auth-mock/            # モック認証アダプター
    │   └── index.ts
    └── auth-cloudflare/      # Cloudflare Access JWT 認証アダプター
        └── index.ts
```

## コアコンセプト

### エラー階層 (error.ts)

プロジェクト全体で統一されたエラーハンドリングを提供します。

```
AppError (基底クラス)
├── SystemError         # システム起因のエラー
└── UserError           # ユーザー起因のエラー
    ├── ValidationError # バリデーションエラー
    ├── NotFoundError   # データが見つからないエラー
    └── AuthError       # 認証エラー
```

すべてのエラーには以下のプロパティがあります:
- `code`: エラーコード文字列
- `details`: 詳細情報の配列
- `stack`: スタックトレース（元のエラーがある場合は連結される）

### インターフェース (interface.ts)

#### Logger
標準的なログ出力インターフェース。各レベル (debug, info, warn, error) で `AppError` を受け取れます。

#### Auth
認証インターフェース。`Request` を受け取り、ユーザー識別子（通常はメールアドレス）を返します。
- 戻り値: `ResultAsync<User, AuthError>`

### ライブラリ機能

#### Result ライブラリ (lib/rslt/)

外部依存のない最小限の Result 型。名前は neverthrow に寄せ、すべて独立した関数として export して tree-shaking を効かせている。よく使うもの (`ok` / `err` / `isErr` / `step` / `stepAsync` / `through` / `throughAsync` / `tee` / `sequence` / `collect` と型 `Result` / `ResultAsync`) は名前で import し、それ以外は `rslt` を import して `rslt.map` / `rslt.try` のように使う (`import { isErr, ok, rslt, type Result } from "@nw-union/nw-utils/lib/rslt"`)。

- 型: `Result<T, E>` (`{ type: "Success", value }` | `{ type: "Failure", error }` の plain object (frozen)), `ResultAsync<T, E>` (= `Promise<Result<T, E>>`)
- 生成: `ok`, `err`, `rslt.try` (同期), `rslt.tryAsync` (非同期)
- 判定: `isErr(r)` (型ガード。`isOk` はなし。`if (isErr(r)) return r;` で早期リターンし、以降は Success に絞り込まれる)
- 値に変える: `lib/match` の `match(r).ok((v) => ...).err((e) => ...).exhaustive()` を使う (`match` / `fold` は rslt に持たない)
- 変換: `rslt.map`, `rslt.mapErr`, `rslt.andThen`, `rslt.orElse` (すべて同期・data-last。`rslt.map(fn)` は Result を受け取る関数を返し、`rslt.pipe(r, rslt.map(fn), ...)` のように使う)
- `rslt.pipe`: 値を左から順に関数へ通す (最大 10 個。名前で import せず `rslt.pipe` で使う)
- 連結: `step`, `stepAsync` (普通の関数を並べてつなげる。途中で Failure になったらそこで止まる。戻り値が Result なら自動で平らにするため、Functor / Monad の法則は満たさない。厳密に扱うなら `rslt.pipe` + `rslt.map` / `rslt.andThen`)
- 素通り (pipe 用): `rslt.andThrough` / `rslt.orThrough` (Result を返す処理を挟む。Failure なら止まる), `rslt.andTee` / `rslt.orTee` (副作用を挟む。例外も握りつぶす)
- 素通り (step 用): `through`, `throughAsync` (戻り値を捨てて直前の成功値を渡す。Failure なら止まる), `tee` (through のエラー無視版。Failure も例外も握りつぶす)
- 集約: `sequence` (最初の Failure), `collect` (全エラー), `sequenceAsync`, `collectAsync` (配列・オブジェクトを受け取り、同じ形で返す)

非同期の合成は `stepAsync`、または async/await で書く:

```typescript
const f = async (id: string): ResultAsync<User, AppError> => {
  const valid = validateId(id);
  if (isErr(valid)) return valid;
  return rslt.tryAsync(() => fetchUser(valid.value), toAppError);
};
```

#### パターンマッチ (lib/match/)

ts-pattern から使う機能だけを抜き出した、外部依存のないパターンマッチ (`import { match, P } from "@nw-union/nw-utils/lib/match"`)。

- `match(value).with(pattern, handler)...exhaustive()` だけを持つ (`.otherwise` / `.when` などはない)
- 入力が `Result` のときだけ `.ok(handler)` / `.ok(pattern, handler)` / `.err(...)` が使える (handler は値 / エラーを直接受け取る)
- パターン: リテラル / オブジェクト (部分一致・ネスト可) / `P._` (何でもよい) / `P.string` / `P.boolean` / `P.instanceOf(Class)` / `P.union(p1, p2, ...)` (いずれか) / `P.select()` (値を取り出す。1 パターンに 1 つ、名前なし)
- handler の引数はパターンで絞り込まれる。`P.select()` があれば、その位置の値だけを受け取る
- `exhaustive()` は分岐が足りないと型エラー。網羅性の判定は保守的 (完全に覆うか、覆っていないキーが 1 つだけのときだけ取り除く) で、網羅していないのに通ることはない
- 到達しない分岐 (前の分岐で一致済み) を書くと、そのパターンの位置で型エラー
- 実行時にどれにも一致しなければ `NonExhaustiveError` を throw する

#### UUID ライブラリ (lib/uuid/)

Web Crypto API を使用した UUID v4 生成と、Base64URL による短縮変換機能を提供します。

**主な関数**:
- `uuidv4()`: UUID v4 を生成
- `toShortUuid(uuid)`: UUID を 22 文字の Base64URL 文字列に変換
- `fromShortUuid(short)`: 短縮 UUID を通常の UUID 形式に復元

すべて Cloudflare Workers 環境に対応しています。

#### Zod ヘルパー (lib/zod/)

Value Object パターンを簡単に実装するためのヘルパー関数を提供します。

**主な関数**:
- `newType<T>(schema, type)`: Zod スキーマから型安全な VO 生成関数を作成
  - 入力値をバリデーションし、`Result<T, ValidationError>` を返す
  - バリデーションエラーは自動的に `ValidationError` に変換される

**使用例**:
```typescript
const email = z.string().email().brand("Email");
export type Email = z.infer<typeof email>;
export const newEmail = newType(email, "Email");

const result = newEmail("test@example.com"); // Result<Email, ValidationError>
```

#### Value Object ライブラリ (lib/vo/)

外部依存のない最小限のパーサーと VO 生成ヘルパー。`lib/valibot` (valibot を使う版) から依存をなくし、関数型の書き味にしたもの。詳細は `src/lib/vo/README.md`。

- パーサーはすべて `Parser<I, O> = (input: I) => Result<O, Issue>` という純粋な関数。`Schema<O> = Parser<unknown, O>`
- 部品は `v` 経由で使う。引数のないものは値、引数があるものは関数
  - 値: `string` / `number` / `boolean`, `nonEmpty` / `email`, `integer`
  - 関数: `minLength(n)` / `maxLength(n)` / `length(n)` / `regex(re)`, `minValue(n)` / `maxValue(n)`
  - 組み合わせ: `chain(p1, p2, ...)` (Kleisli 合成。最初の失敗で止まり、エラーは 1 件), `emptyAsNull(p)` (空文字列を `ok(null)` にする)
- パーサーには brand を付けない。brand は `newVo` が付ける
- 型: `Parser`, `Schema`, `Issue`, `InferOutput`, `Brand`, `InferVo`
- VO ヘルパー: `newVo(type, schema)` (1 引数の `(src: unknown) => Result<T & Brand<type>, ValidationError>` を返す。null には brand を付けない), `withName(name)` (表示名を差し替える。`rslt.mapErr` 用)

```typescript
import { type InferVo, newVo, v } from "@nw-union/nw-utils/lib/vo";

const email = v.chain(v.string, v.email);
export const newEmail = newVo("Email", email);
export type Email = InferVo<typeof newEmail>; // string & Brand<"Email">
export const newOptionalEmail = newVo("Email", v.emptyAsNull(email)); // Email | null
```

### アダプター

#### Auth Mock (adapter/auth-mock/)

開発・テスト用のモック認証アダプター。常に "mock-user" を返します。

#### Cloudflare Access Auth (adapter/auth-cloudflare/)

Cloudflare Access による JWT 認証を実装したアダプター。

**機能**:
- Cloudflare Access JWT トークンの検証
- JWKS (JSON Web Key Set) を使用した署名検証
- トークンのペイロード検証 (exp, nbf, iss, aud)
- Header (`Cf-Access-Jwt-Assertion`) または Cookie (`CF_Authorization`) からトークン取得

**使用方法**:
```typescript
const auth = newCfAuth("https://your-team.cloudflareaccess.com", "your-aud");
const result = await auth.auth(request); // Result<User, AuthError>
```

内部実装:
1. Request からトークン取得（Header → Cookie の順で試行）
2. JWT デコード
3. ペイロード検証（有効期限、発行者など）
4. JWKS 取得と公開鍵インポート
5. 署名検証
6. ペイロードからメールアドレス抽出

## パッケージエクスポート

以下のサブパス export が利用可能です:

- `@nw-union/nw-utils` - メインエクスポート（error, interface）
- `@nw-union/nw-utils/lib/match` - パターンマッチ
- `@nw-union/nw-utils/lib/rslt` - Result 型
- `@nw-union/nw-utils/lib/uuid` - UUID ユーティリティ
- `@nw-union/nw-utils/lib/vo` - パーサー + VO ヘルパー (外部依存なし)
- `@nw-union/nw-utils/lib/valibot` - valibot 用 VO ヘルパー
- `@nw-union/nw-utils/lib/zod` - Zod ヘルパー
- `@nw-union/nw-utils/adapter/auth-mock` - モック認証
- `@nw-union/nw-utils/adapter/auth-cloudflare` - Cloudflare 認証

## 開発コマンド

```bash
bun run build        # TypeScript のビルド
bun run check        # Biome による lint と format
bun run gen          # lib/rslt の step / stepAsync / pipe と lib/vo の chain のオーバーロードを再生成 (--check で差分確認)
```

## 設計原則

1. **関数型プログラミング**: `lib/rslt` の Result 型を使用し、例外ではなく明示的なエラーハンドリングを推奨
2. **型安全性**: TypeScript の型システムを最大限活用し、ランタイムエラーを最小化
3. **ランタイム非依存**: Cloudflare Workers など複数のランタイムで動作するよう、標準 Web API を優先使用
4. **パターンマッチング**: `lib/match` を活用した宣言的なコード記述
5. **明示的なエラー型**: すべてのエラーは `AppError` の階層に属し、適切な詳細情報を持つ

## 注意事項

- すべての非同期エラーハンドリングは `ResultAsync` を使用すること
- カスタムエラーを追加する場合は `error.ts` の階層に従うこと
- 新しいアダプターは `interface.ts` で定義されたインターフェースを実装すること
- Cloudflare Workers 環境では Node.js 固有の API を使用しないこと
