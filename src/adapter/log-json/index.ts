import { AppError, Logger, LogLevel } from "../../index.js";

const thanLevel = (l1: LogLevel, l2: LogLevel): boolean => {
  const levels: LogLevel[] = ["debug", "info", "warn", "error"];
  return levels.indexOf(l1) <= levels.indexOf(l2);
};

const jsonLogFormat = (
  level: LogLevel,
  message: string,
  e?: AppError,
): string =>
  JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    error: e,
  });

export const newLogJson = (level: LogLevel): Logger => ({
  debug: (s: string, e?: AppError) => {
    if (thanLevel(level, "debug")) {
      console.log(jsonLogFormat("debug", s, e));
    }
  },

  info: (s: string, e?: AppError) => {
    if (thanLevel(level, "info")) {
      console.log(jsonLogFormat("info", s, e));
    }
  },

  warn: (s: string, e?: AppError) => {
    if (thanLevel(level, "warn")) {
      console.log(jsonLogFormat("warn", s, e));
    }
  },

  error: (s: string, e?: AppError) => {
    console.log(jsonLogFormat("error", s, e));
  },
});
