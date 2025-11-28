/**
 * NWU アプリケーション カスタムエラー
 *
 * - App Error
 *   - System Error: システム起因エラー
 *   - User Error: ユーザー起因エラー
 *     - Validation Error: バリデーションエラー
 *     - NotFound Error: データが見つからないエラー
 *     - Auth Error: 認証エラー
 */

// 基底エラークラス
export abstract class AppError extends Error {
  public code = "App Error";
  public details: string[];

  constructor(message: string, details?: string[], e?: Error) {
    super(message); // 親クラスのコンストラクタを呼び出し
    this.details = details || [];
    if (e) {
      // エラーが渡された場合はスタックトレースを追加する
      this.stack += `\nCaused by: ${e.stack}`;
    }
    this.name = this.constructor.name; // エラー名をクラス名に設定
    Object.setPrototypeOf(this, SystemError.prototype); // プロトタイプチェーンを正しく設定
  }
}

/**
 * System Error システム起因エラー
 */
export class SystemError extends AppError {
  public code = "System Error";
}

/**
 * User Error ユーザー起因エラー
 * */
export abstract class UserError extends AppError {}

/**
 * Validation Error バリデーションエラー
 */
export class ValidationError extends UserError {
  public code = "Validation Error";
}

/**
 * NotFound Error データが見つからないエラー
 */
export class NotFoundError extends UserError {
  public code = "NotFound Error";
}

/**
 * Auth Error 認証エラー
 */
export class AuthError extends UserError {
  public code = "Auth Error";
}

// ----------------------------------------------
// ヘルパー関数

export const mergeValidationError = (es: ValidationError[]): ValidationError =>
  new ValidationError(
    "multiple types are invalid",
    es.reduce<string[]>((acc, e) => acc.concat(e.details), []), // 複数のエラーの details を連結 してつめる
    // stack にエラーは入れない. ( NOTE: うまく結合する方法があれば入れたい)
  );
