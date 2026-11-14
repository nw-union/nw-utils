import { describe, expect, it } from "bun:test";
import { err, ok, type Result } from "../rslt/index.js";
import { match, NonExhaustiveError, P } from "./index.js";

// 型が等しいかを確かめる (型テスト用)
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
const assertType = <_T extends true>() => {};

class NotFound extends Error {
  readonly kind = "NotFound";
}
class Forbidden extends Error {
  readonly kind = "Forbidden";
}

describe("リテラル", () => {
  const f = (v: "a" | "b" | 1 | true | null | undefined) =>
    match(v)
      .with("a", () => "A")
      .with("b", () => "B")
      .with(1, () => "one")
      .with(true, () => "true")
      .with(null, () => "null")
      .with(undefined, () => "undefined")
      .exhaustive();

  it("=== で一致する", () => {
    expect([f("a"), f("b"), f(1), f(true), f(null), f(undefined)]).toEqual([
      "A",
      "B",
      "one",
      "true",
      "null",
      "undefined",
    ]);
  });

  it("handler はリテラル型に絞り込まれる", () => {
    match("x" as string | null)
      .with(null, (v) => {
        assertType<Equal<typeof v, null>>();
      })
      .with("x", (v) => {
        assertType<Equal<typeof v, "x">>();
      });
  });
});

describe("P.string / P.boolean", () => {
  const f = (v: string | boolean | null) =>
    match(v)
      .with(P.string, (s) => `string:${s}`)
      .with(P.boolean, (b) => `boolean:${b}`)
      .with(null, () => "null")
      .exhaustive();

  it("型で一致する", () => {
    expect([f("x"), f(false), f(null)]).toEqual([
      "string:x",
      "boolean:false",
      "null",
    ]);
  });

  it("handler は string / boolean に絞り込まれる", () => {
    match("x" as string | boolean | null)
      .with(P.string, (v) => {
        assertType<Equal<typeof v, string>>();
      })
      .with(P.boolean, (v) => {
        assertType<Equal<typeof v, boolean>>();
      });
  });

  it("null の分岐がないと型エラーになる", () => {
    const _check = (v: string | null) =>
      match(v)
        .with(P.string, (s) => s)
        // @ts-expect-error null の分岐がない
        .exhaustive();
  });

  it("boolean は true / false の両方で網羅できる", () => {
    const g = (v: boolean) =>
      match(v)
        .with(true, () => 1)
        .with(false, () => 0)
        .exhaustive();
    expect([g(true), g(false)]).toEqual([1, 0]);

    const _check = (v: boolean) =>
      match(v)
        .with(true, () => 1)
        // @ts-expect-error false の分岐がない
        .exhaustive();
  });

  it("string の一部のリテラルだけでは網羅にならない", () => {
    const _check = (v: string) =>
      match(v)
        .with("a", () => 1)
        // @ts-expect-error "a" 以外の string が残る
        .exhaustive();
  });
});

describe("オブジェクト", () => {
  type Shape =
    | { kind: "circle"; r: number }
    | { kind: "rect"; w: number; h: number };

  const area = (s: Shape) =>
    match(s)
      .with({ kind: "circle" }, ({ r }) => r * r * 3)
      .with({ kind: "rect" }, ({ w, h }) => w * h)
      .exhaustive();

  it("部分一致で分岐し、handler は判別共用体のメンバーに絞り込まれる", () => {
    expect(area({ kind: "circle", r: 1 })).toBe(3);
    expect(area({ kind: "rect", w: 2, h: 3 })).toBe(6);
  });

  it("ネストしたパターンで分岐できる", () => {
    const f = (v: { user: { role: "admin" | "member"; name: string } }) =>
      match(v)
        .with({ user: { role: "admin" } }, () => "admin")
        .with({ user: { role: "member" } }, ({ user }) => user.name)
        .exhaustive();
    expect(f({ user: { role: "admin", name: "a" } })).toBe("admin");
    expect(f({ user: { role: "member", name: "b" } })).toBe("b");
  });

  it("キーがない値や null / プリミティブには一致しない", () => {
    const f = (v: unknown) =>
      match(v)
        .with({ a: 1 }, () => "a")
        .with(P.select(), () => "other")
        .exhaustive();
    expect([f({ a: 1 }), f({}), f(null), f(1), f({ a: 2 })]).toEqual([
      "a",
      "other",
      "other",
      "other",
      "other",
    ]);
  });

  it("書き忘れたメンバーがあると型エラーになる", () => {
    const _check = (s: Shape) =>
      match(s)
        .with({ kind: "circle" }, () => 1)
        // @ts-expect-error rect の分岐がない
        .exhaustive();
  });

  it("存在しないキーや取りえないリテラルは書けない", () => {
    const s = { kind: "circle", r: 1 } as Shape;
    // @ts-expect-error kind に "triangle" はない
    match(s).with({ kind: "triangle" }, () => 1);
    // @ts-expect-error foo というキーはない
    match(s).with({ foo: 1 }, () => 1);
  });
});

