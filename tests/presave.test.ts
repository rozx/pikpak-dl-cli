import { afterAll, expect, test } from "bun:test";
import { systemFiles } from "../src/platform/file-system";
import type { LocalFileSystem } from "../src/platform/files";
import type { PikpakClient } from "../src/pikpak/client";
import { Drive } from "../src/pikpak/drive";
import { Engine, type RuntimeEvent } from "../src/runtime/engine";
import { engineFixture } from "./fixtures/engine";

// 预先转存（presave-on-intake）：扫描后按队列顺序把文件转存到云盘，不等轮到下载。
const nativeFiles = ["darwin", "win32", "linux"].includes(process.platform);
let files: LocalFileSystem | undefined;
const localFiles = () => files ??= systemFiles();
afterAll(async () => { await files?.close(); });
type Fixture = Awaited<ReturnType<typeof engineFixture>>;

async function until(condition: () => boolean, timeout = 8000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) { if (Date.now() > deadline) throw Error("condition-timeout"); await Bun.sleep(5); }
}
// 记录请求路径；转存请求可以挂起，直到放行或被中断（中断时请求未发出）。
function instrument(f: Fixture, options: { holdRestores?: boolean } = {}) {
  const state = { paths: [] as string[], restores: 0, maxRestores: 0, release: null as (() => void) | null };
  const api: Pick<PikpakClient, "request"> = { request: async (account, path, init = {}, before) => {
    state.paths.push(path.split("?")[0]!);
    if (options.holdRestores && path.endsWith("/share/restore")) {
      state.restores++; state.maxRestores = Math.max(state.maxRestores, state.restores);
      try {
        await new Promise<void>((resolve, reject) => {
          state.release = resolve;
          init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
        });
      } finally { state.restores--; state.release = null; }
    }
    return f.api.request(account, path, init, before);
  } };
  const events: RuntimeEvent[] = [];
  const engine = new Engine(f.store, f.secrets, new Drive(api, "account"), localFiles(), event => events.push(event), f.fetch, async () => {});
  return { engine, state, events };
}
const signal = new AbortController().signal;
// 队列顺序（与调度相同，按接收与扫描的先后）；store.files 按 ID 排序，不代表队列顺序。
const queue = (f: Fixture) => f.store.fileViews("account", f.share.id).map(view => f.store.file("account", view.id));

test.if(nativeFiles)("扫描后按队列顺序把文件全部转存到云盘，不等下载；之后的下载直接使用这些副本", async () => {
  const f = await engineFixture(localFiles(), 3); f.state.limit = 10n ** 9n;
  const { engine, events } = instrument(f);
  try {
    while (await engine.scan(signal));
    while (await engine.presave(signal));
    const queued = queue(f);
    expect(queued).toHaveLength(3); expect(f.state.saves).toBe(3);
    for (const file of queued) {
      expect(file.state).toBe("awaiting_remote");
      expect(f.store.copyForFile("account", file.id)).not.toBeNull(); expect(f.store.delivery("account", file.id)).toBeNull();
    }
    expect(events.filter(event => event.type === "presaving").map(event => event.id)).toEqual(queued.map(file => file.id));
    while (await engine.step(signal));
    expect(queue(f).map(file => file.state)).toEqual(["completed", "completed", "completed"]);
    expect(f.state.saves).toBe(3);
  } finally { await f.close(); }
}, 30000);

