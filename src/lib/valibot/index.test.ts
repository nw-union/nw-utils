import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { newType } from "./index.js";

const emailSchema = v.pipe(v.string(), v.email(), v.brand("Email"));
type Email = v.InferOutput<typeof emailSchema>;
const newEmail = newType(emailSchema, "Email");

describe("newType", () => {
	describe("成功ケース", () => {
		it("有効な値の場合 ok を返すこと", () => {
			const result = newEmail("test@example.com");

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe("test@example.com");
		});

		it("型が付与された値を返すこと", () => {
			const result = newEmail("user@example.com");
			const value: Email = result._unsafeUnwrap();

			expect(value).toBe("user@example.com");
		});
	});

	describe("失敗ケース", () => {
		it("無効な値の場合 err を返すこと", () => {
			const result = newEmail("invalid-email");

			expect(result.isErr()).toBe(true);
		});

		it("エラーが ValidationError であること", () => {
			const result = newEmail("invalid-email");

			expect(result._unsafeUnwrapErr().code).toBe("Validation Error");
		});

		it("エラーメッセージに type 名が含まれること", () => {
			const result = newEmail("invalid-email");
			const error = result._unsafeUnwrapErr();

			expect(error.message).toBe("Email is invalid. ( type: Email )");
		});

		it("details にバリデーションエラー内容が含まれること", () => {
			const result = newEmail("invalid-email");
			const error = result._unsafeUnwrapErr();

			expect(error.details.length).toBeGreaterThan(0);
			expect(error.details[0]).toMatch(/^Email:/);
		});

		it("name を指定した場合エラーメッセージに name が使われること", () => {
			const result = newEmail("invalid-email", "userEmail");
			const error = result._unsafeUnwrapErr();

			expect(error.message).toBe("userEmail is invalid. ( type: Email )");
			expect(error.details[0]).toMatch(/^userEmail:/);
		});

		it("null を渡した場合も err を返すこと", () => {
			const result = newEmail(null);

			expect(result.isErr()).toBe(true);
		});

		it("undefined を渡した場合も err を返すこと", () => {
			const result = newEmail(undefined);

			expect(result.isErr()).toBe(true);
		});
	});

	describe("数値スキーマ", () => {
		const ageSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(150));
		const newAge = newType(ageSchema, "Age");

		it("有効な数値の場合 ok を返すこと", () => {
			const result = newAge(25);

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe(25);
		});

		it("範囲外の数値の場合 err を返すこと", () => {
			const result = newAge(200);

			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().code).toBe("Validation Error");
		});

		it("文字列を渡した場合 err を返すこと", () => {
			const result = newAge("25");

			expect(result.isErr()).toBe(true);
		});
	});
});
