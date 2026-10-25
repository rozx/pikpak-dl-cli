import { Box, Text } from "ink";
import type { FileView } from "../state/store";
import type { Theme, Tone } from "./theme";
import type { PastePreview } from "./controller";
import { displayPath, displayWidth, fileName, formatBytes, truncateMiddle } from "./format";
import { explain, fileLook } from "./view-model";
import { Keys, Rule, Title, boxHighlight, textHighlight } from "./parts";
import type { Size } from "./main-panel";
import { about } from "../about";
import { DEFAULT_CONNECTIONS, MAX_CONNECTIONS } from "../download/connections";
import { DEFAULT_ACTIVE_FILES, MAX_ACTIVE_FILES } from "../runtime/active-files";
import { PAID_ACTIVE_FILES } from "../pikpak/tier";
import type { AccountView, TuiSnapshot } from "./controller";
import { informativeScopes, missingPermissions, permissionNames, permissionRows } from "../auth/permissions";
import { t } from "../i18n";
import { languageName, type LanguageSetting } from "../i18n/language";

// 标签列宽按当前语言的标签文字计算（add-multilingual-ui 决策 6），不小于原来的最小宽度。
const columnFor = (labels: readonly string[], minimum: number) => Math.max(minimum, ...labels.map(displayWidth));

// 本地文件一行（add-task-controls 决策 6）：已完成看交付的文件是否仍在，未完成看断点。
function localState(file: FileView, missing: boolean): [string, Tone] {
  const text = t().detail;
  if (file.state === "completed") return missing ? [text.localMissing, "warning"] : [text.localPresent, "done"];
  return file.checkpoint > 0n ? [text.localPartial(formatBytes(file.checkpoint), formatBytes(file.size)), "text"] : [text.localNone, "muted"];
}
export function DetailPage({ file, shareTitle, targetPath, userPaused, missing = false, releasing = false, size, theme }: {
  file: FileView; shareTitle: string; targetPath: string | null; userPaused: boolean; missing?: boolean; releasing?: boolean; size: Size; theme: Theme;
}) {
  const look = fileLook(file, { userPaused, releasing }), reason = explain(file.lastError), text = t().detail;
  const fields: Array<[string, string, Tone]> = [
    [text.file, fileName(file.relativePath), "strong"], [text.path, displayPath(file.relativePath), "text"],
    [text.size, text.sizeValue(formatBytes(file.size), file.size.toLocaleString("en-US")), "text"], [text.state, `${look.icon} ${look.label}`, look.tone],
    ...(reason.reason ? [[text.reason, reason.reason, "error"], [text.advice, reason.advice, "active"]] as Array<[string, string, Tone]> : []),
    [text.retries, text.retriesValue(String(file.retries)), "text"],
    [text.local, ...localState(file, missing)],
    [text.cloud, file.copyState ? text.copyStates[file.copyState] ?? file.copyState : text.notSaved, file.copyState === "retained" ? "transfer" : "text"],
    [text.target, targetPath ?? text.notAssigned, "muted"],
  ];
  const labelWidth = columnFor(fields.map(([label]) => label), 8) + 4;
  return (
    <Box flexDirection="column" height={size.rows} paddingX={1}>
      <Title text={text.title} theme={theme} extra={<Text {...theme.paint("text")}>  {t().quote(shareTitle)}</Text>} />
      <Rule width={size.columns - 2} theme={theme} />
      <Box flexDirection="column" flexGrow={1} paddingTop={1}>
        {fields.map(([label, value, tone]) => (
          <Box key={label}><Box width={labelWidth} flexShrink={0}><Text {...theme.paint("muted")}>  {label}</Text></Box><Text {...theme.paint(tone)} wrap="truncate-middle">{value}</Text></Box>
        ))}
      </Box>
      <Rule width={size.columns - 2} theme={theme} />
      <Keys items={[["r", t().keys.retry], ["c", t().keys.cancel], ["x", t().keys.releaseCopy], ["o", t().keys.openFolder], ["Esc", t().keys.back]]} theme={theme} />
    </Box>
  );
}

