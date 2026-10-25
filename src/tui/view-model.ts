import type { FileState, Pause, PauseReason } from "../state/model";
import type { FileView, ShareView } from "../state/store";
import type { RuntimeEvent } from "../runtime/engine";
import type { Tone } from "./theme";
import { displayPath, fileName, formatBytes } from "./format";
import { locale, messagesFor, t, type Messages } from "../i18n";
import { LOCALE_NAMES } from "../i18n/locale";

// active：执行器正在处理该状态的文件，界面以动态图标表示。
export type Look = { icon: string; tone: Tone; label: string; active?: boolean };
export type Explanation = { reason: string; advice: string };

// 图标与色调；状态文字按当前语言读取（add-multilingual-ui 决策 5）。
const stateLooks: Record<FileState, Omit<Look, "label">> = {
  discovered: { icon: "·", tone: "muted" }, ready: { icon: "·", tone: "muted" },
  saving: { icon: "⇡", tone: "transfer", active: true }, awaiting_remote: { icon: "⇡", tone: "transfer", active: true },
  downloading: { icon: "↓", tone: "active", active: true }, verifying: { icon: "⟳", tone: "active", active: true },
  publishing: { icon: "↓", tone: "active", active: true }, completed: { icon: "✓", tone: "done" },
  waiting_space: { icon: "⌛", tone: "warning" }, retry_wait: { icon: "⌛", tone: "warning" },
  failed: { icon: "✗", tone: "error" }, reconciling: { icon: "⟳", tone: "warning" },
  needs_attention: { icon: "✗", tone: "error" },
};
const stateLook = (state: FileState): Look => ({ ...stateLooks[state], label: t().states[state] });
const inProgress: readonly FileState[] = ["saving", "awaiting_remote", "downloading", "verifying", "publishing"];

type Reason = keyof Messages["reasons"];
const aliases: Record<string, Reason> = { share_access_required: "access_required", waiting_space: "cloud_space",
  operation_needs_reconciliation: "needs_reconciliation", login_required: "authorization_failed", database: "state_unavailable", credentials: "credentials_unavailable" };
export const knownReasons: readonly string[] = [...Object.keys(messagesFor("zh-CN").reasons), ...Object.keys(aliases)];

export function explain(reason: string | null): Explanation {
  if (!reason) return { reason: "", advice: "" };
  const reasons: Record<string, Explanation> = t().reasons;
  return reasons[aliases[reason] ?? reason] ?? t().unknownReason(reason);
}
export const pauseExplanation = (pause: Pause): Explanation => t().pauses[pause.reason];

// 分享扫描的状态（fix-share-pass-code-waiting 决策 3、4）：只有待扫描与扫描中算扫描中；扫描失败且原因是提取码时可以按 Enter 补填。
export const shareScanning = (share: Pick<ShareView, "scanStatus">) => share.scanStatus === "pending" || share.scanStatus === "active";
const passCodeReasons: readonly string[] = ["pass_code_missing", "pass_code_wrong", "access_required"];
export const needsPassCode = (share: Pick<ShareView, "scanStatus" | "lastError" | "cancelled">) =>
  !share.cancelled && share.scanStatus === "failed" && passCodeReasons.includes(share.lastError ?? "");

// 完成优先于取消，取消优先于暂停；失败与等待附带原因。
export function fileLook(file: FileView, options: { userPaused: boolean; sharePaused?: boolean; missing?: boolean; releasing?: boolean }): Look {
  // 正在释放云端副本的文件优先显示“释放中”，带动态图标。
  if (options.releasing) return { icon: "♻", tone: "transfer", label: t().looks.releasing, active: true };
  // 已完成但交付的本地文件已不在：行尾没有本地图标，状态写明原因。
  if (file.state === "completed") return options.missing ? { ...stateLooks.completed, tone: "warning", label: t().looks.completedMissing } : stateLook("completed");
  if (file.cancelled) return { icon: "⊘", tone: "muted", label: t().looks.cancelled };
  if (file.paused || options.sharePaused) return { icon: "⏸", tone: "warning", label: t().looks.paused };
  if (options.userPaused && inProgress.includes(file.state)) return { icon: "⏸", tone: "warning", label: t().looks.paused };
  const look = stateLook(file.state);
  if (file.lastError && ["failed", "needs_attention", "retry_wait"].includes(file.state)) return { ...look, label: `${look.label} · ${explain(file.lastError).reason}` };
  return look;
}

