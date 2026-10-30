import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { Theme, Tone } from "./theme";
import type { TuiSnapshot } from "./controller";
import { formatBytes, formatDuration, formatSpeed, truncateMiddle } from "./format";
import { explain, locationMark, needsPassCode, shareLocation, shareScanning, type ListRow, type Location, type Row, type ShareCounts } from "./view-model";
import { Banners, Bar, Header, Keys, Rule, SPINNER, bannerLines, boxHighlight, creditLabel, textHighlight, useSpinner } from "./parts";
import { t } from "../i18n";
import { scanBlockingPauses } from "../state/model";

export type Size = { columns: number; rows: number };
export const MIN_COLUMNS = 60, MIN_ROWS = 15;
const EVENT_LINES = 3;
// 标题、横幅、三条分隔线、事件区与按键提示之外的高度留给列表；覆盖层（确认框、粘贴框）占用列表底部。
// 事件区折叠时最多 3 行，展开时最多半个窗口高（improve-intake-feedback-and-cleanup 决策 7），
// 且不超过覆盖层与至少一行列表之外剩下的高度：展开后再打开确认框或粘贴框，整体仍放得进窗口。
export function panelLayout(size: Size, snapshot: TuiSnapshot, overlayLines = 0, logExpanded = false): { listHeight: number; eventLines: number } {
  const fixed = 1 + bannerLines(snapshot) + 3 + 1, room = size.rows - fixed - overlayLines - 1;
  const limit = logExpanded ? Math.max(EVENT_LINES, Math.min(Math.floor(size.rows / 2), room)) : EVENT_LINES;
  const eventLines = Math.min(limit, snapshot.events.length || 1);
  return { listHeight: Math.max(1, size.rows - fixed - eventLines - overlayLines), eventLines };
}
// 名称之外：缩进与选中标记、状态图标、位置图标、大小与状态合计约 76 列。
const nameWidthFor = (columns: number) => Math.max(18, Math.min(48, columns - 76));
// 位置图标紧贴在分享标题与文件名前面，固定占一列加一个空格，名称上下对齐。
function LocationMark({ location, theme, selected }: { location: Location; theme: Theme; selected: boolean }) {
  const icon = locationMark(location);
  return <Text><Text {...theme.paint(icon?.tone ?? "muted", selected)}>{icon?.mark ?? " "}</Text><Text> </Text></Text>;
}

// 选中行的全部文字都改用选中调色板，保证在选中背景上可读。
// failure：扫描失败的原因；passCode：可以按 Enter 补填提取码（fix-share-pass-code-waiting 决策 3）。
function CountsText({ counts, theme, scanning, failure, passCode, cancelled, paused, selected, frame }: { counts: ShareCounts; theme: Theme; scanning: boolean; failure: string | null; passCode: boolean;
  cancelled: boolean; paused: boolean; selected: boolean; frame: number | null }) {
  const paint = (tone: Tone) => theme.paint(tone, selected);
  const part = (value: number, text: string, tone: Tone) => value > 0 ? <Text {...paint(tone)}> · {value} {text}</Text> : null;
  const text = t().main, label = text.counts;
  const failed = failure !== null && <Text><Text {...paint("error")}>{counts.total ? " · " : "  "}✗ {failure}</Text>{passCode && <Text {...paint("key")}> · {text.enterPassCode}</Text>}</Text>;
  if (scanning && counts.total === 0) return <Text {...paint("scan")}>  {frame === null ? "" : `${SPINNER[frame]} `}{text.scanning}</Text>;
  if (failed && counts.total === 0) return failed;
  return (
    <Text>
      <Text {...paint(counts.completed === counts.total && counts.total > 0 ? "done" : "text")}>  {text.completed(counts.completed, counts.total)}</Text>
      {part(counts.downloading, label.downloading, "active")}{part(counts.transferring, label.transferring, "transfer")}{part(counts.paused, label.paused, "warning")}
      {part(counts.queued, label.queued, "muted")}{part(counts.failed, label.failed, "error")}{part(counts.waiting, label.waiting, "warning")}{part(counts.cancelled, label.cancelled, "muted")}
      {part(counts.releasing, label.releasing, "transfer")}{part(counts.missing, label.missing, "warning")}
      {cancelled && <Text {...paint("muted")}>{text.shareCancelled}</Text>}
      {paused && !cancelled && <Text {...paint("warning")}>{text.sharePaused}</Text>}
      {failed}
    </Text>
  );
}