test.if(nativeFiles)("云盘放不下时先回收已交付的副本再转存；仍放不下时停在该文件、状态不变，交付完成前不再尝试", async () => {
  // 容量 60、已用 10，每个文件 40：一次只放得下一个副本。
  const f = await engineFixture(localFiles(), 3);
  const { engine, state } = instrument(f);
  try {
    while (await engine.scan(signal));
    const [first, second, third] = queue(f);
    expect(await engine.presave(signal)).toBe(true);
    expect(await engine.presave(signal)).toBe(false);
    expect(f.state.saves).toBe(1); expect(f.state.deleted).toEqual([]);
    // 下载中的副本不是回收候选；放不下的文件保持排队，不记为等待空间。
    expect(f.store.file("account", second!.id).state).toBe("discovered");
    const requests = state.paths.length;
    expect(await engine.presave(signal)).toBe(false); expect(state.paths.length).toBe(requests);
    // 第一个文件交付完成后立即重新评估：回收它的副本，转存第二个。
    expect(await engine.step(signal)).toBe(true); expect(f.store.file("account", first!.id).state).toBe("completed");
    expect(await engine.presave(signal)).toBe(true);
    expect(f.state.deleted).toEqual(["copy-1"]); expect(f.store.copyForFile("account", second!.id)).not.toBeNull();
    expect(f.store.copyForFile("account", third!.id)).toBeNull(); expect(f.store.file("account", third!.id).state).toBe("discovered");
  } finally { await f.close(); }
}, 30000);

test.if(nativeFiles)("暂停队列或系统暂停时不预先转存；暂停的文件被跳过", async () => {
  const f = await engineFixture(localFiles(), 2); f.state.limit = 10n ** 9n;
  const { engine } = instrument(f);
  try {
    while (await engine.scan(signal));
    const [first, second] = queue(f);
    f.store.setConfig("queue_paused", "1");
    expect(await engine.presave(signal)).toBe(false); expect(f.state.saves).toBe(0);
    f.store.setConfig("queue_paused", "0"); f.store.pause("account", "local_space");
    expect(await engine.presave(signal)).toBe(false); expect(f.state.saves).toBe(0);
    f.store.resume("account", { authenticated: true, permitted: true, writable: true, hasSpace: true, targetAvailable: true, trafficAvailable: true });
    f.store.pauseTask("account", first!.id);
    expect(await engine.presave(signal)).toBe(true);
    expect(f.store.copyForFile("account", first!.id)).toBeNull(); expect(f.store.copyForFile("account", second!.id)).not.toBeNull();
    expect(await engine.presave(signal)).toBe(false);
  } finally { await f.close(); }
}, 30000);

test.if(nativeFiles)("串行步骤选中正在预先转存的文件时等它结束再下载；转存始终串行", async () => {
  const f = await engineFixture(localFiles(), 2); f.state.limit = 10n ** 9n;
  const { engine, state } = instrument(f, { holdRestores: true });
  try {
    while (await engine.scan(signal));
    const [first] = queue(f);
    const presaving = engine.presave(signal);
    await until(() => state.release !== null);
    const stepping = engine.step(signal);
    await Bun.sleep(50);
    expect(state.maxRestores).toBe(1); expect(f.store.delivery("account", first!.id)).toBeNull();
    state.release!();
    expect(await presaving).toBe(true); expect(await stepping).toBe(true);
    // 等待后重新选择：第一个文件已有副本，直接下载。
    expect(await engine.step(signal)).toBe(true);
    expect(f.store.file("account", first!.id).state).toBe("completed"); expect(f.state.saves).toBe(1);
  } finally { await f.close(); }
}, 30000);

test.if(nativeFiles)("取消正在预先转存的文件：转存在发出前中断，文件不记为失败，随后转存下一个", async () => {
  const f = await engineFixture(localFiles(), 2); f.state.limit = 10n ** 9n;
  const { engine, state } = instrument(f, { holdRestores: true });
  try {
    while (await engine.scan(signal));
    const [first, second] = queue(f);
    const presaving = engine.presave(signal);
    await until(() => state.release !== null);
    f.store.cancel("account", first!.id);
    await engine.stopActive(target => target.fileId === first!.id);
    expect(await presaving).toBe(false);
    expect(f.state.saves).toBe(0); expect(f.store.copyForFile("account", first!.id)).toBeNull();
    expect(f.store.file("account", first!.id).lastError).toBeNull();
    const next = engine.presave(signal);
    await until(() => state.release !== null); state.release!();
    expect(await next).toBe(true); expect(f.store.copyForFile("account", second!.id)).not.toBeNull();
  } finally { await f.close(); }
}, 30000);
