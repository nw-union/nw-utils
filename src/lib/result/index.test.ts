import { describe, expect, it } from "bun:test";
import { Result } from "./index.js";

const ok1: Result.Result<number, string> = Result.succeed(1);
const ng: Result.Result<number, string> = Result.fail("ng");

describe("succeed / fail", () => {
  it("plain object を返す", () => {
    expect(Result.succeed(1)).toEqual({ type: "Success", value: 1 });
    expect(Result.succeed()).toEqual({ type: "Success", value: undefined });
    expect(Result.fail("e")).toEqual({ type: "Failure", error: "e" });
  });
});

describe("isSuccess / isFailure", () => {
  it("判定できる", () => {
    expect(Result.isSuccess(ok1)).toBe(true);
    expect(Result.isFailure(ok1)).toBe(false);
    expect(Result.isSuccess(ng)).toBe(false);
    expect(Result.isFailure(ng)).toBe(true);
  });
});

describe("map / mapError", () => {
  it("map は成功値のみ変換する", () => {
    expect(Result.map(ok1, (n) => n + 1)).toEqual(Result.succeed(2));
    expect(Result.map(ng, (n) => n + 1)).toBe(ng);
  });
  it("mapError はエラーのみ変換する", () => {
    expect(Result.mapError(ng, (e) => e.length)).toEqual(Result.fail(2));
    expect(Result.mapError(ok1, (e) => e.length)).toEqual(Result.succeed(1));
  });
});

describe("andThen / orElse", () => {
  const half = (n: number): Result.Result<number, string> =>
    n % 2 === 0 ? Result.succeed(n / 2) : Result.fail("odd");
  it("andThen は成功時のみ次を実行する", () => {
    expect(Result.andThen(Result.succeed(4), half)).toEqual(Result.succeed(2));
    expect(Result.andThen(Result.succeed(3), half)).toEqual(Result.fail("odd"));
    let called = false;
    Result.andThen(ng, (n) => {
      called = true;
      return half(n);
    });
    expect(called).toBe(false);
  });
  it("orElse は失敗時のみフォールバックする", () => {
    expect(Result.orElse(ng, () => Result.succeed(0))).toEqual(
      Result.succeed(0),
    );
    expect(Result.orElse(ok1, () => Result.succeed(0))).toEqual(
      Result.succeed(1),
    );
  });
});

describe("try / tryAsync", () => {
  it("try は例外を Failure に変換する", () => {
    expect(Result.try(() => 1, String)).toEqual(Result.succeed(1));
    expect(
      Result.try(
        () => {
          throw new Error("boom");
        },
        (e) => (e as Error).message,
      ),
    ).toEqual(Result.fail("boom"));
  });
  it("try に Promise を返す関数は渡せない (型エラー)", () => {
    // @ts-expect-error 非同期関数は tryAsync を使う
    Result.try(async () => 1, String);
  });
  it("tryAsync は resolve を Success に、reject を Failure に変換する", async () => {
    expect(await Result.tryAsync(async () => 1, String)).toEqual(
      Result.succeed(1),
    );
    expect(
      await Result.tryAsync(
        () => Promise.reject(new Error("boom")),
        (e) => (e as Error).message,
      ),
    ).toEqual(Result.fail("boom"));
  });
  it("tryAsync は同期的な throw も Failure にする", async () => {
    const r = Result.tryAsync(
      () => {
        throw new Error("sync");
      },
      (e) => (e as Error).message,
    );
    expect(r).toBeInstanceOf(Promise);
    expect(await r).toEqual(Result.fail("sync"));
  });
});

describe("unwrap / unwrapError", () => {
  it("値を取り出す", () => {
    expect(Result.unwrap(ok1)).toBe(1);
    expect(Result.unwrapError(ng)).toBe("ng");
  });
  it("逆側は throw する", () => {
    expect(() => Result.unwrap(Result.fail(new Error("x")))).toThrow("x");
    expect(() => Result.unwrapError(ok1)).toThrow();
  });
});
