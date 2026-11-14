import type { AppError, AuthError } from "./error.js";
import type { Result } from "./lib/result/index.js";

// ----------------------------------------------
// Logger ロガー
export interface Logger {
  debug: (s: string, e?: AppError) => void;
  info: (s: string, e?: AppError) => void;
  warn: (s: string, e?: AppError) => void;
  error: (s: string, e?: AppError) => void;
}
export type LogLevel = "debug" | "info" | "warn" | "error";

// ----------------------------------------------
// User ユーザー情報
export interface User {
  id: string; // ユーザー識別子
  mail: string; // メールアドレス
}

// Auth 認証
export interface Auth {
  auth(req: Request): Result.ResultAsync<User, AuthError>;
}
