import type { Locale } from "./locale";
import { zhCN } from "./messages/zh-CN";
import { en } from "./messages/en";
import { ja } from "./messages/ja";

// 文案目录（add-multilingual-ui 决策 5）：zh-CN 是基准，en 与 ja 声明为同一类型，漏条目或参数不一致时类型检查失败。
export type Messages = typeof zhCN;
const catalogs: Record<Locale, Messages> = { "zh-CN": zhCN, en, ja };

// 模块加载时默认简体中文：测试不初始化语言；程序入口 main() 按设置与系统语言切换。
let current: Locale = "zh-CN";
export const locale = (): Locale => current;
export const setLocale = (next: Locale): void => { current = next; };
export const t = (): Messages => catalogs[current];
export const messagesFor = (target: Locale): Messages => catalogs[target];
