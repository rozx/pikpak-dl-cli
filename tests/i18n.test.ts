import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locale, messagesFor, setLocale, t } from "../src/i18n";
import { detectLocale, LOCALES, matchLocale } from "../src/i18n/locale";
import { configuredLanguage, initLanguage, languageName, parseLanguage, resolveLanguage, saveLanguage, systemLocale } from "../src/i18n/language";
import { AppError, publicError } from "../src/errors";
import { Store } from "../src/state/store";
import { explain, knownReasons } from "../src/tui/view-model";
import { formatDuration } from "../src/tui/format";
import { landingPage, successPage } from "../src/auth/login-page";
import { PERMISSIONS, permissionNames } from "../src/auth/permissions";
import { chineseEnv } from "./fixtures/language";
import { rejection } from "./fixtures/rejection";

afterEach(() => setLocale("zh-CN"));

test("系统语言标签匹配：中文（含繁体）、日文、英文，其他语言用英文；C 与 POSIX 视为未指定", () => {
  for (const tag of ["zh_CN.UTF-8", "zh-TW", "zh-Hant-HK", "ZH_cn"]) expect(matchLocale(tag)).toBe("zh-CN");
  for (const tag of ["ja_JP.UTF-8", "ja", "ja-JP"]) expect(matchLocale(tag)).toBe("ja");
  for (const tag of ["en_US.UTF-8", "en-GB@euro", "fr_FR.UTF-8", "de", "pt-BR"]) expect(matchLocale(tag)).toBe("en");
  for (const tag of [undefined, "", "  ", "C", "C.UTF-8", "POSIX", "c.utf8"]) expect(matchLocale(tag)).toBeNull();
});

test("自动检测顺序：LANGUAGE、LC_ALL、LC_MESSAGES、LANG，再到 Windows 界面语言与运行时区域，最后为英文", () => {
  const none = () => null, runtime = () => undefined;
  expect(detectLocale({ env: { LANGUAGE: "ja:en", LC_ALL: "zh_CN.UTF-8" }, platform: "linux", runtime })).toBe("ja");
  expect(detectLocale({ env: { LC_ALL: "C.UTF-8", LC_MESSAGES: "zh_CN.UTF-8", LANG: "ja_JP.UTF-8" }, platform: "linux", runtime })).toBe("zh-CN");
  expect(detectLocale({ env: { LANG: "fr_FR.UTF-8" }, platform: "win32", windows: () => "ja", runtime })).toBe("en");
  expect(detectLocale({ env: { LANG: "C.UTF-8" }, platform: "win32", windows: () => "ja", runtime })).toBe("ja");
  // 非 Windows 平台不调用 Windows 接口。
  expect(detectLocale({ env: {}, platform: "linux", windows: () => "ja", runtime: () => "zh-Hans-CN" })).toBe("zh-CN");
  expect(detectLocale({ env: {}, platform: "win32", windows: none, runtime: () => "ja-JP" })).toBe("ja");
  expect(detectLocale({ env: {}, platform: "darwin", runtime })).toBe("en");
  expect(detectLocale({ env: {}, platform: "darwin", runtime: () => { throw Error("no-intl"); } })).toBe("en");
});

// 类型检查保证条目与参数一致；这里再核对类型没有约束键名的表（例如副本状态）。
function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]).sort());
  return typeof value;
}
test("三份文案目录的条目、嵌套键与函数参数个数完全一致", () => {
  const base = shape(messagesFor("zh-CN"));
  for (const target of LOCALES) expect(shape(messagesFor(target))).toEqual(base);
});

test("每种语言都能说明全部已知原因，暂停原因、时长与错误信息随语言变化", () => {
  for (const target of LOCALES) {
    setLocale(target);
    for (const reason of knownReasons) {
      const explanation = explain(reason);
      expect(explanation.reason).not.toBe(t().unknownReason(reason).reason);
      expect(explanation.reason.length).toBeGreaterThan(0); expect(explanation.advice.length).toBeGreaterThan(0);
    }
  }
  setLocale("en");
  expect(explain("something_new").reason).toBe("Unknown reason (something_new)");
  expect(formatDuration(79)).toBe("1m19s"); expect(formatDuration(3700)).toBe("1h01m");
  // 错误在切换语言前创建，输出时仍用当前语言。
  setLocale("zh-CN"); const error = new AppError("login_required"); setLocale("en");
  expect(publicError(error)).toBe("Run login first. Existing tasks and download progress are kept.");
  expect(publicError(new Error("secret-token"))).not.toContain("secret-token");
  setLocale("ja");
  expect(formatDuration(3700)).toBe("1時間01分");
  expect(permissionNames(PERMISSIONS.filter(permission => permission.required))).toBe("アカウント情報、ファイル管理、共有");
});

