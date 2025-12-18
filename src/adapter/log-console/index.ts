import { AppError, Logger, LogLevel } from "../../index.js";

const thanLevel = (l1: LogLevel, l2: LogLevel): boolean => {
  const levels: LogLevel[] = ["debug", "info", "warn", "error"];
  return levels.indexOf(l1) <= levels.indexOf(l2);
};

export const newLogConsole = (level: LogLevel): Logger => ({
  debug: (s: string, e?: AppError) => {
    if (thanLevel(level, "debug")) {
      print(`${gray("[DEBUG]")} ${gray(s)}`);
      if (e) {
        printError(e);
      }
    }
  },

  info: (s: string, e?: AppError) => {
    if (thanLevel(level, "info")) {
      print(`${blue("[ INFO]")} ${white(s)}`);
      if (e) {
        printError(e);
      }
    }
  },

  warn: (s: string, e?: AppError) => {
    if (thanLevel(level, "warn")) {
      print(`${yellow("[ WARN]")} ${white(s)}`);
      if (e) {
        printError(e);
      }
    }
  },

  error: (s: string, e?: AppError) => {
    print(`${red("[ERROR]")} ${red(s)}`);
    if (e) {
      printError(e);
    }
  },
});

const print = (s: string) => console.log(`${s}`);
const printError = (e: AppError) => {
  print(white(`  ▷ ErrCode: ${e.code}`));
  print(white(`  ▷ Message: ${e.message}`));
  print(white(`  ▷ Details: ${JSON.stringify(e.details)}`));
  print(white("  ▷ Stack:"));
  print(gray(`${e.stack}`));
};

const color = (col: string) => (s: string) => `\u001b[${col}m${s}\u001b[0m`; // 補助関数

// const black = color("38;5;0");
const red = color("38;5;1");
// const green = color("38;5;2");
const yellow = color("38;5;3");
const blue = color("38;5;4");
// const magenta = color("38;5;5");
// const cyan = color("38;5;6");
const white = color("38;5;7");
const gray = color("38;5;244");
