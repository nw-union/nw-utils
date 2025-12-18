import type { ResultAsync } from "neverthrow";
import type { AppError, AuthError } from "./error.js";

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
// Auth 認証
export interface Auth {
  auth(req: Request): ResultAsync<string, AuthError>;
}