// 任务位置（add-task-controls 决策 6）：本地格为已完成且文件存在、已完成但文件已不存在、未完成但有断点数据，或没有本地数据；
// 云端格表示最近一份副本仍在云盘中（保留中、删除中或受保护）。
export type Location = { local: "full" | "missing" | "partial" | null; cloud: boolean };
export function fileLocation(file: FileView, missing = false): Location {
  const local = file.state === "completed" ? (missing ? "missing" : "full") : file.checkpoint > 0n ? "partial" : null;
  return { local, cloud: file.copyState !== null && file.copyState !== "deleted" };
}

export type ShareCounts = { total: number; completed: number; downloading: number; transferring: number; queued: number; paused: number; failed: number; waiting: number; cancelled: number;
  local: number; partial: number; cloud: number; missing: number; releasing: number };
// 位置图标（add-task-controls 决策 6）：每行只用一个单宽文本符号（不用 emoji）。
// ▣ 只在本地（绿色；只有下载了一部分的数据、云端也没有副本时为灰色），⧉ 本地与云端都有（青色），☁ 只在云端（淡蓝色，含下载中的文件），都不在时留空。
export const LOCATION_MARKS = { local: "\u25a3", both: "\u29c9", cloud: "\u2601" } as const;
export function locationMark(location: Location): { mark: string; tone: Tone } | null {
  const local = location.local === "full";
  if (local && location.cloud) return { mark: LOCATION_MARKS.both, tone: "active" };
  if (local) return { mark: LOCATION_MARKS.local, tone: "done" };
  if (location.cloud) return { mark: LOCATION_MARKS.cloud, tone: "cloud" };
  if (location.local === "partial") return { mark: LOCATION_MARKS.local, tone: "muted" };
  return null;
}
// 分享的位置：有已完成且在本地的文件即为本地，否则有下载了一部分的文件即为部分；有文件在云端即为云端。
export const shareLocation = (counts: ShareCounts): Location => ({ local: counts.local ? "full" : counts.partial ? "partial" : null, cloud: counts.cloud > 0 });
export function shareCounts(files: FileView[], userPaused: boolean, sharePaused = false, missing: ReadonlySet<string> = new Set(), releasing: ReadonlySet<string> = new Set()): ShareCounts {
  const counts: ShareCounts = { total: files.length, completed: 0, downloading: 0, transferring: 0, queued: 0, paused: 0, failed: 0, waiting: 0, cancelled: 0,
    local: 0, partial: 0, cloud: 0, missing: 0, releasing: 0 };
  for (const file of files) {
    if (releasing.has(file.id)) counts.releasing++;
    const location = fileLocation(file, missing.has(file.id));
    if (location.cloud) counts.cloud++;
    if (location.local) counts[location.local === "full" ? "local" : location.local]++;
    if (file.state === "completed") counts.completed++;
    else if (file.cancelled) counts.cancelled++;
    else if (file.paused || sharePaused) counts.paused++;
    else if (inProgress.includes(file.state)) {
      if (userPaused) counts.paused++;
      else if (file.state === "saving" || file.state === "awaiting_remote") counts.transferring++;
      else counts.downloading++;
    } else if (file.state === "discovered" || file.state === "ready") counts.queued++;
    else if (file.state === "failed" || file.state === "needs_attention") counts.failed++;
    else counts.waiting++;
  }
  return counts;
}

// 分组行（add-task-controls 决策 8）：按分享的本地下载目录分组，只显示、不可选中。
export type GroupRow = { kind: "group"; key: string; path: string; shares: number };
export type ListRow = Row | GroupRow;
export const selectable = (row: ListRow | undefined): row is Row => !!row && row.kind !== "group";
export type Row = { kind: "share"; key: string; share: ShareView; counts: ShareCounts; expanded: boolean }
  | { kind: "file"; key: string; shareId: string; file: FileView; name: string; path: string; look: Look; location: Location };