describe("P.instanceOf", () => {
  const f = (e: NotFound | Forbidden) =>
    match(e)
      .with(P.instanceOf(NotFound), (v) => {
        assertType<Equal<typeof v, NotFound>>();
        return 404;
      })
      .with(P.instanceOf(Forbidden), () => 403)
      .exhaustive();

  it("instanceof で一致する", () => {
    expect([f(new NotFound()), f(new Forbidden())]).toEqual([404, 403]);
  });

  it("クラスを書き忘れると型エラーになる", () => {
    const _check = (e: NotFound | Forbidden) =>
      match(e)
        .with(P.instanceOf(NotFound), () => 404)
        // @ts-expect-error Forbidden の分岐がない
        .exhaustive();
  });
});

describe("P.select", () => {
  it("その位置の値を handler に渡す", () => {
    const f = (v: { user: { name: string } } | null) =>
      match(v)
        .with({ user: { name: P.select() } }, (name) => {
          assertType<Equal<typeof name, string>>();
          return name;
        })
        .with(null, () => "none")
        .exhaustive();
    expect([f({ user: { name: "a" } }), f(null)]).toEqual(["a", "none"]);
  });

  it("値が undefined でも select した値を渡す", () => {
    const v: { a: string | undefined } = { a: undefined };
    const r = match(v)
      .with({ a: P.select() }, (a) => a)
      .exhaustive();
    expect(r).toBeUndefined();
  });

  it("トップレベルの P.select() は何にでも一致し、網羅になる", () => {
    const f = (v: number) =>
      match(v)
        .with(1, () => "one")
        .with(P.select(), (n) => `n:${n}`)
        .exhaustive();
    expect([f(1), f(2)]).toEqual(["one", "n:2"]);
  });
});

describe("Result との組み合わせ", () => {
  const find = (id: number): Result<{ name: string }, NotFound | Forbidden> =>
    id === 1
      ? ok({ name: "a" })
      : id === 2
        ? err(new Forbidden("forbidden"))
        : err(new NotFound("not found"));

  it("エラーのクラスごとに分岐できる", () => {
    const toStatus = (r: Result<{ name: string }, NotFound | Forbidden>) =>
      match(r)
        .ok(() => 200)
        .err(P.instanceOf(NotFound), () => 404)
        .err(P.instanceOf(Forbidden), () => 403)
        .exhaustive();
    expect([toStatus(find(1)), toStatus(find(2)), toStatus(find(3))]).toEqual([
      200, 403, 404,
    ]);
  });

  it("handler は値 / エラーを受け取る", () => {
    match(find(1))
      .ok((value) => {
        assertType<Equal<typeof value, { name: string }>>();
      })
      .err((error) => {
        assertType<Equal<typeof error, NotFound | Forbidden>>();
      });
  });

  it("戻り値は handler の戻り値の union になる", () => {
    const f = (v: string | null): Result<string, Error> =>
      match(v)
        .with(P.string, (s) => ok(s))
        .with(null, () => err(new Error("null")))
        .exhaustive();
    expect(f("a")).toEqual(ok("a"));
  });

  it("中身が一致しなければ次の分岐へ進む", () => {
    const greet = (r: Result<{ name: string }, NotFound | Forbidden>) =>
      match(r)
        .ok({ name: "a" }, () => "admin")
        .ok({ name: P.select() }, (name) => name)
        .err((error) => error.message)
        .exhaustive();
    expect(greet(find(1))).toBe("admin");
    expect(greet(ok({ name: "b" }))).toBe("b");
    expect(greet(find(3))).toBe("not found");
  });

  it("中身の一部だけの分岐では網羅にならない", () => {
    const _check = (r: Result<{ name: string }, Error>) =>
      match(r)
        .ok({ name: "a" }, () => 1)
        .err(() => 2)
        // @ts-expect-error name が "a" 以外の Success が残る
        .exhaustive();
  });
});

