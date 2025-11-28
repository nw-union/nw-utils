import { okAsync } from "neverthrow";
import type { Auth } from "../../interface";

export const newAuthMock = (): Auth => ({
  auth: (_: Request) => okAsync("mock-user"),
});
