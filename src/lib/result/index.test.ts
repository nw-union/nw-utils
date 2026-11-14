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

// ----------------------------------------------------------------------------
// flow / flowAsync
// ----------------------------------------------------------------------------

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
const assertType = <_ extends true>() => {};

class AuthError extends Error {
  readonly kind = "auth";
}
class DbError extends Error {
  readonly kind = "db";
}
type User = { mail: string };

const getToken = (req: { token?: string }): Result.Result<string, AuthError> =>
  req.token
    ? Result.succeed(req.token)
    : Result.fail(new AuthError("no token"));
const tokenToUser = (mail: string): User => ({ mail });
const saveUser = (u: User): Result.Result<number, DbError> =>
  u.mail.includes("@") ? Result.succeed(1) : Result.fail(new DbError("db"));

describe("flow", () => {
  it("Result を返す関数と値を返す関数を混ぜてつなげられる", () => {
    const r = Result.flow(
      Result.succeed({ token: "a@b" }),
      getToken,
      tokenToUser,
      saveUser,
    );
    assertType<Equal<typeof r, Result.Result<number, AuthError | DbError>>>();
    expect(r).toEqual(Result.succeed(1));
  });

  it("値だけを返す関数のエラー型は増えない", () => {
    const r = Result.flow(
      Result.succeed({ token: "a@b" }),
      getToken,
      tokenToUser,
    );
    assertType<Equal<typeof r, Result.Result<User, AuthError>>>();
  });

  it("途中で Failure になったら残りの関数は呼ばない", () => {
    const calls: string[] = [];
    const r = Result.flow(
      Result.succeed({}),
      getToken,
      (t) => {
        calls.push("tokenToUser");
        return tokenToUser(t);
      },
      (u) => {
        calls.push("saveUser");
        return saveUser(u);
      },
    );
    expect(Result.unwrapError(r).message).toBe("no token");
    expect(calls).toEqual([]);
  });

  it("最初から Failure なら関数は呼ばない", () => {
    let called = false;
    const r = Result.flow(Result.fail("ng"), () => {
      called = true;
      return 1;
    });
    expect(r).toEqual(Result.fail("ng"));
    expect(called).toBe(false);
  });

  it("10 個までつなげられる", () => {
    const inc = (n: number) => n + 1;
    const r = Result.flow(
      Result.succeed(0),
      inc,
      inc,
      inc,
      inc,
      inc,
      inc,
      inc,
      inc,
      inc,
      inc,
    );
    expect(r).toEqual(Result.succeed(10));
  });

  it("Promise を返す関数は渡せない (型エラー)", () => {
    // @ts-expect-error 非同期関数は flowAsync を使う
    Result.flow(Result.succeed(1), async (n: number) => n);
  });
});

describe("flowAsync", () => {
  const verify = async (t: string): Result.ResultAsync<string, AuthError> =>
    t.startsWith("valid")
      ? Result.succeed(t.slice(6))
      : Result.fail(new AuthError("invalid"));

  it("同期・非同期の関数を混ぜてつなげられる", async () => {
    const p = Result.flowAsync(
      Result.succeed({ token: "valid:a@b" }),
      getToken,
      verify,
      async (mail) => tokenToUser(mail),
      saveUser,
    );
    assertType<
      Equal<typeof p, Result.ResultAsync<number, AuthError | DbError>>
    >();
    expect(await p).toEqual(Result.succeed(1));
  });

  it("ResultAsync から始められる", async () => {
    const r = await Result.flowAsync(verify("valid:x@y"), tokenToUser);
    expect(r).toEqual(Result.succeed({ mail: "x@y" }));
  });

  it("途中で Failure になったら残りの関数は呼ばない", async () => {
    let called = false;
    const r = await Result.flowAsync(
      Result.succeed({ token: "bad" }),
      getToken,
      verify,
      async (mail) => {
        called = true;
        return tokenToUser(mail);
      },
    );
    expect(Result.unwrapError(r).message).toBe("invalid");
    expect(called).toBe(false);
  });

  it("同期的に Failure で終わっても必ず Promise を返す", async () => {
    const p = Result.flowAsync(Result.succeed({}), getToken, verify);
    expect(p).toBeInstanceOf(Promise);
    expect(Result.isFailure(await p)).toBe(true);
  });

  it("関数が throw / reject した場合は Failure にせず reject する", async () => {
    const p = Result.flowAsync(Result.succeed(1), async () => {
      throw new Error("boom");
    });
    await expect(p).rejects.toThrow("boom");
  });
});
