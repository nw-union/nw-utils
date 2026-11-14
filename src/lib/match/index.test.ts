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
        .with({ type: "Success" }, () => 200)
        .with({ type: "Failure", error: P.instanceOf(NotFound) }, () => 404)
        .with({ type: "Failure", error: P.instanceOf(Forbidden) }, () => 403)
        .exhaustive();
    expect([toStatus(find(1)), toStatus(find(2)), toStatus(find(3))]).toEqual([
      200, 403, 404,
    ]);
  });

  it("handler は Success / Failure に絞り込まれる", () => {
    match(find(1))
      .with({ type: "Success" }, ({ value }) => {
        assertType<Equal<typeof value, { name: string }>>();
      })
      .with({ type: "Failure" }, ({ error }) => {
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
        .with({ type: "Success", value: { name: "a" } }, () => "admin")
        .with({ type: "Success", value: { name: P.select() } }, (name) => name)
        .with({ type: "Failure" }, ({ error }) => error.message)
        .exhaustive();
    expect(greet(find(1))).toBe("admin");
    expect(greet(ok({ name: "b" }))).toBe("b");
    expect(greet(find(3))).toBe("not found");
  });

  it("中身の一部だけの分岐では網羅にならない", () => {
    const _check = (r: Result<{ name: string }, Error>) =>
      match(r)
        .with({ type: "Success", value: { name: "a" } }, () => 1)
        .with({ type: "Failure" }, () => 2)
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

  it("オブジェクトの中で使い、まとめて網羅できる", () => {
    const toStatus = (r: Result<number, NotFound | Forbidden>) =>
      match(r)
        .with({ type: "Success" }, () => 200)
        .with(
          {
            type: "Failure",
            error: P.union(P.instanceOf(NotFound), P.instanceOf(Forbidden)),
          },
          ({ error }) => {
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
        .with({ type: "Success" }, () => 1)
        // @ts-expect-error Success はすでに一致済み
        .with({ type: "Success" }, () => 2)
        .with({ type: "Failure" }, () => 3);
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