function FileStatus({ row, snapshot, theme, selected }: { row: Extract<Row, { kind: "file" }>; snapshot: TuiSnapshot; theme: Theme; selected: boolean }) {
  const paint = (tone: Tone) => theme.paint(tone, selected);
  const progress = snapshot.progress[row.file.id];
  const bytes = progress?.bytes ?? row.file.checkpoint, size = row.file.size;
  const percent = size > 0n ? Number(bytes * 100n / size) : 100;
  if (row.look.label === t().looks.paused) {
    return <Text><Bar percent={percent} theme={theme} tone="warning" selected={selected} /><Text {...paint("text")}>  {percent}%</Text><Text {...paint("warning")}>  {row.look.label}</Text></Text>;
  }
  if (row.file.state === "downloading" && !row.file.cancelled) {
    return (
      <Text>
        <Bar percent={percent} theme={theme} selected={selected} /><Text {...paint("strong")}>  {percent}%</Text>
        <Text {...paint("text")}>  {formatBytes(bytes)}/{formatBytes(size)}</Text>
        {progress?.rate != null && <Text {...paint("active")}>  {formatSpeed(progress.rate)}</Text>}
        {progress?.eta != null && <Text {...paint("muted")}>  {formatDuration(progress.eta)}</Text>}
      </Text>
    );
  }
  return <Text {...paint(row.look.tone)} wrap="truncate-end">{row.look.label}</Text>;
}

// frame 不为 null 时，正在执行的文件与扫描中的分享显示动态图标。
export function RowLine({ row, selected, snapshot, theme, columns, frame = null }: { row: ListRow; selected: boolean; snapshot: TuiSnapshot; theme: Theme; columns: number; frame?: number | null }) {
  if (row.kind === "group") {
    // 分组行：青色粗线夹住的本地下载目录，后接分享数；分享行比它缩进一级。路径过长时从中间省略。
    return (
      <Text wrap="truncate-end">
        <Text {...theme.paint("active")}>━━ </Text><Text {...theme.paint("group")} bold>{truncateMiddle(row.path, Math.max(10, columns - 24))}</Text>
        <Text {...theme.paint("active")}> ━━</Text><Text {...theme.paint("muted")}>  {t().main.groupShares(row.shares)}</Text>
      </Text>
    );
  }
  if (row.kind === "share") {
    return (
      <Box {...boxHighlight(theme.selection, selected)}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Text {...theme.paint("muted", selected)}>{row.expanded ? "  ▼ " : "  ▶ "}</Text>
            <LocationMark location={shareLocation(row.counts)} theme={theme} selected={selected} />
            <Text {...theme.paint("strong", selected)} bold {...textHighlight(theme.selection, selected)}>{t().quote(row.share.title ?? row.share.id)}</Text>
            <CountsText counts={row.counts} theme={theme} scanning={shareScanning(row.share)} cancelled={row.share.cancelled} paused={row.share.paused} selected={selected} frame={frame}
              failure={row.share.scanStatus === "failed" && !row.share.cancelled ? explain(row.share.lastError ?? "scan_failed").reason : null} passCode={needsPassCode(row.share)} />
          </Text>
        </Box>
        <Box flexGrow={1} />
      </Box>
    );
  }
  const nameWidth = nameWidthFor(columns);
  return (
    <Box {...boxHighlight(theme.selection, selected)}>
      {/* 定宽列不收缩：状态说明再长也只在自己的列内截断，缩进与名称不会被挤成两行。 */}
      <Box flexShrink={0}><Text {...theme.paint("key", selected)} bold>{selected ? "    > " : "      "}</Text></Box>
      <Box width={3} flexShrink={0}><Text {...theme.paint(row.look.tone, selected)}>{row.look.active && frame !== null ? SPINNER[frame] : row.look.icon}</Text></Box>
      <Box flexShrink={0}><LocationMark location={row.location} theme={theme} selected={selected} /></Box>
      <Box width={nameWidth} marginRight={1} flexShrink={0}><Text {...theme.paint("text", selected)} bold={selected} {...textHighlight(theme.selection, selected)}>{truncateMiddle(row.name, nameWidth)}</Text></Box>
      <Box width={8} marginRight={1} flexShrink={0}><Text {...theme.paint("muted", selected)}>{formatBytes(row.file.size)}</Text></Box>
      <Box flexShrink={1} flexGrow={1}><FileStatus row={row} snapshot={snapshot} theme={theme} selected={selected} /></Box>
    </Box>
  );
}

