import { describe, expect, it } from "bun:test";
import { match } from "ts-pattern";
import {
  collect,
  collectAsync,
  err,
  flow,
  flowAsync,
  isErr,
  isOk,
  ok,
  type Result,
  type ResultAsync,
  rslt,
  sequence,
  sequenceAsync,
  through,
  throughAsync,
} from "./index.js";

const ok1: Result<number, string> = ok(1);
const ng: Result<number, string> = err("ng");

describe("ok / err", () => {
  it("plain object を返す", () => {
    expect(ok(1)).toEqual({ type: "Success", value: 1 });
    expect(ok()).toEqual({ type: "Success", value: undefined });
    expect(err("e")).toEqual({ type: "Failure", error: "e" });
  });
});

describe("Result の値", () => {
  it("rslt からも同じ関数を使える", () => {
    expect(rslt.ok).toBe(ok);
    expect(rslt.sequence).toBe(sequence);
    expect(typeof rslt.map).toBe("function");
    expect(typeof rslt.try).toBe("function");
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
    const f = (r: Result<number, string>) =>
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
    const r: Result<number, string> = ok1;
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
    const f = (r: Result<number, string>): Result<boolean, string> =>
      isErr(r) ? r : ok(r.value > 0);
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
    expect(rslt.map(ok1, (n) => n + 1)).toEqual(ok(2));
    expect(rslt.map(ng, (n) => n + 1)).toBe(ng);
  });
  it("mapError はエラーのみ変換する", () => {
    expect(rslt.mapError(ng, (e) => e.length)).toEqual(err(2));
    expect(rslt.mapError(ok1, (e) => e.length)).toEqual(ok(1));
  });
});

describe("andThen / orElse", () => {
  const half = (n: number): Result<number, string> =>
    n % 2 === 0 ? ok(n / 2) : err("odd");
  it("andThen は成功時のみ次を実行する", () => {
    expect(rslt.andThen(ok(4), half)).toEqual(ok(2));
    expect(rslt.andThen(ok(3), half)).toEqual(err("odd"));
    let called = false;
    rslt.andThen(ng, (n) => {
      called = true;
      return half(n);
    });
    expect(called).toBe(false);
  });
  it("orElse は失敗時のみフォールバックする", () => {
    expect(rslt.orElse(ng, () => ok(0))).toEqual(ok(0));
    expect(rslt.orElse(ok1, () => ok(0))).toEqual(ok(1));
  });
});

