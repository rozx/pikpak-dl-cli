import { AppError } from "../errors";
import { Store } from "../state/store";
import { setLocale, t } from ".";
import { detectLocale, LOCALE_NAMES, LOCALES, type Locale } from "./locale";

// 语言设置（add-multilingual-ui 决策 3）：保存在任务库配置 language 中；未设置或取值无效时跟随系统。
export type LanguageSetting = "auto" | Locale;
export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ["auto", ...LOCALES];
export const parseLanguage = (value: string): LanguageSetting | null => (LANGUAGE_SETTINGS as readonly string[]).includes(value) ? value as LanguageSetting : null;
export const configuredLanguage = (store: Pick<Store, "config">): LanguageSetting => parseLanguage(store.config("language") ?? "") ?? "auto";

// 系统语言在进程内只检测一次（Windows 上需要调用系统接口）。
let system: Locale | null = null;
export const systemLocale = (): Locale => system ??= detectLocale();
export const resolveLanguage = (setting: LanguageSetting): Locale => setting === "auto" ? systemLocale() : setting;
// 设置的显示名称：语言名称用该语言本身书写，跟随系统时附上检测到的语言。
export const languageName = (setting: LanguageSetting): string => setting === "auto" ? t().languageAuto(LOCALE_NAMES[systemLocale()]) : LOCALE_NAMES[setting];
export const applyLanguage = (setting: LanguageSetting): Locale => { const next = resolveLanguage(setting); setLocale(next); return next; };

// 非法取值拒绝，原设置保持不变；保存后立即切换当前语言。
export function saveLanguage(store: Pick<Store, "setConfig">, value: string): LanguageSetting {
  const setting = parseLanguage(value);
  if (setting === null) throw new AppError("invalid_input");
  store.setConfig("language", setting);
  applyLanguage(setting);
  return setting;
}

// 启动时确定语言（add-multilingual-ui 决策 4）：任务库已存在时只读读取设置；读不到时跟随系统，不阻止命令执行。
export async function initLanguage(database: string | null): Promise<Locale> {
  let setting: LanguageSetting = "auto";
  try {
    if (database && await Bun.file(database).exists()) {
      const store = new Store(database, true);
      try { setting = configuredLanguage(store); } finally { store.close(); }
    }
  } catch { /* 任务库被锁、版本更新或不可读时跟随系统。 */ }
  return applyLanguage(setting);
}
