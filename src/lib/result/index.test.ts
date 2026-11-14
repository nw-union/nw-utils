import { describe, expect, it } from "bun:test";
import { match } from "ts-pattern";
import { err, ok, Result } from "./index.js";

const ok1: Result.Result<number, string> = Result.ok(1);
const ng: Result.Result<number, string> = Result.err("ng");

describe("ok / err", () => {
  it("データとしては { type, value } / { type, error } だけを持つ", () => {
    expect(Object.entries(Result.ok(1))).toEqual([
      ["type", "Success"],
      ["value", 1],
    ]);
    expect(Object.entries(Result.ok())).toEqual([
      ["type", "Success"],
      ["value", undefined],
    ]);
    expect(Object.entries(Result.err("e"))).toEqual([
      ["type", "Failure"],
      ["error", "e"],
    ]);
  });
});

describe("Result の値", () => {
  it("ok / err は Result.ok / Result.err と同じもの", () => {
    expect(ok).toBe(Result.ok);
    expect(err).toBe(Result.err);
  });
  it("frozen なので書き換えられない", () => {
    const r = ok(1);
    expect(Object.isFrozen(r)).toBe(true);
    expect(() => {
      (r as { value: number }).value = 2;
    }).toThrow();
  });
  it("JSON にはデータだけが出る", () => {
    expect(JSON.stringify(ok(1))).toBe('{"type":"Success","value":1}');
    expect(JSON.stringify(err("e"))).toBe('{"type":"Failure","error":"e"}');
  });
  it("ts-pattern で分岐できる", () => {
    const f = (r: Result.Result<number, string>) =>
      match(r)
        .with({ type: "Success" }, ({ value }) => `ok:${value}`)
        .with({ type: "Failure" }, ({ error }) => `err:${error}`)
        .exhaustive();
    expect(f(ok(1))).toBe("ok:1");
    expect(f(err("e"))).toBe("err:e");
  });
});

describe("isOk / isErr", () => {
  it("型ガードとして絞り込める", () => {
    const r: Result.Result<number, string> = ok1;
    if (r.isOk()) {
      const v: number = r.value;
      expect(v).toBe(1);
    }
    if (ng.isErr()) {
      const e: string = ng.error;
      expect(e).toBe("ng");
    }
  });
  it("isErr で絞り込んだ Failure は別の成功型の Result としてそのまま返せる", () => {
    const f = (
      r: Result.Result<number, string>,
    ): Result.Result<boolean, string> => (r.isErr() ? r : ok(r.value > 0));
    expect(Object.is(f(ng), ng)).toBe(true);
    expect(f(ok1)).toEqual(ok(true));
  });

  it("判定できる", () => {
    expect(ok1.isOk()).toBe(true);
    expect(ok1.isErr()).toBe(false);
    expect(ng.isOk()).toBe(false);
    expect(ng.isErr()).toBe(true);
  });
});

describe("map / mapError", () => {
  it("map は成功値のみ変換する", () => {
    expect(Result.map(ok1, (n) => n + 1)).toEqual(Result.ok(2));
    expect(Result.map(ng, (n) => n + 1)).toBe(ng);
  });
  it("mapError はエラーのみ変換する", () => {
    expect(Result.mapError(ng, (e) => e.length)).toEqual(Result.err(2));
    expect(Result.mapError(ok1, (e) => e.length)).toEqual(Result.ok(1));
  });
});

describe("andThen / orElse", () => {
  const half = (n: number): Result.Result<number, string> =>
    n % 2 === 0 ? Result.ok(n / 2) : Result.err("odd");
  it("andThen は成功時のみ次を実行する", () => {
    expect(Result.andThen(Result.ok(4), half)).toEqual(Result.ok(2));
    expect(Result.andThen(Result.ok(3), half)).toEqual(Result.err("odd"));
    let called = false;
    Result.andThen(ng, (n) => {
      called = true;
      return half(n);
    });
    expect(called).toBe(false);
  });
  it("orElse は失敗時のみフォールバックする", () => {
    expect(Result.orElse(ng, () => Result.ok(0))).toEqual(Result.ok(0));
    expect(Result.orElse(ok1, () => Result.ok(0))).toEqual(Result.ok(1));
  });
});

