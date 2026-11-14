import { describe, expect, it } from "bun:test";
import { isErr, ok, type Result, step } from "../rslt/index.js";
import { type Issue, v } from "./index.js";

// 失敗時のメッセージを取り出す (成功なら throw してテストを失敗させる)
const message = <T>(r: Result<T, Issue>): string => {
  if (!isErr(r)) throw new Error("expected Failure but got Success");
  return r.error.message;
};

describe("型チェック", () => {
  it("string", () => {
    expect(v.string("a")).toEqual({ type: "Success", value: "a" });
    expect(message(v.string(1))).toBe(
      "Invalid type: Expected string but received 1",
    );
    expect(message(v.string(null))).toBe(
      "Invalid type: Expected string but received null",
    );
  });

  it("number (NaN は不可)", () => {
    expect(isErr(v.number(1.5))).toBe(false);
    expect(message(v.number("1"))).toBe(
      'Invalid type: Expected number but received "1"',
    );
    expect(isErr(v.number(Number.NaN))).toBe(true);
  });

  it("boolean", () => {
    expect(isErr(v.boolean(false))).toBe(false);
    expect(message(v.boolean(undefined))).toBe(
      "Invalid type: Expected boolean but received undefined",
    );
  });
});

describe("検証 (文字列)", () => {
  it("minLength / maxLength / length", () => {
    expect(isErr(v.minLength(2)("ab"))).toBe(false);
    expect(message(v.minLength(2)("a"))).toBe(
      "Invalid length: Expected >=2 but received 1",
    );
    expect(isErr(v.maxLength(2)("ab"))).toBe(false);
    expect(isErr(v.maxLength(2)("abc"))).toBe(true);
    expect(isErr(v.length(3)("abc"))).toBe(false);
    expect(isErr(v.length(3)("ab"))).toBe(true);
  });

  it("nonEmpty", () => {
    expect(isErr(v.nonEmpty("a"))).toBe(false);
    expect(isErr(v.nonEmpty(""))).toBe(true);
  });

  it("regex (g フラグ付きでも毎回同じ結果になる)", () => {
    const parser = v.regex(/^\d+$/g);
    expect(isErr(parser("123"))).toBe(false);
    expect(isErr(parser("123"))).toBe(false);
    expect(message(parser("a"))).toBe(
      'Invalid format: Expected /^\\d+$/g but received "a"',
    );
  });

  it("regex は渡された RegExp を書き換えない", () => {
    const re = /a/g;
    re.lastIndex = 5;
    v.regex(re)("a");
    expect(re.lastIndex).toBe(5);
  });

  it("uuidv4", () => {
    expect(isErr(v.uuidv4("123e4567-e89b-42d3-a456-426614174000"))).toBe(false);
    expect(isErr(v.uuidv4("123E4567-E89B-42D3-A456-426614174000"))).toBe(false);
    // バージョンが 4 でない
    expect(isErr(v.uuidv4("123e4567-e89b-12d3-a456-426614174000"))).toBe(true);
    // バリアントが不正
    expect(isErr(v.uuidv4("123e4567-e89b-42d3-c456-426614174000"))).toBe(true);
    expect(isErr(v.uuidv4("123e4567e89b42d3a456426614174000"))).toBe(true);
    expect(message(v.uuidv4("abc"))).toBe('Invalid UUID v4: Received "abc"');
  });

  it("startsWith", () => {
    const parser = v.startsWith("usr_");
    expect(parser("usr_123")).toEqual(ok("usr_123"));
    expect(parser("usr_")).toEqual(ok("usr_"));
    expect(message(parser("grp_123"))).toBe(
      'Invalid start: Expected "usr_" but received "grp_"',
    );
    expect(message(parser("us"))).toBe(
      'Invalid start: Expected "usr_" but received "us"',
    );
  });

  it("email", () => {
    expect(isErr(v.email("a.b+c@example.co.jp"))).toBe(false);
    expect(isErr(v.email("a@b"))).toBe(true);
    expect(isErr(v.email("@example.com"))).toBe(true);
  });
});

describe("検証 (数値)", () => {
  it("minValue / maxValue / integer", () => {
    expect(isErr(v.minValue(0)(0))).toBe(false);
    expect(message(v.minValue(0)(-1))).toBe(
      "Invalid value: Expected >=0 but received -1",
    );
    expect(isErr(v.maxValue(10)(10))).toBe(false);
    expect(isErr(v.maxValue(10)(11))).toBe(true);
    expect(isErr(v.integer(3))).toBe(false);
    expect(message(v.integer(1.5))).toBe("Invalid integer: Received 1.5");
  });
});

describe("chain", () => {
  const name = v.chain(v.string, v.minLength(1), v.maxLength(3));

  it("すべて通れば成功値を返す", () => {
    expect(name("abc")).toEqual({ type: "Success", value: "abc" });
  });

  it("最初の失敗で止まり、エラーを 1 件返す", () => {
    expect(name(1)).toEqual({
      type: "Failure",
      error: { message: "Invalid type: Expected string but received 1" },
    });
    expect(message(name("abcd"))).toBe(
      "Invalid length: Expected <=3 but received 4",
    );
  });

  it("chain を入れ子にできる", () => {
    const short = v.chain(name, v.regex(/^[a-z]+$/));
    expect(isErr(short("ab"))).toBe(false);
    expect(isErr(short("AB"))).toBe(true);
  });

  it("rslt の step にそのまま渡せる", () => {
    const r = step(ok<unknown>("ab"), v.string, v.minLength(2));
    expect(r).toEqual({ type: "Success", value: "ab" });
  });
});

describe("emptyAsNull", () => {
  const optionalEmail = v.emptyAsNull(v.chain(v.string, v.email));

  it("空文字列なら ok(null)", () => {
    expect(optionalEmail("")).toEqual({ type: "Success", value: null });
  });

  it("それ以外は元のパーサーに渡す", () => {
    expect(optionalEmail("a@example.com")).toEqual({
      type: "Success",
      value: "a@example.com",
    });
    expect(isErr(optionalEmail("invalid"))).toBe(true);
    expect(isErr(optionalEmail(null))).toBe(true);
    expect(isErr(optionalEmail(undefined))).toBe(true);
  });
});
