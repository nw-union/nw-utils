import { describe, expect, it } from "bun:test";
import { isErr, isOk, type Result } from "../rslt/index.js";
import { type Issue, v } from "./index.js";

// 失敗時のメッセージ一覧を取り出す (成功なら throw してテストを失敗させる)
const messages = <T>(r: Result<T, Issue[]>): string[] => {
  if (isOk(r)) throw new Error("expected Failure but got Success");
  return r.error.map((i) => i.message);
};

describe("型チェック", () => {
  it("string", () => {
    expect(v.string()("a")).toEqual({ type: "Success", value: "a" });
    expect(messages(v.string()(1))).toEqual([
      "Invalid type: Expected string but received 1",
    ]);
    expect(messages(v.string()(null))).toEqual([
      "Invalid type: Expected string but received null",
    ]);
  });

  it("number (NaN は不可)", () => {
    expect(isOk(v.number()(1.5))).toBe(true);
    expect(messages(v.number()("1"))).toEqual([
      'Invalid type: Expected number but received "1"',
    ]);
    expect(isErr(v.number()(Number.NaN))).toBe(true);
  });

  it("boolean", () => {
    expect(isOk(v.boolean()(false))).toBe(true);
    expect(messages(v.boolean()(undefined))).toEqual([
      "Invalid type: Expected boolean but received undefined",
    ]);
  });
});

describe("検証 (文字列)", () => {
  it("minLength / maxLength / length", () => {
    expect(isOk(v.minLength(2)("ab"))).toBe(true);
    expect(messages(v.minLength(2)("a"))).toEqual([
      "Invalid length: Expected >=2 but received 1",
    ]);
    expect(isOk(v.maxLength(2)("ab"))).toBe(true);
    expect(isErr(v.maxLength(2)("abc"))).toBe(true);
    expect(isOk(v.length(3)("abc"))).toBe(true);
    expect(isErr(v.length(3)("ab"))).toBe(true);
  });

  it("nonEmpty", () => {
    expect(isOk(v.nonEmpty()("a"))).toBe(true);
    expect(isErr(v.nonEmpty()(""))).toBe(true);
  });

  it("regex (g フラグ付きでも毎回同じ結果になる)", () => {
    const step = v.regex(/^\d+$/g);
    expect(isOk(step("123"))).toBe(true);
    expect(isOk(step("123"))).toBe(true);
    expect(messages(step("a"))).toEqual([
      'Invalid format: Expected /^\\d+$/g but received "a"',
    ]);
  });

  it("email", () => {
    expect(isOk(v.email()("a.b+c@example.co.jp"))).toBe(true);
    expect(isErr(v.email()("a@b"))).toBe(true);
    expect(isErr(v.email()("@example.com"))).toBe(true);
  });
});

describe("検証 (数値)", () => {
  it("minValue / maxValue / integer", () => {
    expect(isOk(v.minValue(0)(0))).toBe(true);
    expect(messages(v.minValue(0)(-1))).toEqual([
      "Invalid value: Expected >=0 but received -1",
    ]);
    expect(isOk(v.maxValue(10)(10))).toBe(true);
    expect(isErr(v.maxValue(10)(11))).toBe(true);
    expect(isOk(v.integer()(3))).toBe(true);
    expect(messages(v.integer()(1.5))).toEqual([
      "Invalid integer: Received 1.5",
    ]);
  });
});

describe("pipe", () => {
  const name = v.pipe(v.string(), v.minLength(1), v.maxLength(3));

  it("すべて通れば成功値を返す", () => {
    expect(v.parse(name, "abc")).toEqual({ type: "Success", value: "abc" });
  });

  it("最初の失敗で止まる", () => {
    expect(messages(name(1))).toEqual([
      "Invalid type: Expected string but received 1",
    ]);
    expect(messages(name("abcd"))).toEqual([
      "Invalid length: Expected <=3 but received 4",
    ]);
  });

  it("pipe を入れ子にできる", () => {
    const short = v.pipe(name, v.regex(/^[a-z]+$/));
    expect(isOk(short("ab"))).toBe(true);
    expect(isErr(short("AB"))).toBe(true);
  });
});

describe("brand", () => {
  it("値はそのまま、型だけ変わる", () => {
    const userId = v.pipe(v.string(), v.brand("UserId"));
    type UserId = v.InferOutput<typeof userId>;
    const r = userId("u1");
    if (isErr(r)) throw new Error("unreachable");
    const id: UserId = r.value;
    expect<string>(id).toBe("u1");

    // @ts-expect-error ただの string は UserId に代入できない
    const bad: UserId = "u1";
    expect<string>(bad).toBe("u1");
  });
});