describe("実行時", () => {
  it("最初に一致した handler だけを呼ぶ", () => {
    const called: string[] = [];
    const r = match(1 as number)
      .with(1, () => {
        called.push("first");
        return "first";
      })
      .with(P.select(), () => {
        called.push("second");
        return "second";
      })
      .exhaustive();
    expect(r).toBe("first");
    expect(called).toEqual(["first"]);
  });

  it("どれにも一致しなければ NonExhaustiveError を throw する", () => {
    const f = (v: "a" | "b") =>
      match(v)
        .with("a", () => 1)
        .with("b", () => 2)
        .exhaustive();
    // 型をごまかして渡す
    expect(() => f("c" as "a")).toThrow(NonExhaustiveError);
  });

  it("途中のビルダーを使い回しても結果は混ざらない", () => {
    const base = match(1 as 1 | 2);
    const a = base
      .with(1, () => "a")
      .with(2, () => "b")
      .exhaustive();
    const b = base
      .with(2, () => "x")
      .with(1, () => "y")
      .exhaustive();
    expect([a, b]).toEqual(["a", "y"]);
  });
});

describe("P._", () => {
  it("何にでも一致し、handler は入力全体を受け取る", () => {
    const f = (v: "a" | "b" | "c") =>
      match(v)
        .with("a", () => "A")
        .with(P._, (rest) => {
          assertType<Equal<typeof rest, "a" | "b" | "c">>();
          return `other:${rest}`;
        })
        .exhaustive();
    expect([f("a"), f("c")]).toEqual(["A", "other:c"]);
  });

  it("オブジェクトの中では、キーがあることだけを確かめる", () => {
    const f = (v: { a?: number }) =>
      match(v)
        .with({ a: P._ }, () => "has a")
        .with(P._, () => "no a")
        .exhaustive();
    expect([f({ a: 1 }), f({})]).toEqual(["has a", "no a"]);
  });
});

describe("省略できるキー", () => {
  it("値がなければ一致しないので、網羅にならない", () => {
    const _check = (v: { a?: number }) =>
      match(v)
        .with({ a: P._ }, () => 1)
        // @ts-expect-error a がない値が残る
        .exhaustive();
  });
});

describe("P.union", () => {
  it("いずれかのパターンに一致し、handler はそれらの union を受け取る", () => {
    const f = (v: "a" | "b" | "c") =>
      match(v)
        .with(P.union("a", "b"), (ab) => {
          assertType<Equal<typeof ab, "a" | "b">>();
          return "ab";
        })
        .with("c", () => "c")
        .exhaustive();
    expect([f("a"), f("b"), f("c")]).toEqual(["ab", "ab", "c"]);
  });

  it(".err の中で使い、まとめて網羅できる", () => {
    const toStatus = (r: Result<number, NotFound | Forbidden>) =>
      match(r)
        .ok(() => 200)
        .err(
          P.union(P.instanceOf(NotFound), P.instanceOf(Forbidden)),
          (error) => {
            assertType<Equal<typeof error, NotFound | Forbidden>>();
            return 400;
          },
        )
        .exhaustive();
    expect([toStatus(ok(1)), toStatus(err(new Forbidden()))]).toEqual([
      200, 400,
    ]);
  });

  it("中のパターンが足りなければ網羅にならない", () => {
    const _check = (v: "a" | "b" | "c") =>
      match(v)
        .with(P.union("a", "b"), () => 1)
        // @ts-expect-error "c" の分岐がない
        .exhaustive();
  });

  it("判別共用体のメンバーをまとめられる", () => {
    type Ev =
      | { kind: "click"; x: number }
      | { kind: "tap"; x: number }
      | { kind: "key"; code: string };
    const f = (e: Ev) =>
      match(e)
        .with(P.union({ kind: "click" }, { kind: "tap" }), ({ x }) => x)
        .with({ kind: "key" }, ({ code }) => code)
        .exhaustive();
    expect([f({ kind: "tap", x: 1 }), f({ kind: "key", code: "a" })]).toEqual([
      1,
      "a",
    ]);
  });

  it("中で P.select() を使える", () => {
    const f = (v: { a: string } | { b: string }) =>
      match(v)
        .with(P.union({ a: P.select() }, { b: P.select() }), (s) => {
          assertType<Equal<typeof s, string>>();
          return s;
        })
        .exhaustive();
    expect([f({ a: "x" }), f({ b: "y" })]).toEqual(["x", "y"]);
  });

  it("中にも取りえないリテラルは書けない", () => {
    const v = "a" as "a" | "b";
    // @ts-expect-error "z" は取りえない
    match(v).with(P.union("a", "z"), () => 1);
  });
});

