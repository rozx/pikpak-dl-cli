import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Text, useInput, usePaste, useWindowSize } from "ink";
import type { TuiController } from "./controller";
import { createTheme, type Theme } from "./theme";
import { buildRows, explain, scrollOffset, selectable, type Row } from "./view-model";
import { MainPanel, MIN_COLUMNS, MIN_ROWS, panelLayout, type Size } from "./main-panel";
import { AccountPage, CONFIRM_LINES, ConfirmDialog, DetailPage, PASTE_BOX_LINES, PasteBox, SETTINGS_ITEMS, SettingsPage } from "./pages";
import { MAX_CONNECTIONS } from "../download/connections";
import { MAX_ACTIVE_FILES } from "../runtime/active-files";
import { formatBytes } from "./format";
import type { ReleasePreview } from "../runtime/engine";
import { t } from "../i18n";
import { LANGUAGE_SETTINGS } from "../i18n/language";

// 释放确认框的说明（add-task-controls 决策 5、7）：只删记录、只有已完成、只有未完成、两者都有。
function releaseDetail(preview: Extract<ReleasePreview, { ok: true }>): string {
  const text = t().dialogs;
  if (preview.copies === 0) return text.releaseRecordsOnly;
  if (preview.unfinished === 0) return text.releaseFinished;
  if (preview.removed === 0) return text.releaseUnfinished;
  return text.releaseMixed;
}

type Screen = { kind: "main" } | { kind: "detail"; fileId: string } | { kind: "settings" } | { kind: "account"; confirming: boolean } | { kind: "paste" }
  | { kind: "confirm"; action: "cancel" | "release" | "releaseAll"; id: string; title: string; release?: Extract<ReleasePreview, { ok: true }>; back: Screen } | { kind: "quit" };