// 未完成的分享默认展开，全部完成的默认折叠；用户的折叠选择优先。
export function buildRows(input: { shares: ShareView[]; files: Record<string, FileView[]>; expanded: Record<string, boolean | undefined>; userPaused: boolean;
  missing?: ReadonlySet<string>; releasing?: ReadonlySet<string> }): ListRow[] {
  const missing = input.missing ?? new Set<string>(), releasing = input.releasing ?? new Set<string>();
  const rows: ListRow[] = [];
  // 目录按首次出现的顺序排列，组内分享保持原顺序。
  const groups = new Map<string, ShareView[]>();
  for (const share of input.shares) groups.set(share.outputRoot, [...groups.get(share.outputRoot) ?? [], share]);
  for (const [path, shares] of groups) {
    rows.push({ kind: "group", key: `g:${path}`, path, shares: shares.length });
    for (const share of shares) {
      const files = input.files[share.id] ?? [];
      const expanded = input.expanded[share.id] ?? share.summary.status !== "completed";
      rows.push({ kind: "share", key: `s:${share.id}`, share, counts: shareCounts(files, input.userPaused, share.paused, missing, releasing), expanded });
      if (expanded) for (const file of files) {
        rows.push({ kind: "file", key: `f:${file.id}`, shareId: share.id, file, name: fileName(file.relativePath), path: displayPath(file.relativePath),
          look: fileLook(file, { userPaused: input.userPaused, sharePaused: share.paused, missing: missing.has(file.id), releasing: releasing.has(file.id) }), location: fileLocation(file, missing.has(file.id)) });
      }
    }
  }
  return rows;
}

// 选中行离开可见区时才滚动，偏移限制在有效范围内。
export function scrollOffset(previous: number, selected: number, height: number, total: number): number {
  if (height <= 0) return 0;
  const max = Math.max(0, total - height);
  let offset = Math.min(Math.max(previous, 0), max);
  if (selected < offset) offset = selected;
  else if (selected >= offset + height) offset = selected - height + 1;
  return Math.min(Math.max(offset, 0), max);
}

