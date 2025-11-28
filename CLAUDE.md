# nw-utils

NWU のアプリケーションに使用する TypeScript ユーティリティライブラリ

## プロジェクト概要

このプロジェクトは、Cloudflare Workers 環境を含む複数のランタイムで動作する汎用ユーティリティライブラリです。エラーハンドリング、認証、バリデーション、UUID 生成などの基盤機能を提供します。

## 技術スタック

- **Runtime**: Bun
- **Language**: TypeScript
- **主要ライブラリ**:
  - `neverthrow`: Result 型による関数型エラーハンドリング
  - `zod`: スキーマバリデーション
  - `ts-pattern`: パターンマッチング
- **Linter/Formatter**: Biome

## プロジェクト構成

```
src/
├── index.ts                  # メインエントリーポイント
├── error.ts                  # カスタムエラークラス定義
├── interface.ts              # 共通インターフェース定義
├── lib/
│   ├── uuid/                 # UUID 生成・変換ユーティリティ
│   │   └── index.ts
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
- 戻り値: `ResultAsync<string, AuthError>`

### ライブラリ機能

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
const result = await auth.auth(request); // ResultAsync<string, AuthError>
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
- `@nw-union/nw-utils/lib/uuid` - UUID ユーティリティ
- `@nw-union/nw-utils/lib/zod` - Zod ヘルパー
- `@nw-union/nw-utils/adapter/auth-mock` - モック認証
- `@nw-union/nw-utils/adapter/auth-cloudflare` - Cloudflare 認証

## 開発コマンド

```bash
bun run build        # TypeScript のビルド
bun run check        # Biome による lint と format
```

## 設計原則

1. **関数型プログラミング**: `neverthrow` の Result 型を使用し、例外ではなく明示的なエラーハンドリングを推奨
2. **型安全性**: TypeScript の型システムを最大限活用し、ランタイムエラーを最小化
3. **ランタイム非依存**: Cloudflare Workers など複数のランタイムで動作するよう、標準 Web API を優先使用
4. **パターンマッチング**: `ts-pattern` を活用した宣言的なコード記述
5. **明示的なエラー型**: すべてのエラーは `AppError` の階層に属し、適切な詳細情報を持つ

## 注意事項

- すべての非同期エラーハンドリングは `ResultAsync` を使用すること
- カスタムエラーを追加する場合は `error.ts` の階層に従うこと
- 新しいアダプターは `interface.ts` で定義されたインターフェースを実装すること
- Cloudflare Workers 環境では Node.js 固有の API を使用しないこと