test("本地授权页按当前语言输出，html lang 随之变化", () => {
  setLocale("ja");
  const page = landingPage("/authorize/nonce");
  expect(page).toContain('<html lang="ja">'); expect(page).toContain("PikPak にログイン"); expect(page).toContain("ファイル管理");
  setLocale("en");
  expect(successPage()).toContain('<html lang="en">'); expect(successPage()).toContain("Signed in");
  setLocale("zh-CN");
  expect(landingPage("/authorize/nonce")).toContain('<html lang="zh-CN">');
});

test("语言设置：合法值保存并立即切换，非法值拒绝并保留原值；未设置或无效时跟随系统", async () => {
  const values = new Map<string, string>();
  const store = { config: (key: string) => values.get(key) ?? null, setConfig: (key: string, value: string) => { values.set(key, value); } };
  expect(configuredLanguage(store)).toBe("auto");
  expect(saveLanguage(store, "en")).toBe("en"); expect(locale()).toBe("en"); expect(values.get("language")).toBe("en");
  expect((await rejection(Promise.resolve().then(() => saveLanguage(store, "fr")))) instanceof AppError).toBe(true);
  expect(values.get("language")).toBe("en"); expect(locale()).toBe("en");
  values.set("language", "klingon"); expect(configuredLanguage(store)).toBe("auto");
  expect(parseLanguage("ja")).toBe("ja"); expect(parseLanguage("zh")).toBeNull();
  expect(resolveLanguage("auto")).toBe(systemLocale()); expect(resolveLanguage("ja")).toBe("ja");
  setLocale("zh-CN"); expect(languageName("en")).toBe("English"); expect(languageName("auto")).toMatch(/^跟随系统（(简体中文|English|日本語)）$/);
});

test("启动时以只读方式读取语言设置；任务库不存在或不可读时跟随系统", async () => {
  const root = await mkdtemp(join(tmpdir(), "pikpak-language-test-"));
  try {
    const database = join(root, "tasks.sqlite");
    expect(await initLanguage(database)).toBe(systemLocale());
    const store = new Store(database); store.setConfig("language", "ja"); store.close();
    expect(await initLanguage(database)).toBe("ja"); expect(locale()).toBe("ja");
    await Bun.write(join(root, "broken.sqlite"), "not a database");
    expect(await initLanguage(join(root, "broken.sqlite"))).toBe(systemLocale());
    expect(await initLanguage(null)).toBe(systemLocale());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("config --language 保存后帮助与提示改用该语言，非法值被拒绝；--help 不写任务库", async () => {
  const root = await mkdtemp(join(tmpdir(), "pikpak-language-cli-"));
  const run = async (...args: string[]) => {
    const child = Bun.spawn([process.execPath, "src/cli.ts", ...args], { env: chineseEnv({ PIKPAK_DOWNLOADER_STATE_DIR: root }), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { stdout, stderr, code };
  };
  try {
    expect((await run("--help")).stdout).toContain("用法：");
    const saved = await run("config", "--language", "en");
    expect(saved.code).toBe(0); expect(saved.stdout).toContain("Saved interface language: English.");
    expect((await run("--help")).stdout).toContain("Usage: pikpak-dl-cli");
    const rejected = await run("config", "--language", "fr");
    expect(rejected.code).toBe(1); expect(rejected.stderr).toContain("Invalid input. See --help.");
    expect((await run("config", "--language", "ja")).stdout).toContain("表示言語を保存しました：日本語。");
    expect((await run("status")).stdout).not.toContain("尚无任务记录");
    const auto = await run("config", "--language", "auto");
    expect(auto.stdout).toContain("已保存界面语言：跟随系统（简体中文）。");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