export type LogLine = { icon: string; tone: Tone; text: string };
export type NameLookup = { share(id: string): string | null; file(id: string): string | null };
// 事件区显示名称而非内部 ID；查不到名称时退回 ID。进度事件只更新列表，不进入事件区。
export function describeEvent(event: RuntimeEvent, names: NameLookup): LogLine | null {
  const text = t().events;
  const share = (id?: string) => t().quote((id && names.share(id)) ?? id ?? "");
  const file = (id?: string) => (id && names.file(id)) ?? id ?? "";
  const target = (id?: string) => id?.startsWith("s_") ? text.shareTarget(share(id)) : file(id);
  const why = () => explain(event.reason ?? null).reason;
  switch (event.type) {
    case "started": return { icon: "●", tone: "done", text: event.reason === "clipboard_off" ? text.startedClipboardOff : text.started };
    case "stopped": return { icon: "●", tone: "muted", text: text.stopped };
    case "received": return { icon: "+", tone: "active", text: event.reason === "clipboard" ? text.receivedClipboard(share(event.id)) : text.received(share(event.id)) };
    case "received_cancelled": return { icon: "⊘", tone: "muted", text: text.receivedCancelled(share(event.id)) };
    case "intake_issues": return { icon: "!", tone: "warning", text: text.intakeIssues };
    case "intake_failed": return { icon: "✗", tone: "error", text: text.intakeFailed };
    case "clipboard_unavailable": return { icon: "⌛", tone: "warning", text: text.clipboardUnavailable };
    case "clipboard_recovered": return { icon: "●", tone: "done", text: text.clipboardRecovered };
    case "scanning": return { icon: "⟳", tone: "scan", text: text.scanning(share(event.id)) };
    case "scanned": return { icon: "⟳", tone: "scan", text: text.scanned(share(event.id), event.count ?? 0) };
    case "scan_incomplete": return { icon: "!", tone: "warning", text: text.scanIncomplete(share(event.id)) };
    case "scan_waiting": return { icon: "⌛", tone: "warning", text: text.scanWaiting(share(event.id), why()) };
    case "saving": return { icon: "⇡", tone: "transfer", text: text.saving(file(event.id)) };
    case "downloading": return { icon: "↓", tone: "active", text: text.downloading(file(event.id)) };
    case "completed": return { icon: "✓", tone: "done", text: text.completed(file(event.id)) };
    case "waiting_space": return { icon: "⌛", tone: "warning", text: text.waitingSpace(file(event.id)) };
    case "paused": return { icon: "⏸", tone: "warning", text: text.paused(t().pauses[event.reason as PauseReason]?.reason ?? why()) };
    case "attention": return { icon: "✗", tone: "error", text: text.attention(file(event.id), why()) };
    case "file_waiting": return { icon: "!", tone: "warning", text: text.fileWaiting(file(event.id), why()) };
    case "copy_released": return { icon: "♻", tone: "done", text: text.copyReleased(file(event.id), event.bytes ? formatBytes(event.bytes) : null, event.reason === "removed") };
    case "copy_missing": return { icon: "♻", tone: "muted", text: text.copyMissing(file(event.id), event.reason === "removed") };
    case "task_removed": return { icon: "♻", tone: "muted", text: text.taskRemoved(file(event.id)) };
    case "share_removed": return { icon: "♻", tone: "muted", text: text.shareRemoved(share(event.id)) };
    case "task_remove_failed": return { icon: "✗", tone: "error", text: text.taskRemoveFailed(file(event.id), why()) };
    case "copy_release_skipped": return { icon: "!", tone: "warning", text: text.releaseSkipped(file(event.id), why()) };
    case "copy_release_denied": return { icon: "✗", tone: "error",
      text: text.releaseDenied(file(event.id), explain("release_denied").reason, event.reason && /^[a-z0-9_-]{1,64}$/i.test(event.reason) ? event.reason : null) };
    case "copy_release_failed": return { icon: "✗", tone: "error", text: text.releaseFailed(file(event.id), why()) };
    case "command": {
      const kind = event.reason;
      if (kind === "retry") return { icon: "↻", tone: "active", text: text.retry(target(event.id)) };
      if (kind === "setPassCode") return { icon: "↻", tone: "active", text: text.passCode(target(event.id)) };
      if (kind === "cancel") return { icon: "⊘", tone: "muted", text: text.cancel(target(event.id)) };
      if (kind === "pauseTask") return { icon: "⏸", tone: "warning", text: text.pauseTask(target(event.id)) };
      if (kind === "resumeTask") return { icon: "▶", tone: "active", text: text.resumeTask(target(event.id)) };
      if (kind === "startAll") return { icon: "▶", tone: "active", text: text.startAll };
      if (kind === "releaseCopy") return { icon: "♻", tone: "active", text: event.count ? text.releaseCopies(target(event.id), event.count) : text.removeRecords(target(event.id)) };
      if (kind === "releaseAll") return { icon: "♻", tone: "active", text: event.count ? text.releaseAll(event.count) : text.removeAll(String(event.size ?? 0n)) };
      if (kind === "pauseQueue") return { icon: "⏸", tone: "warning", text: text.pauseQueue };
      if (kind === "resumeQueue") return { icon: "▶", tone: "active", text: text.resumeQueue };
      if (kind === "setOutputRoot") return { icon: "●", tone: "done", text: event.count ? text.outputMoved(event.count) : text.output };
      if (kind === "setClipboardWatch") return { icon: "●", tone: "done", text: text.clipboard };
      if (kind === "setDownloadConnections") return { icon: "●", tone: "done", text: text.connections };
      if (kind === "setActiveFiles") return { icon: "●", tone: "done", text: text.activeFiles };
      if (kind === "setLanguage") return { icon: "●", tone: "done", text: text.language(LOCALE_NAMES[locale()]) };
      return null;
    }
    case "command_failed": return { icon: "✗", tone: "error", text: text.failed(why()) };
    default: return null;
  }
}
