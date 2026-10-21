import { expect, test } from "bun:test";
import { eventLine, progressPrinter, sessionMessage } from "../src/runtime/watch";
import { setLocale } from "../src/i18n";

const progress = (id: string, percent: number) => ({ type: "progress", id, bytes: BigInt(percent), size: 100n });

test("纯文本进度只在跨过 10% 整数倍时输出，跳跃只输出一次，相同百分比不重复", () => {
  let now = 0; const print = progressPrinter(() => now);
  const lines = [1, 5, 9, 10, 15, 19, 20, 45, 45, 100].map(percent => print(progress("f_a", percent)));
  expect(lines).toEqual([null, null, null, "下载进度 f_a: 10%", null, null, "下载进度 f_a: 20%", "下载进度 f_a: 45%", null, "下载进度 f_a: 100%"]);
  now = 120_000; expect(print(progress("f_a", 100))).toBe(null);
});

test("同一十位区间内满 30 秒且百分比变化时兜底输出", () => {
  let now = 0; const print = progressPrinter(() => now);
  expect(print(progress("f_a", 20))).toBe("下载进度 f_a: 20%");
  now = 10_000; expect(print(progress("f_a", 23))).toBe(null);
  now = 29_999; expect(print(progress("f_a", 24))).toBe(null);
  now = 30_001; expect(print(progress("f_a", 25))).toBe("下载进度 f_a: 25%");
  now = 45_000; expect(print(progress("f_a", 26))).toBe(null);
  now = 61_000; expect(print(progress("f_a", 26))).toBe("下载进度 f_a: 26%");
});

test("多个文件交替下载时各自独立节流", () => {
  const print = progressPrinter(() => 0);
  const lines = [progress("f_a", 3), progress("f_b", 12), progress("f_a", 11), progress("f_b", 15), progress("f_a", 12), progress("f_b", 21)].map(print);
  expect(lines).toEqual([null, "下载进度 f_b: 12%", "下载进度 f_a: 11%", null, null, "下载进度 f_b: 21%"]);
});

test("非进度事件不经过节流；会话事件保持原有纯文本提示", () => {
  const print = progressPrinter(() => 0);
  expect(print({ type: "completed", id: "f_a" })).toBe(null);
  expect(sessionMessage({ type: "received", id: "s_a" })).toBe("已接收 s_a");
  expect(sessionMessage({ type: "started", reason: "clipboard_off" })).toContain("剪贴板监听已在设置中关闭");
  expect(sessionMessage({ type: "downloading", id: "f_a" })).toBe(null);
});

test("执行器事件的纯文本：原因按当前语言翻译，内部唤醒事件不输出，不带原始事件名", () => {
  expect(eventLine({ type: "scanned", id: "s_a", count: 3 })).toBe("扫描完成 s_a，文件版本数 3");
  expect(eventLine({ type: "file_waiting", id: "f_a", reason: "waiting_sync" })).toBe("文件等待处理 f_a，原因：云盘容量尚未反映刚释放的空间");
  expect(eventLine({ type: "paused", reason: "local_space" })).toBe("执行已暂停，原因：本地磁盘空间不足");
  expect(eventLine({ type: "released", id: "f_a" })).toBe(null);
  expect(eventLine({ type: "release_finished" })).toBe(null);
  expect(eventLine({ type: "copy_released", id: "f_a", bytes: 1024n })).toBe("f_a 的云端副本已释放（1.0 KB）");
  try {
    setLocale("ja");
    expect(eventLine({ type: "attention", id: "f_a", reason: "network_failure" })).toBe("確認が必要 f_a、理由：ネットワーク接続が切れました");
    expect(eventLine({ type: "released", id: "f_a" })).toBe(null);
  } finally { setLocale("zh-CN"); }
});