describe("try / tryAsync", () => {
  it("try は例外を Failure に変換する", () => {
    expect(rslt.try(() => 1, String)).toEqual(ok(1));
    expect(
      rslt.try(
        () => {
          throw new Error("boom");
        },
        (e) => (e as Error).message,
      ),
    ).toEqual(err("boom"));
  });
  it("一部だけ Promise を返す関数 (union) も渡せない (型エラー)", () => {
    const maybe = (): number | Promise<number> => 1;
    // @ts-expect-error union の一部が Promise
    rslt.try(maybe, String);
  });

  it("any を返す関数は渡せる", () => {
    expect(rslt.try(() => JSON.parse("1"), String)).toEqual(ok(1));
  });

  it("try に Promise を返す関数は渡せない (型エラー)", () => {
    // @ts-expect-error 非同期関数は tryAsync を使う
    rslt.try(async () => 1, String);
  });
  it("tryAsync は resolve を Success に、reject を Failure に変換する", async () => {
    expect(await rslt.tryAsync(async () => 1, String)).toEqual(ok(1));
    expect(
      await rslt.tryAsync(
        () => Promise.reject(new Error("boom")),
        (e) => (e as Error).message,
      ),
    ).toEqual(err("boom"));
  });
  it("tryAsync は同期的な throw も Failure にする", async () => {
    const r = rslt.tryAsync(
      () => {
        throw new Error("sync");
      },
      (e) => (e as Error).message,
    );
    expect(r).toBeInstanceOf(Promise);
    expect(await r).toEqual(err("sync"));
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

const getToken = (req: { token?: string }): Result<string, AuthError> =>
  req.token ? ok(req.token) : err(new AuthError("no token"));
const tokenToUser = (mail: string): User => ({ mail });
const saveUser = (u: User): Result<number, DbError> =>
  u.mail.includes("@") ? ok(1) : err(new DbError("db"));

describe("flow", () => {
  it("Result を返す関数と値を返す関数を混ぜてつなげられる", () => {
    const r = flow(ok({ token: "a@b" }), getToken, tokenToUser, saveUser);
    assertType<Equal<typeof r, Result<number, AuthError | DbError>>>();
    expect(r).toEqual(ok(1));
  });

  it("値だけを返す関数のエラー型は増えない", () => {
    const r = flow(ok({ token: "a@b" }), getToken, tokenToUser);
    assertType<Equal<typeof r, Result<User, AuthError>>>();
  });

  it("途中で Failure になったら残りの関数は呼ばない", () => {
    const calls: string[] = [];
    const r = flow(
      ok({}),
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
    const r = flow(err("ng"), () => {
      called = true;
      return 1;
    });
    expect(r).toEqual(err("ng"));
    expect(called).toBe(false);
  });

  it("Result と同じ形の object は Result として扱う (型も同じ扱い)", () => {
    const r = flow(ok(1), () => ({ type: "Failure" as const, error: "data" }));
    assertType<Equal<typeof r, Result<never, string>>>();
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
    const r = flow(ok(0), inc, inc, inc, inc, inc, inc, inc, inc, inc, inc);
    expect(r).toEqual(ok(10));
  });

  it("一部だけ Promise を返す関数 (union) も渡せない (型エラー)", () => {
    // @ts-expect-error union の一部が Promise
    flow(ok(1), (n: number) => (n > 0 ? n : Promise.resolve(n)));
  });

  it("Promise を返す関数は渡せない (型エラー)", () => {
    // @ts-expect-error 非同期関数は flowAsync を使う
    flow(ok(1), async (n: number) => n);
  });
});

describe("flowAsync", () => {
  const verify = async (t: string): ResultAsync<string, AuthError> =>
    t.startsWith("valid") ? ok(t.slice(6)) : err(new AuthError("invalid"));

  it("同期・非同期の関数を混ぜてつなげられる", async () => {
    const p = flowAsync(
      ok({ token: "valid:a@b" }),
      getToken,
      verify,
      async (mail) => tokenToUser(mail),
      saveUser,
    );
    assertType<Equal<typeof p, ResultAsync<number, AuthError | DbError>>>();
    expect(await p).toEqual(ok(1));
  });

  it("ResultAsync から始められる", async () => {
    const r = await flowAsync(verify("valid:x@y"), tokenToUser);
    expect(r).toEqual(ok({ mail: "x@y" }));
  });

  it("途中で Failure になったら残りの関数は呼ばない", async () => {
    let called = false;
    const r = await flowAsync(
      ok({ token: "bad" }),
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
    const p = flowAsync(ok({}), getToken, verify);
    expect(p).toBeInstanceOf(Promise);
    expect(isErr(await p)).toBe(true);
  });

  it("関数が throw / reject した場合は Failure にせず reject する", async () => {
    const p = flowAsync(ok(1), async () => {
      throw new Error("boom");
    });
    await expect(p).rejects.toThrow("boom");
  });
});

// ----------------------------------------------------------------------------
// sequence / collect
// ----------------------------------------------------------------------------

describe("sequence", () => {
  const a: Result<number, string> = ok(1);
  const b: Result<string, Error> = ok("x");

  it("タプルの形と型を保って成功値をまとめる", () => {
    const r = sequence([a, b]);
    assertType<Equal<typeof r, Result<[number, string], string | Error>>>();
    expect(r).toEqual(ok([1, "x"]));
  });

  it("オブジェクトのキーを保って成功値をまとめる", () => {
    const r = sequence({ id: a, name: b });
    assertType<
      Equal<typeof r, Result<{ id: number; name: string }, string | Error>>
    >();
    expect(r).toEqual(ok({ id: 1, name: "x" }));
  });

  it("interface で型付けしたオブジェクトも受け取れる", () => {
    interface Form {
      id: Result<number, string>;
      name: Result<string, Error>;
    }
    const form: Form = { id: ok(1), name: ok("x") };
    const r = sequence(form);
    assertType<
      Equal<typeof r, Result<{ id: number; name: string }, string | Error>>
    >();
    const c = collect(form);
    assertType<
      Equal<typeof c, Result<{ id: number; name: string }, (string | Error)[]>>
    >();
    expect(r).toEqual(ok({ id: 1, name: "x" }));
  });

  it("Result 以外を含むものは渡せない (型エラー)", () => {
    // 型のチェックだけを目的とするので、実行はしない
    const _check = () =>
      // @ts-expect-error 値が Result ではない
      sequence({ a: 1 });
  });

  it("可変長の配列もまとめられる", () => {
    const list: Result<number, string>[] = [ok(1), ok(2), ok(3)];
    const r = sequence(list);
    assertType<Equal<typeof r, Result<number[], string>>>();
    expect(r).toEqual(ok([1, 2, 3]));
  });

  it("入力の順番で最初の Failure を返す", () => {
    expect(sequence([ok(1), err("e1"), err("e2")])).toEqual(err("e1"));
    expect(sequence({ x: err("e1"), y: err("e2") })).toEqual(err("e1"));
  });

  it("空なら空の成功", () => {
    expect(sequence([])).toEqual(ok([]));
    expect(sequence({})).toEqual(ok({}));
  });
});

describe("collect", () => {
  it("すべて成功なら sequence と同じ", () => {
    const r = collect({ id: ok(1), name: ok("x") });
    assertType<
      Equal<typeof r, Result<{ id: number; name: string }, never[]>>
    >();
    expect(r).toEqual(ok({ id: 1, name: "x" }));
  });

  it("失敗があればすべてのエラーを入力の順番で返す", () => {
    const a: Result<number, string> = err("e1");
    const b: Result<string, Error> = ok("x");
    const c: Result<boolean, string> = err("e3");
    const r = collect([a, b, c]);
    assertType<
      Equal<typeof r, Result<[number, string, boolean], (string | Error)[]>>
    >();
    expect(r).toEqual(err(["e1", "e3"]));
  });
});

describe("sequenceAsync / collectAsync", () => {
  const later = <T>(ms: number, r: Result<T, string>) =>
    new Promise<Result<T, string>>((res) => setTimeout(() => res(r), ms));

  it("Result と ResultAsync を混ぜてまとめられる", async () => {
    const p = sequenceAsync({ user: later(5, ok("u")), n: ok(1) });
    assertType<
      Equal<typeof p, ResultAsync<{ user: string; n: number }, string>>
    >();
    expect(await p).toEqual(ok({ user: "u", n: 1 }));
  });

  it("完了の順番に関係なく、すべての完了を待ってから入力の形で返す", async () => {
    // 手動で resolve できる Promise を使い、時間に依存せずに確かめる
    const deferred = <T>() => {
      let resolve!: (r: Result<T, string>) => void;
      const promise = new Promise<Result<T, string>>((res) => {
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
    const p = sequenceAsync([d1.promise, d2.promise, d3.promise]).then((r) => {
      done = true;
      return r;
    });
    // 後ろから順に完了させる
    d3.resolve(ok(3));
    d2.resolve(ok(2));
    await Promise.resolve();
    expect(done).toBe(false); // まだ d1 が終わっていない
    d1.resolve(ok(1));
    expect(await p).toEqual(ok([1, 2, 3]));
  });

  it("sequenceAsync は先に終わった失敗ではなく、入力の順番で最初の Failure を返す", async () => {
    const r = await sequenceAsync([
      later(20, err("slow")),
      later(1, err("fast")),
    ]);
    expect(r).toEqual(err("slow"));
  });

  it("collectAsync はすべてのエラーを集める", async () => {
    const p = collectAsync([later(5, err("e1")), ok(2), later(1, err("e3"))]);
    assertType<
      Equal<typeof p, ResultAsync<[never, number, never], string[]>>
    >();
    expect(await p).toEqual(err(["e1", "e3"]));
  });

  it("渡した Promise が reject したら、Failure ではなく reject する", async () => {
    const boom = Promise.reject(new Error("boom"));
    await expect(sequenceAsync([ok(1), boom])).rejects.toThrow("boom");
    await expect(collectAsync({ a: ok(1), b: boom })).rejects.toThrow("boom");
  });

  it("同期的な Result だけでも必ず Promise を返す", () => {
    expect(sequenceAsync([err("e")])).toBeInstanceOf(Promise);
    expect(collectAsync([err("e")])).toBeInstanceOf(Promise);
  });
});

// ----------------------------------------------------------------------------
// through / throughAsync / andThrough
// ----------------------------------------------------------------------------

describe("through", () => {
  const checkNotBanned = (mail: string): Result<void, AuthError> =>
    mail.startsWith("banned") ? err(new AuthError("banned")) : ok();

  it("void を返す関数を挟んでも、元の値がそのまま次に渡る", () => {
    const logs: string[] = [];
    const r = flow(
      ok({ token: "a@b" }),
      getToken,
      through((t) => {
        logs.push(t); // t は string と推論される
      }),
      tokenToUser,
    );
    assertType<Equal<typeof r, Result<User, AuthError>>>();
    expect(r).toEqual(ok({ mail: "a@b" }));
    expect(logs).toEqual(["a@b"]);
  });

  it("成功の Result を返したら元の値を渡し、Failure ならそこで止まる", () => {
    const ok1 = flow(
      ok({ token: "a@b" }),
      getToken,
      through(checkNotBanned),
      tokenToUser,
    );
    assertType<Equal<typeof ok1, Result<User, AuthError>>>();
    expect(ok1).toEqual(ok({ mail: "a@b" }));

    let called = false;
    const ng1 = flow(
      ok({ token: "banned@b" }),
      getToken,
      through(checkNotBanned),
      (t) => {
        called = true;
        return tokenToUser(t);
      },
    );
    expect(isErr(ng1) && ng1.error.message).toBe("banned");
    expect(called).toBe(false);
  });

  it("through で増えるエラー型は fn が返す Failure の型だけ", () => {
    const r = flow(
      ok(1),
      through((n: number) => (n > 0 ? ok() : err(new DbError("db")))),
    );
    assertType<Equal<typeof r, Result<number, DbError>>>();
    const v = flow(
      ok(1),
      through((n: number) => n * 2),
    ); // 値を返しても捨てる
    assertType<Equal<typeof v, Result<number, never>>>();
    expect(v).toEqual(ok(1));
  });

  it("Promise を返す関数は渡せない (型エラー)", () => {
    // @ts-expect-error 非同期関数は throughAsync を使う
    through(async (n: number) => n);
  });
});

describe("throughAsync", () => {
  it("flowAsync の中で非同期の処理を挟み、元の値を渡す", async () => {
    const saved: string[] = [];
    const save = async (t: string): ResultAsync<void, DbError> => {
      saved.push(t);
      return ok();
    };
    const p = flowAsync(
      ok({ token: "a@b" }),
      getToken,
      throughAsync(save),
      tokenToUser,
    );
    assertType<Equal<typeof p, ResultAsync<User, AuthError | DbError>>>();
    expect(await p).toEqual(ok({ mail: "a@b" }));
    expect(saved).toEqual(["a@b"]);
  });

  it("非同期の処理が Failure を返したらそこで止まる", async () => {
    const fail = async (_: string): ResultAsync<void, DbError> =>
      err(new DbError("db down"));
    const r = await flowAsync(
      ok({ token: "a@b" }),
      getToken,
      throughAsync(fail),
      tokenToUser,
    );
    expect(isErr(r) && r.error.message).toBe("db down");
  });
});

describe("andThrough", () => {
  it("成功なら fn を実行して元の Result を返す", () => {
    const seen: number[] = [];
    const r = rslt.andThrough(ok(1), (n) => {
      seen.push(n);
    });
    expect(r).toEqual(ok(1));
    expect(seen).toEqual([1]);
  });

  it("fn が Failure を返したらその Failure、元が Failure なら fn を呼ばない", () => {
    const src: Result<number, string> = ok(1);
    const r = rslt.andThrough(src, (n) =>
      n > 0 ? err(new DbError("db")) : ok(),
    );
    assertType<Equal<typeof r, Result<number, string | DbError>>>();
    expect(isErr(r) && r.error).toBeInstanceOf(DbError);

    let called = false;
    rslt.andThrough(err("ng"), () => {
      called = true;
    });
    expect(called).toBe(false);
  });
});
