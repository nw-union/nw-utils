import { describe, expect, it } from "bun:test";
import { match } from "ts-pattern";
import { err, flow, flowAsync, isErr, isOk, ok, Result } from "./index.js";

const ok1: Result.Result<number, string> = Result.ok(1);
const ng: Result.Result<number, string> = Result.err("ng");

describe("ok / err", () => {
  it("plain object を返す", () => {
    expect(Result.ok(1)).toEqual({ type: "Success", value: 1 });
    expect(Result.ok()).toEqual({ type: "Success", value: undefined });
    expect(Result.err("e")).toEqual({ type: "Failure", error: "e" });
  });
});

describe("Result の値", () => {
  it("直接 import した関数は Result.xxx と同じもの", () => {
    expect(ok).toBe(Result.ok);
    expect(err).toBe(Result.err);
    expect(isOk).toBe(Result.isOk);
    expect(isErr).toBe(Result.isErr);
    expect(flow).toBe(Result.flow);
    expect(flowAsync).toBe(Result.flowAsync);
  });
  it("frozen なので書き換えられない", () => {
    const r = ok(1);
    expect(Object.isFrozen(r)).toBe(true);
    expect(() => {
      (r as { value: number }).value = 2;
    }).toThrow();
  });
  it("JSON に変換できる", () => {
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
    if (isOk(r)) {
      const v: number = r.value;
      expect(v).toBe(1);
    }
    if (isErr(ng)) {
      const e: string = ng.error;
      expect(e).toBe("ng");
    }
  });
  it("isErr で絞り込んだ Failure は別の成功型の Result としてそのまま返せる", () => {
    const f = (
      r: Result.Result<number, string>,
    ): Result.Result<boolean, string> => (isErr(r) ? r : ok(r.value > 0));
    expect(Object.is(f(ng), ng)).toBe(true);
    expect(f(ok1)).toEqual(ok(true));
  });

  it("判定できる", () => {
    expect(isOk(ok1)).toBe(true);
    expect(isErr(ok1)).toBe(false);
    expect(isOk(ng)).toBe(false);
    expect(isErr(ng)).toBe(true);
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
  it("一部だけ Promise を返す関数 (union) も渡せない (型エラー)", () => {
    const maybe = (): number | Promise<number> => 1;
    // @ts-expect-error union の一部が Promise
    Result.try(maybe, String);
  });

  it("any を返す関数は渡せる", () => {
    expect(Result.try(() => JSON.parse("1"), String)).toEqual(ok(1));
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
    expect(isErr(r) && r.error.message).toBe("no token");
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

  it("Result と同じ形の object は Result として扱う (型も同じ扱い)", () => {
    const r = flow(ok(1), () => ({ type: "Failure" as const, error: "data" }));
    assertType<Equal<typeof r, Result.Result<never, string>>>();
    expect(r).toEqual(err("data"));
  });

  it("JSON を経由して value が消えた ok() も Result として扱う", () => {
    const fromJson = JSON.parse(JSON.stringify(ok())); // { type: "Success" }
    const r = flow(ok(1), () => fromJson);
    expect(isOk(r)).toBe(true);
    expect(isOk(r) && r.value).toBeUndefined();
    // type 以外のキーを持つ場合は Result とみなさない
    const other = flow(ok(1), () => ({ type: "Success", id: 1 }));
    expect(other).toEqual(ok({ type: "Success", id: 1 }));
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

  it("一部だけ Promise を返す関数 (union) も渡せない (型エラー)", () => {
    // @ts-expect-error union の一部が Promise
    flow(ok(1), (n: number) => (n > 0 ? n : Promise.resolve(n)));
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
    expect(isErr(r) && r.error.message).toBe("invalid");
    expect(called).toBe(false);
  });

  it("同期的に Failure で終わっても必ず Promise を返す", async () => {
    const p = Result.flowAsync(Result.ok({}), getToken, verify);
    expect(p).toBeInstanceOf(Promise);
    expect(isErr(await p)).toBe(true);
  });

  it("関数が throw / reject した場合は Failure にせず reject する", async () => {
    const p = Result.flowAsync(Result.ok(1), async () => {
      throw new Error("boom");
    });
    await expect(p).rejects.toThrow("boom");
  });
});

// ----------------------------------------------------------------------------
// sequence / collect
// ----------------------------------------------------------------------------

describe("sequence", () => {
  const a: Result.Result<number, string> = ok(1);
  const b: Result.Result<string, Error> = ok("x");

  it("タプルの形と型を保って成功値をまとめる", () => {
    const r = Result.sequence([a, b]);
    assertType<
      Equal<typeof r, Result.Result<[number, string], string | Error>>
    >();
    expect(r).toEqual(ok([1, "x"]));
  });

  it("オブジェクトのキーを保って成功値をまとめる", () => {
    const r = Result.sequence({ id: a, name: b });
    assertType<
      Equal<
        typeof r,
        Result.Result<{ id: number; name: string }, string | Error>
      >
    >();
    expect(r).toEqual(ok({ id: 1, name: "x" }));
  });

  it("interface で型付けしたオブジェクトも受け取れる", () => {
    interface Form {
      id: Result.Result<number, string>;
      name: Result.Result<string, Error>;
    }
    const form: Form = { id: ok(1), name: ok("x") };
    const r = Result.sequence(form);
    assertType<
      Equal<
        typeof r,
        Result.Result<{ id: number; name: string }, string | Error>
      >
    >();
    const c = Result.collect(form);
    assertType<
      Equal<
        typeof c,
        Result.Result<{ id: number; name: string }, (string | Error)[]>
      >
    >();
    expect(r).toEqual(ok({ id: 1, name: "x" }));
  });

  it("Result 以外を含むものは渡せない (型エラー)", () => {
    // 型のチェックだけを目的とするので、実行はしない
    const _check = () =>
      // @ts-expect-error 値が Result ではない
      Result.sequence({ a: 1 });
  });

  it("可変長の配列もまとめられる", () => {
    const list: Result.Result<number, string>[] = [ok(1), ok(2), ok(3)];
    const r = Result.sequence(list);
    assertType<Equal<typeof r, Result.Result<number[], string>>>();
    expect(r).toEqual(ok([1, 2, 3]));
  });

  it("入力の順番で最初の Failure を返す", () => {
    expect(Result.sequence([ok(1), err("e1"), err("e2")])).toEqual(err("e1"));
    expect(Result.sequence({ x: err("e1"), y: err("e2") })).toEqual(err("e1"));
  });

  it("空なら空の成功", () => {
    expect(Result.sequence([])).toEqual(ok([]));
    expect(Result.sequence({})).toEqual(ok({}));
  });
});

describe("collect", () => {
  it("すべて成功なら sequence と同じ", () => {
    const r = Result.collect({ id: ok(1), name: ok("x") });
    assertType<
      Equal<typeof r, Result.Result<{ id: number; name: string }, never[]>>
    >();
    expect(r).toEqual(ok({ id: 1, name: "x" }));
  });

  it("失敗があればすべてのエラーを入力の順番で返す", () => {
    const a: Result.Result<number, string> = err("e1");
    const b: Result.Result<string, Error> = ok("x");
    const c: Result.Result<boolean, string> = err("e3");
    const r = Result.collect([a, b, c]);
    assertType<
      Equal<
        typeof r,
        Result.Result<[number, string, boolean], (string | Error)[]>
      >
    >();
    expect(r).toEqual(err(["e1", "e3"]));
  });
});

describe("sequenceAsync / collectAsync", () => {
  const later = <T>(ms: number, r: Result.Result<T, string>) =>
    new Promise<Result.Result<T, string>>((res) =>
      setTimeout(() => res(r), ms),
    );

  it("Result と ResultAsync を混ぜてまとめられる", async () => {
    const p = Result.sequenceAsync({ user: later(5, ok("u")), n: ok(1) });
    assertType<
      Equal<typeof p, Result.ResultAsync<{ user: string; n: number }, string>>
    >();
    expect(await p).toEqual(ok({ user: "u", n: 1 }));
  });

  it("完了の順番に関係なく、すべての完了を待ってから入力の形で返す", async () => {
    // 手動で resolve できる Promise を使い、時間に依存せずに確かめる
    const deferred = <T>() => {
      let resolve!: (r: Result.Result<T, string>) => void;
      const promise = new Promise<Result.Result<T, string>>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };
    const [d1, d2, d3] = [
      deferred<number>(),
      deferred<number>(),
      deferred<number>(),
    ];
    let done = false;
    const p = Result.sequenceAsync([d1.promise, d2.promise, d3.promise]).then(
      (r) => {
        done = true;
        return r;
      },
    );
    // 後ろから順に完了させる
    d3.resolve(ok(3));
    d2.resolve(ok(2));
    await Promise.resolve();
    expect(done).toBe(false); // まだ d1 が終わっていない
    d1.resolve(ok(1));
    expect(await p).toEqual(ok([1, 2, 3]));
  });

  it("sequenceAsync は先に終わった失敗ではなく、入力の順番で最初の Failure を返す", async () => {
    const r = await Result.sequenceAsync([
      later(20, err("slow")),
      later(1, err("fast")),
    ]);
    expect(r).toEqual(err("slow"));
  });

  it("collectAsync はすべてのエラーを集める", async () => {
    const p = Result.collectAsync([
      later(5, err("e1")),
      ok(2),
      later(1, err("e3")),
    ]);
    assertType<
      Equal<typeof p, Result.ResultAsync<[never, number, never], string[]>>
    >();
    expect(await p).toEqual(err(["e1", "e3"]));
  });

  it("渡した Promise が reject したら、Failure ではなく reject する", async () => {
    const boom = Promise.reject(new Error("boom"));
    await expect(Result.sequenceAsync([ok(1), boom])).rejects.toThrow("boom");
    await expect(Result.collectAsync({ a: ok(1), b: boom })).rejects.toThrow(
      "boom",
    );
  });

  it("同期的な Result だけでも必ず Promise を返す", () => {
    expect(Result.sequenceAsync([err("e")])).toBeInstanceOf(Promise);
    expect(Result.collectAsync([err("e")])).toBeInstanceOf(Promise);
  });
});
