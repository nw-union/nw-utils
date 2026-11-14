import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { isErr, isOk, type Result } from "../rslt/index.js";
import { newType, newVoOrNone } from "./index.js";

// テスト用: 成功値 / エラーを取り出す (逆側なら throw してテストを失敗させる)
const unwrap = <T, E>(r: Result<T, E>): T => {
  if (isErr(r))
    throw new Error(`expected Success but got Failure: ${String(r.error)}`);
  return r.value;
};
const unwrapErr = <T, E>(r: Result<T, E>): E => {
  if (isOk(r)) throw new Error("expected Failure but got Success");
  return r.error;
};

const emailSchema = v.pipe(v.string(), v.email(), v.brand("Email"));
type Email = v.InferOutput<typeof emailSchema>;
const newEmail = newType(emailSchema, "Email");

describe("newType", () => {
  describe("成功ケース", () => {
    it("有効な値の場合 ok を返すこと", () => {
      const result = newEmail("test@example.com");

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe("test@example.com");
    });

    it("型が付与された値を返すこと", () => {
      const result = newEmail("user@example.com");
      const value: Email = unwrap(result);

      expect(value).toBe("user@example.com");
    });
  });

  describe("失敗ケース", () => {
    it("無効な値の場合 err を返すこと", () => {
      const result = newEmail("invalid-email");

      expect(isErr(result)).toBe(true);
    });

    it("エラーが ValidationError であること", () => {
      const result = newEmail("invalid-email");

      expect(unwrapErr(result).code).toBe("Validation Error");
    });

    it("エラーメッセージに type 名が含まれること", () => {
      const result = newEmail("invalid-email");
      const error = unwrapErr(result);

      expect(error.message).toBe("Email is invalid. ( type: Email )");
    });

    it("details にバリデーションエラー内容が含まれること", () => {
      const result = newEmail("invalid-email");
      const error = unwrapErr(result);

      expect(error.details.length).toBeGreaterThan(0);
      expect(error.details[0]).toMatch(/^Email:/);
    });

    it("name を指定した場合エラーメッセージに name が使われること", () => {
      const result = newEmail("invalid-email", "userEmail");
      const error = unwrapErr(result);

      expect(error.message).toBe("userEmail is invalid. ( type: Email )");
      expect(error.details[0]).toMatch(/^userEmail:/);
    });

    it("null を渡した場合も err を返すこと", () => {
      const result = newEmail(null);

      expect(isErr(result)).toBe(true);
    });

    it("undefined を渡した場合も err を返すこと", () => {
      const result = newEmail(undefined);

      expect(isErr(result)).toBe(true);
    });
  });

  describe("数値スキーマ", () => {
    const ageSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(150));
    const newAge = newType(ageSchema, "Age");

    it("有効な数値の場合 ok を返すこと", () => {
      const result = newAge(25);

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(25);
    });

    it("範囲外の数値の場合 err を返すこと", () => {
      const result = newAge(200);

      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe("Validation Error");
    });

    it("文字列を渡した場合 err を返すこと", () => {
      const result = newAge("25");

      expect(isErr(result)).toBe(true);
    });
  });
});

const newOptionalEmail = newVoOrNone(emailSchema, "Email");

describe("newVoOrNone", () => {
  describe("空文字列の場合", () => {
    it("空文字列を渡した場合 ok(null) を返すこと", () => {
      const result = newOptionalEmail("");

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeNull();
    });
  });

  describe("成功ケース", () => {
    it("有効な値の場合 ok を返すこと", () => {
      const result = newOptionalEmail("test@example.com");

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe("test@example.com");
    });
  });

  describe("失敗ケース", () => {
    it("無効な値の場合 err を返すこと", () => {
      const result = newOptionalEmail("invalid-email");

      expect(isErr(result)).toBe(true);
    });

    it("エラーが ValidationError であること", () => {
      const result = newOptionalEmail("invalid-email");

      expect(unwrapErr(result).code).toBe("Validation Error");
    });

    it("エラーメッセージに type 名が含まれること", () => {
      const result = newOptionalEmail("invalid-email");
      const error = unwrapErr(result);

      expect(error.message).toBe("Email is invalid. ( type: Email )");
    });

    it("name を指定した場合エラーメッセージに name が使われること", () => {
      const result = newOptionalEmail("invalid-email", "optionalEmail");
      const error = unwrapErr(result);

      expect(error.message).toBe("optionalEmail is invalid. ( type: Email )");
      expect(error.details[0]).toMatch(/^optionalEmail:/);
    });

    it("null を渡した場合 err を返すこと", () => {
      const result = newOptionalEmail(null);

      expect(isErr(result)).toBe(true);
    });

    it("undefined を渡した場合 err を返すこと", () => {
      const result = newOptionalEmail(undefined);

      expect(isErr(result)).toBe(true);
    });
  });
});
