/**
 * src/lib/rslt/result.ts の flow / flowAsync / pipe と、
 * src/lib/valibot/schema.ts の pipe のオーバーロードを生成する
 *
 * - `bun run gen`        : 生成してファイルを書き換える
 * - `bun run gen --check`: 生成結果とファイルが一致するか確認する (不一致なら exit 1)
 *
 * 生成範囲は `// <generated:flow>` 〜 `// </generated:flow>` (flowAsync / pipe も同様)
 */
const RSLT_FILE = "src/lib/rslt/result.ts";
const VALIBOT_FILE = "src/lib/valibot/schema.ts";
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

// pipe: 値を左から順に関数へ通す (関数 0〜MAX 個)
const pipeOverloads = (): string => {
  const lines: string[] = [];
  for (let n = 0; n <= MAX; n++) {
    const ts = ["A", ...Array.from({ length: n }, (_, i) => `B${i + 1}`)];
    const params = [
      "a: A",
      ...ts.slice(1).map((t, i) => `f${i + 1}: (v: ${ts[i]}) => ${t}`),
    ];
    lines.push(
      `export function pipe<${ts.join(", ")}>(${params.join(", ")}): ${ts[n]};`,
    );
  }
  return lines.join("\n");
};

// valibot の pipe: Step を左から順につなげる (Step 1〜MAX 個)
const stepPipeOverloads = (): string => {
  const lines: string[] = [];
  for (let n = 1; n <= MAX; n++) {
    const ts = ["A", ...Array.from({ length: n }, (_, i) => `B${i + 1}`)];
    const params = ts.slice(1).map((t, i) => `s${i + 1}: Step<${ts[i]}, ${t}>`);
    lines.push(
      `export function pipe<${ts.join(", ")}>(${params.join(", ")}): Step<A, ${ts[n]}>;`,
    );
  }
  return lines.join("\n");
};

const replaceBlock = (
  file: string,
  src: string,
  name: string,
  body: string,
): string => {
  const re = new RegExp(
    `(// <generated:${name}>[^\\n]*\\n)[\\s\\S]*?(// </generated:${name}>)`,
  );
  if (!re.test(src)) throw new Error(`marker for ${name} not found in ${file}`);
  return src.replace(
    re,
    (_, open: string, close: string) => `${open}${body}\n${close}`,
  );
};

// biome でフォーマットした結果を返す (プロジェクトの設定を使うため、パスを指定して stdin から渡す)
const format = (file: string, src: string): string => {
  const p = Bun.spawnSync(
    ["bunx", "biome", "format", `--stdin-file-path=${file}`],
    {
      stdin: new TextEncoder().encode(src),
    },
  );
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
  const out = p.stdout.toString();
  // node_modules が無いと bunx が別の "biome" パッケージを拾い、空の出力を返すことがある
  if (out.trim() === "")
    throw new Error("biome の出力が空。bun install を実行したか確認すること");
  return out;
};

// 各ファイルの生成結果を求める
const targets: { file: string; build: (src: string) => string }[] = [
  {
    file: RSLT_FILE,
    build: (src) => {
      let next = src;
      for (const name of ["flow", "flowAsync"] as const) {
        next = replaceBlock(RSLT_FILE, next, name, overloads(name));
      }
      return replaceBlock(RSLT_FILE, next, "pipe", pipeOverloads());
    },
  },
  {
    file: VALIBOT_FILE,
    build: (src) =>
      replaceBlock(VALIBOT_FILE, src, "pipe", stepPipeOverloads()),
  },
];

const check = process.argv.includes("--check");
let stale = false;
for (const { file, build } of targets) {
  const current = await Bun.file(file).text();
  const next = format(file, build(current));
  if (check) {
    if (next !== current) {
      console.error(
        `${file} のオーバーロードが古い。bun run gen を実行すること`,
      );
      stale = true;
    }
  } else {
    await Bun.write(file, next);
    console.log(`generated: ${file}`);
  }
}
if (check) {
  if (stale) process.exit(1);
  console.log("ok");
}
