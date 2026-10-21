import { afterEach, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { TuiApp } from "../src/tui/app";
import { createTheme } from "../src/tui/theme";
import type { Size } from "../src/tui/main-panel";
import { setLocale } from "../src/i18n";
import { LOCALES } from "../src/i18n/locale";
import { displayWidth } from "../src/tui/format";
import { FakeController, file, keys, settle, stripAnsi } from "./fixtures/tui";

const mounted: Array<() => void> = [];
afterEach(() => { for (const unmount of mounted.splice(0)) unmount(); setLocale("zh-CN"); });
function mount(controller = new FakeController(), size: Size = { columns: 100, rows: 30 }) {
  const app = render(<TuiApp controller={controller} theme={createTheme({ NO_COLOR: "1" })} size={size} />);
  mounted.push(app.unmount);
  return { frame: () => stripAnsi(app.lastFrame() ?? ""), press: async (input: string) => { app.stdin.write(input); await settle(); } };
}
const lastLine = (frame: string) => frame.trimEnd().split("\n").at(-1)!;

test("每种语言在 100 列宽下完整显示主面板按键提示，包括暂停与全部开始的状态", async () => {
  for (const target of LOCALES) {
    setLocale(target);
    for (const patch of [{}, { userPaused: true }]) {
      const controller = new FakeController(); controller.update(patch);
      const { frame, press } = mount(controller); await settle();
      for (const step of [null, keys.down]) {
        if (step) await press(step);
        const line = lastLine(frame());
        expect(line).not.toContain("…"); expect(line.trimEnd()).toMatch(/q \S+$/); expect(displayWidth(line)).toBeLessThanOrEqual(100);
      }
      // 选中已暂停的文件时，单项按键变为继续。
      controller.update({ files: { ...controller.snapshot().files, s_1: controller.snapshot().files.s_1!.map(item => ({ ...item, paused: true })) } });
      await settle();
      expect(lastLine(frame())).not.toContain("…");
      for (const unmount of mounted.splice(0)) unmount();
    }
  }
});

test("英文界面：标题栏、状态、事件提示与确认框都是英文，分享标题保持原样", async () => {
  setLocale("en");
  const controller = new FakeController();
  const { frame, press } = mount(controller); await settle();
  const text = frame();
  expect(text).toContain("● Signed in"); expect(text).toContain("Clipboard ● watching"); expect(text).toContain("“某某合集”  1/3 done");
  expect(text).toContain("Queued"); expect(text).toContain("Waiting for cloud space"); expect(text).toContain("Enter info  r retry  c cancel");
  // 状态说明过长时只截断状态列，文件名保持在同一行。
  const failed = text.split("\n").find(line => line.includes("2.1 GB"))!;
  expect(failed).toContain("第一季"); expect(failed).toContain("Failed");
  await press("q");
  expect(frame()).toContain("Stop downloading and quit?");
  await press("n"); await press(keys.down); await press("c");
  expect(frame()).toContain("Cancel task"); expect(frame()).toContain("Cancel episode02.mkv?");
});

test("日文界面：设置页标签与取值之间留有间隔，说明不换行", async () => {
  setLocale("ja");
  const { frame, press } = mount(new FakeController(), { columns: 100, rows: 24 }); await settle();
  await press("s");
  const text = frame();
  expect(text).toContain("設定"); expect(text).toMatch(/クリップボード監視\s{2,}● オン/); expect(text).toMatch(/同時ダウンロード数\s{2,}◀ 1 ▶/);
  expect(text).toContain("言語"); expect(text).toMatch(/◀ システムに従う（(简体中文|English|日本語)） ▶/);
  expect(text).toContain("PikPak DL CLI"); expect(lastLine(text)).toContain("↑↓ 選択");
});

test("设置页的语言项：←→ 在跟随系统、简体中文、English、日本語之间循环，切换后界面改用新语言", async () => {
  const controller = new FakeController();
  const { frame, press } = mount(controller); await settle();
  await press("s");
  for (let index = 0; index < 5; index++) await press(keys.down);
  expect(frame()).toMatch(/> 语言\s+◀ 跟随系统/);
  expect(lastLine(frame())).toContain("←→ 调整");
  await press(keys.right); await press(keys.left);
  expect(controller.commands).toEqual([{ kind: "setLanguage", language: "zh-CN" }, { kind: "setLanguage", language: "ja" }]);
  // 会话保存设置后切换语言并更新快照；界面随快照重绘。
  setLocale("en"); controller.update({ language: "en" }); await settle();
  expect(frame()).toContain("Settings"); expect(frame()).toMatch(/> Language\s+◀ English ▶/);
  await press(keys.escape);
  expect(frame()).toContain("● Signed in");
});

test("英文详情页的标签列按最长标签加宽，取值对齐", async () => {
  setLocale("en");
  const controller = new FakeController();
  controller.update({ files: { ...controller.snapshot().files, s_1: [file("f_1", "s_1", "episode01.mkv", "failed", 1024n, { lastError: "network_failure", retries: 2n })] } });
  const { frame, press } = mount(controller); await settle();
  await press(keys.enter);
  const text = frame();
  expect(text).toContain("File details"); expect(text).toMatch(/Local file {2}/); expect(text).toContain("The network connection was lost");
  const lines = text.split("\n");
  expect(lines.find(line => /^\s+File\s{2}/.test(line))!.indexOf("episode01.mkv")).toBe(lines.find(line => line.includes("Cloud copy"))!.indexOf("Not saved yet"));
});