const clock = (at: number) => new Date(at).toLocaleTimeString("zh-CN", { hour12: false });
// logHint：在事件区上方的分隔线右侧提示 l 展开或收起事件区（只在主面板可用时显示）；按键提示行已没有空间。
export function MainPanel({ snapshot, rows, selected, offset, size, theme, overlay, overlayLines = 0, logExpanded = false, logHint = false, keys }: {
  snapshot: TuiSnapshot; rows: ListRow[]; selected: number; offset: number; size: Size; theme: Theme;
  overlay?: ReactNode; overlayLines?: number; logExpanded?: boolean; logHint?: boolean; keys: Array<[string, string]>;
}) {
  const { listHeight, eventLines } = panelLayout(size, snapshot, overlayLines, logExpanded);
  const width = size.columns - 2;
  const events = snapshot.events.slice(-eventLines);
  // 暂停、停止中或系统暂停时执行器不在工作，文件图标保持静止；扫描只在停止中或阻止扫描的系统暂停时停下（scan-shares-on-intake 决策 6）。
  const working = !snapshot.stopping && !snapshot.userPaused && !snapshot.systemPause;
  const scanning = !snapshot.stopping && !(snapshot.systemPause && scanBlockingPauses.includes(snapshot.systemPause.reason));
  const moving = (row: ListRow) => row.kind === "file" ? working && !!row.look.active : row.kind === "share" && scanning && shareScanning(row.share) && row.counts.total === 0;
  const frame = useSpinner(rows.some(moving));
  return (
    <Box flexDirection="column" height={size.rows} paddingX={1}>
      <Header snapshot={snapshot} theme={theme} width={width} />
      <Banners snapshot={snapshot} theme={theme} />
      <Rule width={width} theme={theme} />
      <Box flexDirection="column" height={listHeight}>
        {rows.length === 0
          ? <Text {...theme.paint("muted")}>{t().main.empty}</Text>
          : rows.slice(offset, offset + listHeight).map((row, index) =>
            <RowLine key={row.key} row={row} selected={offset + index === selected} snapshot={snapshot} theme={theme} columns={size.columns} frame={moving(row) ? frame : null} />)}
      </Box>
      {overlay}
      <Rule width={width} theme={theme} {...logHint && !snapshot.stopping ? { label: [{ text: "l", tone: "key" }, { text: ` ${t().keys.log(logExpanded)}`, tone: "muted" }] } : {}} />
      <Box flexDirection="column" height={eventLines}>
        {events.length === 0 ? <Text {...theme.paint("muted")}>{t().main.noEvents}</Text> : events.map((event, index) => (
          <Text key={`${event.at}-${index}`} wrap="truncate-end">
            <Text {...theme.paint("muted")}>{clock(event.at)}  </Text><Text {...theme.paint(event.tone)}>{event.icon} </Text><Text {...theme.paint("text")}>{event.text}</Text>
          </Text>
        ))}
      </Box>
      <Rule width={width} theme={theme} label={creditLabel()} />
      {snapshot.stopping
        ? <Text {...theme.paint("warning")}>{t().main.stopping}</Text>
        : <Keys items={keys} theme={theme} />}
    </Box>
  );
}
