import { describe, expect, it } from "bun:test";
import { ValidationError } from "../../error.js";
import { isErr, type Result, rslt } from "../rslt/index.js";
import { type Brand, type InferVo, newVo, v, withName } from "./index.js";

// テスト用: 成功値 / エラーを取り出す (逆側なら throw してテストを失敗させる)
const unwrap = <T, E>(r: Result<T, E>): T => {
  if (isErr(r))
    throw new Error(`expected Success but got Failure: ${String(r.error)}`);
  return r.value;
};
const unwrapErr = <T, E>(r: Result<T, E>): E => {
  if (!isErr(r)) throw new Error("expected Failure but got Success");
  return r.error;
};

const email = v.chain(v.string, v.email);
const newEmail = newVo("Email", email);
type Email = InferVo<typeof newEmail>;

describe("newVo", () => {
  it("有効な値なら ok を返し、brand 付きの型になる", () => {
    const value: Email = unwrap(newEmail("test@example.com"));
    expect<string>(value).toBe("test@example.com");

    // @ts-expect-error ただの string は Email に代入できない
    const bad: Email = "test@example.com";
    // 型は string & Brand<"Email">
    const branded: string & Brand<"Email"> = value;
    expect<string>(bad).toBe(branded);
  });

  it("無効な値なら ValidationError を返す", () => {
    const error = unwrapErr(newEmail("invalid-email"));

    expect(error.code).toBe("Validation Error");
    expect(error.message).toBe("Email is invalid. ( type: Email )");
    expect(error.details).toEqual([
      'Email: Invalid email: Received "invalid-email"',
    ]);
  });

  it("型が違う場合は型エラーのメッセージになる", () => {
    expect(unwrapErr(newEmail(1)).details).toEqual([
      "Email: Invalid type: Expected string but received 1",
    ]);
    expect(isErr(newEmail(null))).toBe(true);
    expect(isErr(newEmail(undefined))).toBe(true);
  });

  it("1 引数なので Array.map にそのまま渡せる", () => {
    const errors = ["a@example.com", "bad", "bad"]
      .map(newEmail)
      .filter(isErr)
      .map((r) => r.error.message);

    expect(errors).toEqual([
      "Email is invalid. ( type: Email )",
      "Email is invalid. ( type: Email )",
    ]);
  });

  it("emptyAsNull と組み合わせると任意項目になり、null には brand が付かない", () => {
    const newOptionalEmail = newVo("Email", v.emptyAsNull(email));
    const value: Email | null = unwrap(newOptionalEmail(""));

    expect(value).toBeNull();
    expect<string | null>(unwrap(newOptionalEmail("a@example.com"))).toBe(
      "a@example.com",
    );
    expect(isErr(newOptionalEmail("invalid"))).toBe(true);
  });

  it("数値のパーサーでも使える", () => {
    const newAge = newVo(
      "Age",
      v.chain(v.number, v.integer, v.minValue(0), v.maxValue(150)),
    );
    const age: number & Brand<"Age"> = unwrap(newAge(25));

    expect<number>(age).toBe(25);
    expect(unwrapErr(newAge(200)).details).toEqual([
      "Age: Invalid value: Expected <=150 but received 200",
    ]);
    expect(isErr(newAge("25"))).toBe(true);
  });

  it("brand が違う VO は互いに代入できない", () => {
    const newUserId = newVo("UserId", v.string);
    const newPostId = newVo("PostId", v.string);
    const userId: InferVo<typeof newUserId> = unwrap(newUserId("u1"));

    // @ts-expect-error UserId は PostId に代入できない
    const postId: InferVo<typeof newPostId> = userId;
    expect<string>(postId).toBe("u1");
  });

  it("型チェックで始まらないパーサーは型エラーになる", () => {
    // @ts-expect-error v.email は string しか受け取れない
    newVo("Email", v.email);
  });
});

describe("withName", () => {
  it("表示名を差し替える", () => {
    const r = rslt.pipe(
      newEmail("invalid-email"),
      rslt.mapErr(withName("userEmail")),
    );
    const error = unwrapErr(r);

    expect(error.code).toBe("Validation Error");
    expect(error.message).toBe("userEmail is invalid. ( type: Email )");
    expect(error.details).toEqual([
      'userEmail: Invalid email: Received "invalid-email"',
    ]);
  });

  it("何度でも差し替えられる", () => {
    const r = rslt.pipe(
      newEmail("invalid-email"),
      rslt.mapErr(withName("a")),
      rslt.mapErr(withName("b")),
    );

    expect(unwrapErr(r).message).toBe("b is invalid. ( type: Email )");
  });

  it("成功時は何もしない", () => {
    const r = rslt.pipe(
      newEmail("a@example.com"),
      rslt.mapErr(withName("userEmail")),
    );

    expect<string>(unwrap(r)).toBe("a@example.com");
  });

  it("newVo 以外で作られた ValidationError はそのまま返す", () => {
    const e = new ValidationError("other");

    expect(withName("x")(e)).toBe(e);
  });
});