describe("到達しない分岐", () => {
  it("同じパターンを 2 回書くと型エラーになる", () => {
    const _check = (r: Result<number, Error>) =>
      match(r)
        .ok(() => 1)
        // @ts-expect-error Success はすでに一致済み
        .with({ type: "Success" }, () => 2)
        .err(() => 3);
  });

  it("網羅した後の P._ は型エラーになる", () => {
    const _check = (v: boolean) =>
      match(v)
        .with(true, () => 1)
        .with(false, () => 0)
        // @ts-expect-error すべて一致済み
        .with(P._, () => -1);
  });

  it("P.union で一致済みの分岐も検出する", () => {
    const _check = (v: "a" | "b" | "c") =>
      match(v)
        .with(P.union("a", "b"), () => 1)
        // @ts-expect-error "a" はすでに一致済み
        .with("a", () => 2);
  });

  it("一部がまだ残っている分岐はエラーにならない", () => {
    const f = (v: string) =>
      match(v)
        .with("a", () => 1)
        .with(P.string, () => 2)
        .exhaustive();
    expect([f("a"), f("b")]).toEqual([1, 2]);
  });
});

describe(".ok / .err (Result)", () => {
  type User = { name: string; role: "admin" | "member" };
  const r = (
    v: User | NotFound | Forbidden,
  ): Result<User, NotFound | Forbidden> =>
    v instanceof Error ? err(v) : ok(v);

  it("handler だけ渡すと、Success の値 / Failure のエラーを受け取る", () => {
    const f = (x: Result<User, NotFound | Forbidden>) =>
      match(x)
        .ok((user) => {
          assertType<Equal<typeof user, User>>();
          return user.name;
        })
        .err((e) => {
          assertType<Equal<typeof e, NotFound | Forbidden>>();
          return e.kind;
        })
        .exhaustive();
    expect(f(r({ name: "a", role: "admin" }))).toBe("a");
    expect(f(r(new NotFound()))).toBe("NotFound");
  });

  it("パターンを渡すと、中身で分岐できる", () => {
    const toStatus = (x: Result<User, NotFound | Forbidden>) =>
      match(x)
        .ok({ role: "admin" }, (user) => {
          assertType<Equal<(typeof user)["role"], "admin">>();
          return 201;
        })
        .ok(() => 200)
        .err(P.instanceOf(NotFound), (e) => {
          assertType<Equal<typeof e, NotFound>>();
          return 404;
        })
        .err(P.instanceOf(Forbidden), () => 403)
        .exhaustive();
    expect([
      toStatus(r({ name: "a", role: "admin" })),
      toStatus(r({ name: "b", role: "member" })),
      toStatus(r(new NotFound())),
      toStatus(r(new Forbidden())),
    ]).toEqual([201, 200, 404, 403]);
  });

  it("P.select() や P.union と組み合わせられる", () => {
    const f = (x: Result<User, NotFound | Forbidden>) =>
      match(x)
        .ok({ name: P.select() }, (name) => {
          assertType<Equal<typeof name, string>>();
          return name;
        })
        .err(
          P.union(P.instanceOf(NotFound), P.instanceOf(Forbidden)),
          () => "x",
        )
        .exhaustive();
    expect([
      f(r({ name: "a", role: "member" })),
      f(r(new Forbidden())),
    ]).toEqual(["a", "x"]);
  });

  it(".with と混ぜて書ける", () => {
    const f = (x: Result<number, string>) =>
      match(x)
        .with({ type: "Success", value: 0 }, () => "zero")
        .ok((n) => `n:${n}`)
        .err((e) => `e:${e}`)
        .exhaustive();
    expect([f(ok(0)), f(ok(1)), f(err("x"))]).toEqual(["zero", "n:1", "e:x"]);
  });

  it("Result とほかの型の union なら、残りは .with で受ける", () => {
    const f = (x: Result<number, string> | null) =>
      match(x)
        .ok((n) => n)
        .err(() => -1)
        .with(null, () => 0)
        .exhaustive();
    expect([f(ok(5)), f(err("x")), f(null)]).toEqual([5, -1, 0]);

    const _check = (x: Result<number, string> | null) =>
      match(x)
        .ok((n) => n)
        .err(() => -1)
        // @ts-expect-error null の分岐がない
        .exhaustive();
  });

  it("書き忘れると型エラーになる", () => {
    const _noErr = (x: Result<number, string>) =>
      match(x)
        .ok((n) => n)
        // @ts-expect-error err の分岐がない
        .exhaustive();

    const _missingClass = (x: Result<User, NotFound | Forbidden>) =>
      match(x)
        .ok(() => 200)
        .err(P.instanceOf(NotFound), () => 404)
        // @ts-expect-error Forbidden の分岐がない
        .exhaustive();

    const _partialOk = (x: Result<User, NotFound | Forbidden>) =>
      match(x)
        .ok({ role: "admin" }, () => 201)
        .err(() => 400)
        // @ts-expect-error member の Success が残る
        .exhaustive();
  });

  it("到達しない分岐は型エラーになる", () => {
    const _dupOk = (x: Result<number, string>) =>
      match(x)
        .ok(() => 1)
        // @ts-expect-error Success はすでに一致済み
        .ok(() => 2)
        .err(() => 3);

    const _dupErr = (x: Result<number, NotFound | Forbidden>) =>
      match(x)
        .ok(() => 1)
        .err(() => 2)
        // @ts-expect-error Failure はすでに一致済み
        .err(P.instanceOf(NotFound), () => 3);
  });

  it("Result 以外では .ok / .err は使えない", () => {
    const _check = (x: string | null) => {
      // @ts-expect-error string | null に .ok はない
      match(x).ok(() => 1);
      // @ts-expect-error string | null に .err はない
      match(x).err(() => 1);
    };
  });

  it("型をごまかして Result 以外を渡すと、一致せずに NonExhaustiveError になる", () => {
    const f = (x: Result<number, string>) =>
      match(x)
        .ok((n) => n)
        .err(() => -1)
        .exhaustive();
    expect(() => f("oops" as unknown as Result<number, string>)).toThrow(
      NonExhaustiveError,
    );
  });

  it("値のない ok() も Success として一致する", () => {
    const x: Result<void, string> = ok();
    const out = match(x)
      .ok(() => "done")
      .err((e) => e)
      .exhaustive();
    expect(out).toBe("done");
  });
});

describe("存在しえない Result のメンバー", () => {
  it("Result<T, never> は .ok だけで網羅になる", () => {
    const out = match(ok(1))
      .ok((n) => n + 1)
      .exhaustive();
    expect(out).toBe(2);
  });

  it("Result<never, E> は .err だけで網羅になる", () => {
    const out = match(err("x"))
      .err((e) => e)
      .exhaustive();
    expect(out).toBe("x");
  });

  it("型パラメータのままの Result でも網羅性を判定できる", () => {
    const f = <T, E>(x: Result<T, E>) =>
      match(x)
        .ok(() => "ok")
        .err(() => "err")
        .exhaustive();
    expect([f(ok(1)), f(err(2))]).toEqual(["ok", "err"]);

    const _check = <T, E>(x: Result<T, E>) =>
      match(x)
        .ok(() => "ok")
        // @ts-expect-error err の分岐がない
        .exhaustive();
  });
});