// 账号摘要与会员说明（improve-account-login 决策 6）。
const accountName = (account: AccountView) => account.name ?? account.email ?? account.id;
const day = (time: number) => { const date = new Date(time); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
function membershipText(account: AccountView | null): [string, Tone] {
  const value = account?.membership, text = t().account;
  if (!value) return [text.unavailable, "muted"];
  if (value.tier === "free") return [text.free, "text"];
  return [text.member(value.type || null, value.expire ? day(value.expire) : null), "done"];
}
function permissionSummary(account: AccountView | null): [string, Tone] {
  const text = t().account;
  if (!account) return [text.unavailable, "muted"];
  if (!informativeScopes(account.scopes)) return [text.unknown, "muted"];
  const missing = missingPermissions(account.scopes);
  return missing.length ? [text.missing(permissionNames(missing)), "error"] : [text.complete, "done"];
}

export const SETTINGS_ITEMS = 6;
function settingKeys(editing: boolean, selected: number): Array<[string, string]> {
  const key = t().keys;
  if (editing) return [["Enter", key.save], ["Esc", key.discard]];
  if (selected >= 3) return [["↑↓", key.select], ["←→", key.adjust], ["Esc", key.back]];
  if (selected === 0) return [["↑↓", key.select], ["Enter", key.view], ["Esc", key.back]];
  return [["↑↓", key.select], ["Enter", key.edit], ["Space", key.toggle], ["Esc", key.back]];
}
// 受账号等级限制时说明实际生效值的原因。
const tierReason = (tier: TuiSnapshot["activeFiles"]["tier"]) => tier === "free" ? t().settings.tierFree : t().settings.tierUnknown;
export function SettingsPage({ account, outputRoot, clipboardOn, connections, activeFiles, language, selected, editing, draft, error, size, theme }: {
  account: AccountView | null; outputRoot: string | null; clipboardOn: boolean; connections: number; activeFiles: TuiSnapshot["activeFiles"]; language: LanguageSetting;
  selected: number; editing: boolean; draft: string; error: string | null; size: Size; theme: Theme;
}) {
  const text = t().settings;
  // 标签列（含与取值之间的两格）与说明的左边距：中文为 16 与 18。
  const column = columnFor([text.account, text.output, text.clipboard, text.connections, text.activeFiles, text.language, text.about].map(label => `${label}  `), 16) + 2;
  const item = (index: number, label: string, value: (on: boolean) => React.ReactNode, note: string) => {
    const on = selected === index;
    return (
      <Box key={label} flexDirection="column">
        <Box {...boxHighlight(theme.selection, on)}>
          <Text {...theme.paint("key", on)} bold>{on ? "> " : "  "}</Text>
          <Box width={column - 2} flexShrink={0}><Text {...theme.paint("text", on)} bold={on} {...textHighlight(theme.selection, on)}>{label}</Text></Box>
          {value(on)}
        </Box>
        <Box marginLeft={column}><Text {...theme.paint("muted")} wrap="truncate-end">{note}</Text></Box>
      </Box>
    );
  };
  return (
    <Box flexDirection="column" height={size.rows} paddingX={1}>
      <Title text={text.title} theme={theme} />
      <Rule width={size.columns - 2} theme={theme} />
      {/* 六项各占两行，矮窗口中去掉项间空行，保证底部的关于信息与按键提示可见。 */}
      <Box flexDirection="column" flexGrow={1} paddingTop={1} gap={size.rows >= 28 ? 1 : 0}>
        {item(0, text.account, on => {
          const [member, memberTone] = membershipText(account), [permission, permissionTone] = permissionSummary(account);
          return <Text wrap="truncate-end">
            <Text {...theme.paint("strong", on)}>{account ? accountName(account) : t().account.reading}</Text><Text {...theme.paint("muted", on)}>  ·  </Text>
            <Text {...theme.paint(memberTone, on)}>{member}</Text><Text {...theme.paint("muted", on)}>{text.permissions}</Text><Text {...theme.paint(permissionTone, on)}>{permission}</Text>
          </Text>;
        }, text.accountNote)}
        {item(1, text.output, on => editing
          ? <Text {...theme.paint("strong", on)}>{draft}<Text {...theme.paint("key", on)}>▌</Text></Text>
          : <Text {...theme.paint("strong", on)}>{truncateMiddle(outputRoot ?? text.notSet, size.columns - column - 4)}</Text>,
          editing ? text.outputEditing : text.outputNote)}
        {item(2, text.clipboard, on => <Text {...theme.paint(clipboardOn ? "done" : "muted", on)}>{clipboardOn ? text.on : text.off}</Text>, text.clipboardNote)}
        {item(3, text.connections, on => (
          <Text>
            <Text {...theme.paint(connections > 1 ? "key" : "muted", on)}>◀ </Text><Text {...theme.paint("strong", on)} bold>{connections}</Text>
            <Text {...theme.paint(connections < MAX_CONNECTIONS ? "key" : "muted", on)}> ▶</Text>
          </Text>
        ), text.connectionsNote(MAX_CONNECTIONS, DEFAULT_CONNECTIONS))}
        {item(4, text.activeFiles, on => (
          <Text>
            <Text {...theme.paint(activeFiles.configured > 1 ? "key" : "muted", on)}>◀ </Text><Text {...theme.paint("strong", on)} bold>{activeFiles.configured}</Text>
            <Text {...theme.paint(activeFiles.configured < MAX_ACTIVE_FILES ? "key" : "muted", on)}> ▶</Text>
            {activeFiles.effective < activeFiles.configured && <Text {...theme.paint("warning", on)}>{text.effective(activeFiles.effective, tierReason(activeFiles.tier))}</Text>}
          </Text>
        ), text.activeFilesNote(MAX_ACTIVE_FILES, DEFAULT_ACTIVE_FILES, PAID_ACTIVE_FILES))}
        {item(5, text.language, on => (
          <Text><Text {...theme.paint("key", on)}>◀ </Text><Text {...theme.paint("strong", on)} bold>{languageName(language)}</Text><Text {...theme.paint("key", on)}> ▶</Text></Text>
        ), text.languageNote)}
        {error && <Text {...theme.paint("error")}>✗ {error}</Text>}
        <Box flexGrow={1} />
        <Box>
          <Box width={column} flexShrink={0}><Text {...theme.paint("muted")}>  {text.about}</Text></Box>
          <Box flexDirection="column">
            <Text><Text {...theme.paint("strong")}>{about.name}</Text><Text {...theme.paint("muted")}>  v{about.version}  ·  {t().author}</Text><Text {...theme.paint("text")}>{about.author}</Text></Text>
            <Text {...theme.paint("active")}>{about.homepage}</Text>
          </Box>
        </Box>
      </Box>
      <Rule width={size.columns - 2} theme={theme} />
      <Keys items={settingKeys(editing, selected)} theme={theme} />
    </Box>
  );
}

const permissionLook = { granted: { icon: "✓", tone: "done" }, missing: { icon: "✗", tone: "error" }, unknown: { icon: "?", tone: "muted" } } as const;
// 账号页（improve-account-login 决策 6）：账号、会员、容量与授权权限；r 重新授权，l 登出（需确认）。
export function AccountPage({ account, quota, confirming, size, theme }: {
  account: AccountView | null; quota: TuiSnapshot["quota"]; confirming: boolean; size: Size; theme: Theme;
}) {
  const [member, memberTone] = membershipText(account), text = t().account;
  const fields: Array<[string, string, Tone]> = [
    [text.account, account ? [account.name, account.email].filter(Boolean).join("  ·  ") || text.unavailable : text.reading, account?.name || account?.email ? "strong" : "muted"],
    [text.id, account?.id ?? text.unavailable, account ? "text" : "muted"],
    [text.membership, member, memberTone],
    [text.quota, quota ? text.quotaValue(formatBytes(quota.usage, true), formatBytes(quota.limit), quota.limit > 0n ? (Number(quota.usage * 1000n / quota.limit) / 10).toFixed(1) : null) : text.unavailable, quota ? "text" : "muted"],
  ];
  const missing = account ? missingPermissions(account.scopes) : [];
  const rows = account ? permissionRows(account.scopes) : [];
  const labelWidth = columnFor([...fields.map(([label]) => label), text.permissions], 8) + 4, permissionWidth = columnFor(rows.map(row => row.label), 8) + 4;
  return (
    <Box flexDirection="column" height={size.rows} paddingX={1}>
      <Title text={text.title} theme={theme} />
      <Rule width={size.columns - 2} theme={theme} />
      <Box flexDirection="column" flexGrow={1} paddingTop={1}>
        {fields.map(([label, value, tone]) => (
          <Box key={label}><Box width={labelWidth} flexShrink={0}><Text {...theme.paint("muted")}>  {label}</Text></Box><Text {...theme.paint(tone)} wrap="truncate-end">{value}</Text></Box>
        ))}
        <Box marginTop={1}><Box width={labelWidth} flexShrink={0}><Text {...theme.paint("muted")}>  {text.permissions}</Text></Box>
          <Box flexDirection="column">
            {account ? rows.map(row => {
              const look = permissionLook[row.state], tone = row.state === "missing" && !row.required ? "muted" : look.tone;
              return <Box key={row.scope}><Box width={permissionWidth} flexShrink={0}><Text {...theme.paint(tone)}>{look.icon} {row.label}</Text></Box>
                <Text {...theme.paint("muted")} wrap="truncate-end">{row.scope} · {row.use}{row.required ? "" : text.optional}</Text></Box>;
            }) : <Text {...theme.paint("muted")}>{text.reading}</Text>}
          </Box>
        </Box>
        {missing.length > 0 && <Text {...theme.paint("error")}>{text.missingHint(permissionNames(missing))}</Text>}
        {account && !informativeScopes(account.scopes) && <Text {...theme.paint("muted")}>{text.uninformative}</Text>}
        {confirming && <Box marginTop={1}><ConfirmDialog heading={text.logoutHeading} title={text.logoutTitle} confirm={t().keys.confirmLogout} theme={theme}
          detail={text.logoutDetail} /></Box>}
      </Box>
      <Rule width={size.columns - 2} theme={theme} />
      <Keys items={confirming ? [["y", t().keys.confirmLogout], ["n", t().keys.back]] : [["r", t().keys.reauthorize], ["l", t().keys.logout], ["Esc", t().keys.back]]} theme={theme} />
    </Box>
  );
}

export const PASTE_BOX_LINES = 10;
// 多行粘贴只追加到输入框，按 Enter 才提交；预览与剪贴板使用同一解析规则。
export function PasteBox({ draft, preview, outputRoot, message, theme, width }: {
  draft: string; preview: PastePreview; outputRoot: string | null; message: string | null; theme: Theme; width: number;
}) {
  const lines = draft ? draft.split("\n").slice(-4) : [""], text = t().paste;
  const status = preview.shares === 0
    ? { tone: draft.trim() ? "warning" as const : "muted" as const, text: draft.trim() ? text.noLink : text.hint }
    : preview.issues.length ? { tone: "warning" as const, text: text.ambiguous }
    : { tone: "done" as const, text: text.recognized(preview.shares, preview.paired === preview.shares, truncateMiddle(outputRoot ?? t().settings.notSet, 30)) };
  return (
    <Box marginLeft={2} borderStyle="round" {...theme.enabled ? { borderColor: "cyan" } : {}} flexDirection="column" paddingX={2} width={Math.min(width, 76)} height={PASTE_BOX_LINES}>
      <Text {...theme.paint("active")} bold>{text.title}</Text>
      {lines.map((line, index) => <Text key={index} {...theme.paint("text")} wrap="truncate-end">{line || " "}</Text>)}
      <Text {...theme.paint("muted")}>{"─".repeat(Math.max(0, Math.min(width, 76) - 6))}</Text>
      <Text {...theme.paint(status.tone)} wrap="truncate-end">{status.text}</Text>
      {message && <Text {...theme.paint("warning")} wrap="truncate-end">{message}</Text>}
    </Box>
  );
}

// 为选中的分享补填提取码（fix-share-pass-code-waiting 决策 4）：只有一行输入，Enter 提交。
export const PASS_CODE_LINES = 5;
export function PassCodeBox({ share, draft, message, theme, width }: { share: string; draft: string; message: string | null; theme: Theme; width: number }) {
  const text = t().passCode;
  return (
    <Box marginLeft={2} borderStyle="round" {...theme.enabled ? { borderColor: "cyan" } : {}} flexDirection="column" paddingX={2} width={Math.min(width, 76)} height={PASS_CODE_LINES}>
      <Text {...theme.paint("active")} bold wrap="truncate-end">{text.title(share)}</Text>
      <Text><Text {...theme.paint("muted")}>{text.label}</Text><Text {...theme.paint("strong")}>{draft}</Text><Text {...theme.paint("key")}>▏</Text></Text>
      <Text {...theme.paint(message ? "warning" : "muted")} wrap="truncate-end">{message ?? text.hint}</Text>
    </Box>
  );
}

export const CONFIRM_LINES = 7;
export function ConfirmDialog({ heading, title, detail, confirm, theme }: { heading: string; title: string; detail: string; confirm: string; theme: Theme }) {
  return (
    <Box marginLeft={10} borderStyle="round" {...theme.enabled ? { borderColor: "yellow" } : {}} flexDirection="column" paddingX={2} width={64} height={CONFIRM_LINES}>
      <Text {...theme.paint("key")} bold>{heading}</Text>
      <Text {...theme.paint("text")} wrap="truncate-end">{title}</Text>
      <Text {...theme.paint("muted")}>{detail}</Text>
      <Text><Text {...theme.paint("key")} bold>y</Text><Text {...theme.paint("text")}> {confirm}    </Text><Text {...theme.paint("key")} bold>n</Text><Text {...theme.paint("text")}> {t().keys.back}</Text></Text>
    </Box>
  );
}
