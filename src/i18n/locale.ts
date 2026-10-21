import { dlopen, FFIType } from "bun:ffi";

// 界面语言（add-multilingual-ui 决策 1）：简体中文、英文、日文；无法匹配的语言一律用英文。
export const LOCALES = ["zh-CN", "en", "ja"] as const;
export type Locale = typeof LOCALES[number];
// 语言名称始终用该语言本身书写。
export const LOCALE_NAMES: Record<Locale, string> = { "zh-CN": "简体中文", en: "English", ja: "日本語" };

// 系统语言标签（zh_CN.UTF-8、zh-Hant-TW、ja、en-US@euro 等）。空值与 C、POSIX 及其变体视为未指定，返回 null。
export function matchLocale(tag: string | undefined): Locale | null {
  const name = tag?.trim().split(/[.@]/)[0]?.toLowerCase() ?? "";
  if (!name || name === "c" || name === "posix") return null;
  const primary = name.split(/[-_]/)[0];
  return primary === "zh" ? "zh-CN" : primary === "ja" ? "ja" : "en";
}

// Windows 的用户界面语言：LANGID 的低 10 位是主语言（0x04 中文、0x11 日文）。读不到时为 null。
export function windowsLocale(): Locale | null {
  try {
    const kernel32 = dlopen("kernel32.dll", { GetUserDefaultUILanguage: { args: [], returns: FFIType.u16 } });
    try {
      const id = kernel32.symbols.GetUserDefaultUILanguage() & 0x3ff;
      return id === 0 ? null : id === 0x04 ? "zh-CN" : id === 0x11 ? "ja" : "en";
    } finally { kernel32.close(); }
  } catch { return null; }
}

export type DetectSources = { env?: Record<string, string | undefined>; platform?: NodeJS.Platform; windows?: () => Locale | null; runtime?: () => string | undefined };
// 自动检测顺序（add-multilingual-ui 决策 2）：环境变量 → Windows 界面语言 → 运行时默认区域 → 英文。任何一步出错都跳到下一步。
export function detectLocale(sources: DetectSources = {}): Locale {
  const env = sources.env ?? process.env, platform = sources.platform ?? process.platform;
  for (const value of [env.LANGUAGE?.split(":")[0], env.LC_ALL, env.LC_MESSAGES, env.LANG]) {
    const locale = matchLocale(value);
    if (locale) return locale;
  }
  if (platform === "win32") { const locale = (sources.windows ?? windowsLocale)(); if (locale) return locale; }
  try { return matchLocale((sources.runtime ?? (() => Intl.DateTimeFormat().resolvedOptions().locale))()) ?? "en"; } catch { return "en"; }
}
