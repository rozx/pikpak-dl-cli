// 子进程按系统语言选择界面语言（add-multilingual-ui 决策 2）：断言中文输出的测试固定为简体中文，不受开发机与 CI 的语言影响。
export const chineseEnv = (extra: Record<string, string> = {}): Record<string, string | undefined> =>
  ({ ...process.env, LANGUAGE: "", LC_ALL: "", LC_MESSAGES: "", LANG: "zh_CN.UTF-8", ...extra });