// 账号页的登出与重新授权交给启动流程处理：先停止执行，再进入登录页（improve-account-login 决策 6）。
export type AccountAction = "logout" | "reauthorize";
export function TuiApp({ controller, theme = createTheme(), size: fixedSize, onAccount }: { controller: TuiController; theme?: Theme; size?: Size; onAccount?: (action: AccountAction) => void }) {
  const windowSize = useWindowSize();
  const size = fixedSize ?? windowSize;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [screen, setScreen] = useState<Screen>({ kind: "main" });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const [setting, setSetting] = useState({ selected: 0, editing: false, error: null as string | null });

  const rows = useMemo(() => buildRows({ shares: snapshot.shares, files: snapshot.files, expanded, userPaused: snapshot.userPaused, missing: snapshot.localMissing, releasing: snapshot.releasing }), [snapshot, expanded]);
  // 分组行不可选中：默认选第一个文件，没有文件时选第一个分享。
  const found = rows.findIndex(row => row.key === selectedKey && selectable(row));
  const firstFile = rows.findIndex(row => row.kind === "file");
  const selected = found >= 0 ? found : firstFile >= 0 ? firstFile : Math.max(0, rows.findIndex(selectable));
  const current = rows[selected];
  const row = selectable(current) ? current : undefined;
  // 只要队列暂停或存在单项暂停，P 就是“全部开始”。
  const anyPaused = snapshot.userPaused || snapshot.shares.some(item => item.paused) || Object.values(snapshot.files).some(files => files.some(file => file.paused));
  const selectedPaused = (item: Row) => item.kind === "share" ? item.share.paused
    : item.file.paused || !!snapshot.shares.find(share => share.id === item.shareId)?.paused;
  const overlayLines = screen.kind === "confirm" || screen.kind === "quit" ? CONFIRM_LINES : screen.kind === "paste" ? PASTE_BOX_LINES : 0;
  const { listHeight } = panelLayout(size, snapshot, overlayLines);
  // 选中某组的第一个分享并滚到顶部时，把该组的目录行一起显示出来。
  const scrolled = scrollOffset(offset, selected, listHeight, rows.length);
  const effectiveOffset = scrolled === selected && selected > 0 && listHeight > 1 && rows[selected - 1]?.kind === "group" ? scrolled - 1 : scrolled;
  useEffect(() => { if (effectiveOffset !== offset) setOffset(effectiveOffset); }, [effectiveOffset, offset]);

  // 跳过分组行：先按移动方向找，到头后反向找。
  const select = (index: number, step: 1 | -1) => {
    const start = Math.min(Math.max(index, 0), rows.length - 1);
    for (const direction of [step, -step]) {
      for (let at = start; at >= 0 && at < rows.length; at += direction) { const target = rows[at]; if (selectable(target)) { setSelectedKey(target.key); return; } }
    }
  };
  const run = async (command: Parameters<TuiController["command"]>[0]) => {
    const result = await controller.command(command);
    if (!result.ok) controller.note({ icon: "✗", tone: "error", text: t().events.failed(explain(result.reason).reason) });
    return result;
  };
  const askCancel = (target: Row | undefined, back: Screen) => {
    if (!target) return;
    if (target.kind === "share") {
      const open = target.counts.total - target.counts.completed - target.counts.cancelled;
      setScreen({ kind: "confirm", action: "cancel", id: target.share.id, title: t().dialogs.cancelShare(t().quote(target.share.title ?? target.share.id), open), back });
    } else if (target.file.state === "completed") controller.note({ icon: "!", tone: "warning", text: t().dialogs.alreadyDone(target.name) });
    else setScreen({ kind: "confirm", action: "cancel", id: target.file.id, title: t().dialogs.cancelFile(target.name), back });
  };
  // 手动释放云端副本（add-task-controls 决策 5）：没有合格副本时只说明原因，不打开确认框。
  const askRelease = (target: Row | undefined, back: Screen) => {
    if (!target) return;
    const id = target.kind === "share" ? target.share.id : target.file.id;
    const name = target.kind === "share" ? t().quote(target.share.title ?? target.share.id) : target.name, text = t().dialogs;
    const preview = controller.releasePreview(id);
    if (!preview.ok) { controller.note({ icon: "!", tone: "warning", text: t().labelled(name, explain(preview.reason).reason) }); return; }
    const title = preview.copies === 0 ? (target.kind === "share" ? text.removeShareRecords(name, preview.removed) : text.removeFileRecord(name))
      : target.kind === "share" ? text.releaseShare(name, preview.copies, formatBytes(preview.bytes)) : text.releaseFile(name, formatBytes(preview.bytes));
    setScreen({ kind: "confirm", action: "release", id, title, release: preview, back });
  };
  // 全部释放：只处理已完成的任务，未完成的任务不受影响。
  const askReleaseAll = () => {
    const preview = controller.releasePreview(null);
    const text = t().dialogs;
    if (!preview.ok) { controller.note({ icon: "!", tone: "warning", text: t().labelled(text.releaseAllLabel, explain(preview.reason).reason) }); return; }
    const title = preview.copies ? text.releaseAll(preview.copies, formatBytes(preview.bytes)) : text.removeAll(preview.removed);
    setScreen({ kind: "confirm", action: "releaseAll", id: "*", title, release: preview, back: { kind: "main" } });
  };
  const open = async (target: Row | undefined) => {
    if (!target) return;
    const result = await controller.openDirectory(target.kind === "share" ? { shareId: target.share.id } : { shareId: target.shareId, fileId: target.file.id });
    if (!result.ok) controller.note({ icon: "✗", tone: "error", text: t().dialogs.openFailed(explain(result.reason).reason) });
  };

  const quit = () => { setScreen({ kind: "main" }); controller.stop(); };
  // Ctrl+C 与 q 一样先确认；确认框中再按 Ctrl+C 视为确认，停止期间再按立即退出。
  useInput((input, key) => {
    if (!(key.ctrl && input === "c")) return;
    if (snapshot.stopping) controller.forceExit();
    else if (screen.kind === "quit") quit();
    else setScreen({ kind: "quit" });
  });

  useInput((input, key) => {
    if (key.ctrl || snapshot.stopping) return;
    if (key.upArrow) select(selected - 1, -1);
    else if (key.downArrow) select(selected + 1, 1);
    else if (key.pageUp) select(selected - listHeight, -1);
    else if (key.pageDown) select(selected + listHeight, 1);
    else if (key.leftArrow && row) {
      const shareId = row.kind === "share" ? row.share.id : row.shareId;
      setExpanded(value => ({ ...value, [shareId]: false })); setSelectedKey(`s:${shareId}`);
    } else if (key.rightArrow && row?.kind === "share") setExpanded(value => ({ ...value, [row.share.id]: true }));
    else if (key.return && row) {
      if (row.kind === "share") setExpanded(value => ({ ...value, [row.share.id]: !row.expanded }));
      else setScreen({ kind: "detail", fileId: row.file.id });
    } else if (input === "r" && row) void run({ kind: "retry", id: row.kind === "share" ? row.share.id : row.file.id });
    else if (input === "c") askCancel(row, { kind: "main" });
    else if (input === "x") askRelease(row, { kind: "main" });
    else if (input === "X") askReleaseAll();
    else if (input === "p" && row) {
      // 选中项暂停或继续；文件自己未暂停但所属分享暂停时，继续该分享。
      const share = snapshot.shares.find(item => item.id === (row.kind === "share" ? row.share.id : row.shareId));
      const target = row.kind === "share" ? row.share.id : row.file.paused || !share?.paused ? row.file.id : share.id;
      void run(selectedPaused(row) ? { kind: "resumeTask", id: target } : { kind: "pauseTask", id: target });
    } else if (input === "P") void run(anyPaused ? { kind: "startAll" } : { kind: "pauseQueue" });
    else if (input === "o") void open(row);
    else if (input === "a") { setDraft(""); setPasteMessage(null); setScreen({ kind: "paste" }); }
    else if (input === "s") { setSetting({ selected: 0, editing: false, error: null }); setScreen({ kind: "settings" }); }
    else if (input === "q") setScreen({ kind: "quit" });
  }, { isActive: screen.kind === "main" });

  useInput((input, key) => {
    if (input === "y") quit();
    else if (input === "n" || key.escape) setScreen({ kind: "main" });
  }, { isActive: screen.kind === "quit" && !snapshot.stopping });

  const detailFile = screen.kind === "detail" ? Object.values(snapshot.files).flat().find(file => file.id === screen.fileId) : undefined;
  // 详情页的文件记录被删除（释放后）时回到主面板。
  useEffect(() => { if (screen.kind === "detail" && !detailFile) setScreen({ kind: "main" }); }, [screen, detailFile]);
  const detailRow = detailFile ? rows.find((item): item is Row => item.kind === "file" && item.file.id === detailFile.id) : undefined;
  useInput((input, key) => {
    if (key.escape) setScreen({ kind: "main" });
    else if (input === "r" && detailFile) void run({ kind: "retry", id: detailFile.id });
    else if (input === "c" && detailRow) askCancel(detailRow, screen);
    else if (input === "x" && detailRow) askRelease(detailRow, screen);
    else if (input === "o" && detailRow) void open(detailRow);
  }, { isActive: screen.kind === "detail" });

  useInput((input, key) => {
    if (screen.kind !== "confirm") return;
    if (input === "y") {
      void run(screen.action === "cancel" ? { kind: "cancel", id: screen.id } : screen.action === "releaseAll" ? { kind: "releaseAll" } : { kind: "releaseCopy", id: screen.id });
      setScreen(screen.back.kind === "detail" ? screen.back : { kind: "main" });
    }
    else if (input === "n" || key.escape) setScreen(screen.back);
  }, { isActive: screen.kind === "confirm" });

  const submitPaste = async () => {
    const result = await run({ kind: "submitText", text: draft });
    if (!result.ok) { setPasteMessage(t().paste.rejected(explain(result.reason).reason)); return; }
    if (!result.ids.length) { setPasteMessage(result.issues.length ? t().paste.ambiguousNone : t().paste.noLinkNone); return; }
    setScreen({ kind: "main" });
  };
  usePaste(text => { setDraft(value => value + text.replace(/\r\n?/g, "\n")); setPasteMessage(null); }, { isActive: screen.kind === "paste" });
  useInput((input, key) => {
    if (key.escape) setScreen({ kind: "main" });
    else if (key.return) void submitPaste();
    else if (key.backspace || key.delete) setDraft(value => value.slice(0, -1));
    else if (input && !key.ctrl && !key.meta) setDraft(value => value + input);
  }, { isActive: screen.kind === "paste" });

  const saveOutput = async () => {
    const result = await controller.command({ kind: "setOutputRoot", path: draft.trim() });
    if (result.ok) setSetting(value => ({ ...value, editing: false, error: null }));
    else setSetting(value => ({ ...value, error: explain(result.reason).reason }));
  };
  usePaste(text => setDraft(value => value + text.replace(/[\r\n]+/g, "")), { isActive: screen.kind === "settings" && setting.editing });
  useInput((input, key) => {
    if (setting.editing) {
      if (key.escape) setSetting(value => ({ ...value, editing: false, error: null }));
      else if (key.return) void saveOutput();
      else if (key.backspace || key.delete) setDraft(value => value.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setDraft(value => value + input);
      return;
    }
    if (key.escape) setScreen({ kind: "main" });
    else if (key.upArrow || key.downArrow) setSetting(value => ({ ...value, selected: (value.selected + (key.downArrow ? 1 : SETTINGS_ITEMS - 1)) % SETTINGS_ITEMS, error: null }));
    else if (setting.selected === 0 && key.return) { controller.refreshAccount(); setScreen({ kind: "account", confirming: false }); }
    else if (setting.selected === 1 && key.return) { setDraft(snapshot.outputRoot ?? ""); setSetting(value => ({ ...value, editing: true, error: null })); }
    else if (setting.selected === 2 && (key.return || input === " ")) void run({ kind: "setClipboardWatch", enabled: snapshot.clipboard === "off" });
    else if (setting.selected === 3 && (key.leftArrow || key.rightArrow)) {
      // 到达 1 或上限时不再发出命令。
      const count = snapshot.connections + (key.rightArrow ? 1 : -1);
      if (count >= 1 && count <= MAX_CONNECTIONS) void run({ kind: "setDownloadConnections", count });
    } else if (setting.selected === 4 && (key.leftArrow || key.rightArrow)) {
      const count = snapshot.activeFiles.configured + (key.rightArrow ? 1 : -1);
      if (count >= 1 && count <= MAX_ACTIVE_FILES) void run({ kind: "setActiveFiles", count });
    } else if (setting.selected === 5 && (key.leftArrow || key.rightArrow)) {
      // 语言在跟随系统、简体中文、English、日本語之间循环。
      const index = LANGUAGE_SETTINGS.indexOf(snapshot.language), step = key.rightArrow ? 1 : LANGUAGE_SETTINGS.length - 1;
      void run({ kind: "setLanguage", language: LANGUAGE_SETTINGS[(index + step) % LANGUAGE_SETTINGS.length]! });
    }
  }, { isActive: screen.kind === "settings" });

  useInput((input, key) => {
    if (screen.kind !== "account") return;
    if (screen.confirming) {
      if (input === "y") onAccount?.("logout");
      else if (input === "n" || key.escape) setScreen({ kind: "account", confirming: false });
    } else if (key.escape) setScreen({ kind: "settings" });
    else if (input === "r") onAccount?.("reauthorize");
    else if (input === "l") setScreen({ kind: "account", confirming: true });
  }, { isActive: screen.kind === "account" && !snapshot.stopping });

  if (size.columns < MIN_COLUMNS || size.rows < MIN_ROWS) {
    return <Text {...theme.paint("warning")}>{t().main.tooSmall(size.columns, size.rows, MIN_COLUMNS, MIN_ROWS)}</Text>;
  }
  if (screen.kind === "detail" && detailFile) {
    const share = snapshot.shares.find(item => item.id === detailFile.shareId);
    return <DetailPage file={detailFile} shareTitle={share?.title ?? detailFile.shareId} targetPath={controller.targetPath(detailFile.id)} userPaused={snapshot.userPaused}
      missing={snapshot.localMissing.has(detailFile.id)} releasing={snapshot.releasing.has(detailFile.id)} size={size} theme={theme} />;
  }
  if (screen.kind === "account") return <AccountPage account={snapshot.account} quota={snapshot.quota} confirming={screen.confirming} size={size} theme={theme} />;
  if (screen.kind === "settings") {
    return <SettingsPage account={snapshot.account} outputRoot={snapshot.outputRoot} clipboardOn={snapshot.clipboard !== "off"} connections={snapshot.connections} activeFiles={snapshot.activeFiles} language={snapshot.language} selected={setting.selected} editing={setting.editing}
      draft={draft} error={setting.error} size={size} theme={theme} />;
  }
  const key = t().keys, dialog = t().dialogs;
  const keys: Array<[string, string]> = screen.kind === "confirm" ? [["y", key.confirm], ["n", key.back]]
    : screen.kind === "quit" ? [["y", key.quit], ["n", key.back]]
    : screen.kind === "paste" ? [["Enter", key.submit], ["Esc", key.cancel]]
    // 单项与全部合写，与“x/X 释放/全部”一致；有暂停时 P 是全部开始，写明“全部开始”。
    : [["Enter", key.details], ["r", key.retry], ["c", key.cancel], ["p/P", key.pauseAll(!!row && selectedPaused(row), anyPaused)],
      ["x/X", key.releaseAll], ["o", key.folder], ["a", key.paste], ["s", key.settings], ["q", key.quit]];
  const overlay = screen.kind === "confirm" && screen.release
    ? <ConfirmDialog heading={screen.release.copies ? dialog.releaseHeading : dialog.removeHeading} title={screen.title} confirm={screen.release.copies ? dialog.releaseConfirm : dialog.removeConfirm}
      detail={screen.action === "releaseAll" && screen.release.copies ? dialog.releaseAllDetail : releaseDetail(screen.release)} theme={theme} />
    : screen.kind === "confirm"
    ? <ConfirmDialog heading={dialog.cancelHeading} title={screen.title} detail={dialog.cancelDetail} confirm={dialog.cancelConfirm} theme={theme} />
    : screen.kind === "quit" ? <ConfirmDialog heading={dialog.quitHeading} title={dialog.quitTitle} detail={dialog.quitDetail} confirm={dialog.quitConfirm} theme={theme} />
    : screen.kind === "paste" ? <PasteBox draft={draft} preview={controller.preview(draft)} outputRoot={snapshot.outputRoot} message={pasteMessage} theme={theme} width={size.columns - 4} />
    : undefined;
  return <MainPanel snapshot={snapshot} rows={rows} selected={selected} offset={effectiveOffset} size={size} theme={theme} overlay={overlay} overlayLines={overlayLines} keys={keys} />;
}
