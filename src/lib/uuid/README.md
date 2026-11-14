<samp>
<h1 align="center">@nw-union/nw-utils/lib/uuid</h1>

<p align="center">
Web Crypto API による UUID v4 生成と、Base64URL による短縮・復元のユーティリティ。<br/> Cloudflare Workers を含む複数のランタイムで動作します。
</p>

<br />

```typescript
import { fromShortUuid, toShortUuid, uuidv4 } from "@nw-union/nw-utils/lib/uuid";
import { isErr } from "@nw-union/nw-utils/lib/rslt";

const id = uuidv4();            // "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b"

const short = toShortUuid(id);  // Result<string, Error>
if (isErr(short)) return short;
console.log(short.value);       // "PyuMHlpNTm-behwtPk9aaw" (22 文字, URL セーフ)

const back = fromShortUuid(short.value);
// back: Result<string, Error> → 元の UUID
```

## 関数

| 関数 | 戻り値 | 説明 |
| --- | --- | --- |
| `uuidv4()` | `string` | UUID v4 を生成する |
| `toShortUuid(uuid)` | `Result<string, Error>` | UUID を 22 文字の Base64URL 文字列に変換する |
| `fromShortUuid(short)` | `Result<string, Error>` | 短縮 UUID を通常の UUID 形式 (小文字) に復元する |

## uuidv4

`crypto.getRandomValues` で 16 バイトの乱数を作り、バージョン (4) とバリアントのビットを設定して `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` 形式に整形します。Node.js 固有の API には依存しません。

## toShortUuid / fromShortUuid

UUID (36 文字) を 16 バイトに戻し、Base64URL (`+` → `-`、`/` → `_`、パディングの `=` なし) で 22 文字にします。URL やファイル名にそのまま使え、可逆です。

```typescript
const short = toShortUuid("3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b");
const original = fromShortUuid(short.value); // 元の UUID に戻る
```

- `toShortUuid` の入力は UUID v4 前提ですが、`8-4-4-4-12` 形式の 16 バイトの UUID なら動作します (大文字小文字は区別しません)
- `fromShortUuid` は復元時に小文字へ正規化します
- どちらも不正な入力では例外を投げず、`Failure<Error>` を返します

### Failure になるケース

| 関数 | 条件 |
| --- | --- |
| `toShortUuid` | UUID の形式 (`8-4-4-4-12` の 16 進数) に合わない |
| `fromShortUuid` | `[A-Za-z0-9_-]` の 22〜24 文字でない |
| `fromShortUuid` | Base64 としてデコードできない |
| `fromShortUuid` | デコード結果が 16 バイトでない |

## 他の関数とつなげる

戻り値は `lib/rslt` の `Result` なので、そのまま `rslt.pipe` や `flow` につなげられます。

```typescript
import { flow, ok } from "@nw-union/nw-utils/lib/rslt";

const r = flow(ok(uuidv4()), toShortUuid); // Result<string, Error>
```

## テストでの書き方

```typescript
const id = uuidv4();
expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

const short = toShortUuid(id);
expect(fromShortUuid((short as { value: string }).value)).toEqual(ok(id));

expect(isErr(fromShortUuid("invalid"))).toBe(true);
```

</samp>