describe("try / tryAsync", () => {
  it("try は例外を Failure に変換する", () => {
    expect(Result.try(() => 1, String)).toEqual(Result.ok(1));
    expect(
      Result.try(
        () => {
          throw new Error("boom");
        },
        (e) => (e as Error).message,
      ),
    ).toEqual(Result.err("boom"));
  });
  it("try に Promise を返す関数は渡せない (型エラー)", () => {
    // @ts-expect-error 非同期関数は tryAsync を使う
    Result.try(async () => 1, String);
  });
  it("tryAsync は resolve を Success に、reject を Failure に変換する", async () => {
    expect(await Result.tryAsync(async () => 1, String)).toEqual(Result.ok(1));
    expect(
      await Result.tryAsync(
        () => Promise.reject(new Error("boom")),
        (e) => (e as Error).message,
      ),
    ).toEqual(Result.err("boom"));
  });
  it("tryAsync は同期的な throw も Failure にする", async () => {
    const r = Result.tryAsync(
      () => {
        throw new Error("sync");
      },
      (e) => (e as Error).message,
    );
    expect(r).toBeInstanceOf(Promise);
    expect(await r).toEqual(Result.err("sync"));
  });
});

describe("unwrap / unwrapError", () => {
  it("値を取り出す", () => {
    expect(Result.unwrap(ok1)).toBe(1);
    expect(Result.unwrapError(ng)).toBe("ng");
  });
  it("逆側は throw する", () => {
    expect(() => Result.unwrap(Result.err(new Error("x")))).toThrow("x");
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
  req.token ? Result.ok(req.token) : Result.err(new AuthError("no token"));
const tokenToUser = (mail: string): User => ({ mail });
const saveUser = (u: User): Result.Result<number, DbError> =>
  u.mail.includes("@") ? Result.ok(1) : Result.err(new DbError("db"));

describe("flow", () => {
  it("Result を返す関数と値を返す関数を混ぜてつなげられる", () => {
    const r = Result.flow(
      Result.ok({ token: "a@b" }),
      getToken,
      tokenToUser,
      saveUser,
    );
    assertType<Equal<typeof r, Result.Result<number, AuthError | DbError>>>();
    expect(r).toEqual(Result.ok(1));
  });

  it("値だけを返す関数のエラー型は増えない", () => {
    const r = Result.flow(Result.ok({ token: "a@b" }), getToken, tokenToUser);
    assertType<Equal<typeof r, Result.Result<User, AuthError>>>();
  });

  it("途中で Failure になったら残りの関数は呼ばない", () => {
    const calls: string[] = [];
    const r = Result.flow(
      Result.ok({}),
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
    const r = Result.flow(Result.err("ng"), () => {
      called = true;
      return 1;
    });
    expect(r).toEqual(Result.err("ng"));
    expect(called).toBe(false);
  });

  it("ok / err で作っていない object は Result として扱わない", () => {
    const r = Result.flow(ok(1), () => ({
      type: "Failure" as const,
      error: "data",
    }));
    assertType<
      Equal<typeof r, Result.Result<{ type: "Failure"; error: string }, never>>
    >();
    expect(r.isOk()).toBe(true);
  });

  it("10 個までつなげられる", () => {
    const inc = (n: number) => n + 1;
    const r = Result.flow(
      Result.ok(0),
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
    expect(r).toEqual(Result.ok(10));
  });

  it("Promise を返す関数は渡せない (型エラー)", () => {
    // @ts-expect-error 非同期関数は flowAsync を使う
    Result.flow(Result.ok(1), async (n: number) => n);
  });
});

describe("flowAsync", () => {
  const verify = async (t: string): Result.ResultAsync<string, AuthError> =>
    t.startsWith("valid")
      ? Result.ok(t.slice(6))
      : Result.err(new AuthError("invalid"));

  it("同期・非同期の関数を混ぜてつなげられる", async () => {
    const p = Result.flowAsync(
      Result.ok({ token: "valid:a@b" }),
      getToken,
      verify,
      async (mail) => tokenToUser(mail),
      saveUser,
    );
    assertType<
      Equal<typeof p, Result.ResultAsync<number, AuthError | DbError>>
    >();
    expect(await p).toEqual(Result.ok(1));
  });

  it("ResultAsync から始められる", async () => {
    const r = await Result.flowAsync(verify("valid:x@y"), tokenToUser);
    expect(r).toEqual(Result.ok({ mail: "x@y" }));
  });

  it("途中で Failure になったら残りの関数は呼ばない", async () => {
    let called = false;
    const r = await Result.flowAsync(
      Result.ok({ token: "bad" }),
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
    const p = Result.flowAsync(Result.ok({}), getToken, verify);
    expect(p).toBeInstanceOf(Promise);
    expect((await p).isErr()).toBe(true);
  });

  it("関数が throw / reject した場合は Failure にせず reject する", async () => {
    const p = Result.flowAsync(Result.ok(1), async () => {
      throw new Error("boom");
    });
    await expect(p).rejects.toThrow("boom");
  });
});
