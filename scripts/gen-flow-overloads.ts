/**
 * src/lib/result/result.ts の flow / flowAsync のオーバーロードを生成する
 *
 * - `bun run gen`        : 生成してファイルを書き換える
 * - `bun run gen --check`: 生成結果とファイルが一致するか確認する (不一致なら exit 1)
 *
 * 生成範囲は `// <generated:flow>` 〜 `// </generated:flow>` (flowAsync も同様)
 */
const FILE = "src/lib/result/result.ts";
const MAX = 10; // つなげられる関数の最大数

const overloads = (name: "flow" | "flowAsync"): string => {
  const isAsync = name === "flowAsync";
  const lines: string[] = [];
  for (let n = 1; n <= MAX; n++) {
    const bs = Array.from({ length: n }, (_, i) => `B${i + 1}`);
    // 関数 i の戻り値から、次に渡る値 / エラーの型を求める
    const val = (b: string) => (isAsync ? `Val<Awaited<${b}>>` : `Val<${b}>`);
    const errOf = (b: string) => (isAsync ? `Err<Awaited<${b}>>` : `Err<${b}>`);
    const params = [
      isAsync ? "a: Result<A, E> | ResultAsync<A, E>" : "a: Result<A, E>",
      ...bs.map((b, i) => {
        const arg = i === 0 ? "A" : val(bs[i - 1]);
        const ret = isAsync ? b : `${b} & NotPromise<${b}>`;
        return `f${i + 1}: (v: ${arg}) => ${ret}`;
      }),
    ];
    const ret = `${isAsync ? "ResultAsync" : "Result"}<${val(bs[n - 1])}, E | ${bs.map(errOf).join(" | ")}>`;
    lines.push(
      `export function ${name}<A, E, ${bs.join(", ")}>(${params.join(", ")}): ${ret};`,
    );
  }
  return lines.join("\n");
};

const replaceBlock = (src: string, name: string, body: string): string => {
  const re = new RegExp(
    `(// <generated:${name}>[^\\n]*\\n)[\\s\\S]*?(// </generated:${name}>)`,
  );
  if (!re.test(src)) throw new Error(`marker for ${name} not found in ${FILE}`);
  return src.replace(
    re,
    (_, open: string, close: string) => `${open}${body}\n${close}`,
  );
};

// biome でフォーマットした結果を返す (プロジェクトの設定を使うため、パスを指定して stdin から渡す)
const format = (src: string): string => {
  const p = Bun.spawnSync(
    ["bunx", "biome", "format", `--stdin-file-path=${FILE}`],
    {
      stdin: new TextEncoder().encode(src),
    },
  );
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
  return p.stdout.toString();
};

const current = await Bun.file(FILE).text();
let next = current;
for (const name of ["flow", "flowAsync"] as const) {
  next = replaceBlock(next, name, overloads(name));
}
next = format(next);

if (process.argv.includes("--check")) {
  if (next !== current) {
    console.error(
      `${FILE} の flow / flowAsync のオーバーロードが古い。bun run gen を実行すること`,
    );
    process.exit(1);
  }
  console.log("ok");
} else {
  await Bun.write(FILE, next);
  console.log(`generated: ${FILE}`);
}
