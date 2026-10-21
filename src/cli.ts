#!/usr/bin/env bun
import { AppError, publicError } from "./errors";
import { about } from "./about";
import { join, resolve } from "node:path";
import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { prepareState, stateRoot } from "./state/paths";
import { acquireQueueLock } from "./state/lock";
import { Store } from "./state/store";
import { systemSecrets } from "./auth/secrets";
import { SessionManager } from "./auth/session";
import { login } from "./auth/login";
import { informativeScopes, missingPermissions, permissionNames, permissionRows } from "./auth/permissions";
import { clipboardWorker } from "./intake/clipboard-worker";
import { watch } from "./runtime/watch";
import { interruptible } from "./runtime/lifecycle";
import { configuredConnections, saveConnections } from "./download/connections";
import { configuredActiveFiles, saveActiveFiles } from "./runtime/active-files";
import { storedTier, tierCap } from "./pikpak/tier";
import { t } from "./i18n";
import { initLanguage, languageName, saveLanguage } from "./i18n/language";

// 打印服务端返回的授权范围与每项权限的判定；范围不含应用权限时说明无法确认。
async function printPermissions(session: SessionManager, raw: boolean): Promise<void> {
  const scopes = await session.scopes(), text = t().cli;
  if (raw) console.log(text.rawScopes(scopes?.join(" ") || text.scopesMissing));
  if (!informativeScopes(scopes)) {
    console.log(text.scopesUninformative);
    return;
  }
  for (const row of permissionRows(scopes)) console.log(`  ${row.state === "granted" ? "✓" : "✗"} ${text.permission(row.label, row.scope)}${row.state === "missing" ? (row.required ? text.permissionMissing : text.permissionUnused) : ""}`);
  const missing = missingPermissions(scopes);
  if (missing.length) console.log(text.missingPermissions(permissionNames(missing)));
}

function activeAccount(store: Store): string {
  const account = store.config("active_account");
  if (!account) throw new AppError("login_required");
  return account;
}

export async function runCli(args: string[]): Promise<void> {
  if (args[0] === "--internal-clipboard") {
    if (process.stdin.isTTY || process.stdout.isTTY) throw new AppError("invalid_input");
    await clipboardWorker(args[1]); return;
  }
  // 只有标准输入与输出都是交互终端时才进入全屏界面；重定向或管道中打印纯文本帮助。
  if (!args.length && process.stdin.isTTY && process.stdout.isTTY) {
    const { runTui } = await import("./tui/run");
    const code = await runTui();
    if (code === 130) process.exit(code);
    process.exitCode = code; return;
  }
  if (!args.length || (args.length === 1 && ["--help", "-h", "help"].includes(args[0]!))) {
    console.log(t().cli.help(about)); return;
  }
  if (args.length === 1 && ["--version", "-v"].includes(args[0]!)) { console.log(about.version); return; }
  const command = args[0];
  if (command === "status") {
    if (args.length > 2) throw new AppError("invalid_input");
    const database = join(stateRoot(), "tasks.sqlite");
    if (!await Bun.file(database).exists()) { console.log(t().cli.noTasks); return; }
    const store = new Store(database, true);
    try {
      const account = store.config("active_account");
      if (!account) { console.log(t().cli.noAccount); return; }
      if (args[1]?.startsWith("f_")) {
        const file = store.file(account, args[1]);
        console.log(JSON.stringify({ id: file.id, state: file.state === "completed" ? "completed" : file.cancelled ? "cancelled" : file.state, retries: Number(file.retries), reason: file.lastError }));
      } else {
        const shares = args[1] ? [store.share(account, args[1])] : store.shares(account);
        // status 不联网：账号等级取上一次会话读到的结果，未读过时按未知（同时只下载 1 个文件）显示。
        const tier = storedTier(store, account), configured = configuredActiveFiles(store);
        const activeFiles = { configured, tier: tier?.tier ?? "unknown", tierCheckedAt: tier ? new Date(tier.at).toISOString() : null,
          effective: Math.min(configured, tierCap(tier?.tier ?? "unknown")) };
        console.log(JSON.stringify({ paused: store.paused(account), connections: configuredConnections(store), activeFiles,
          tasks: shares.map(share => ({ id: share.id, ...store.summary(account, share.id) })) }, null, 2));
      }
    } finally { store.close(); }
    return;
  }
  if (["config", "retry", "cancel", "login", "logout", "watch", "permissions"].includes(command!)) {
    if (command === "config" ? args.length !== 3 || !["--output", "--connections", "--files", "--language"].includes(args[1]!) : ["retry", "cancel"].includes(command!) && args.length !== 2) throw new AppError("invalid_input");
    if (command === "login" && (args.length > 2 || (args[1] && args[1] !== "--force"))) throw new AppError("invalid_input");
    if ((command === "logout" || command === "permissions") && args.length !== 1) throw new AppError("invalid_input");
    if (command === "watch" && args.length !== 1 && !(args.length === 3 && args[1] === "--output")) throw new AppError("invalid_input");
    const paths = await prepareState();
    const lock = acquireQueueLock(paths.lock);
    try {
      const store = new Store(paths.database);
      try {
        if (command === "watch") {
          await interruptible(signal => watch(store, args[2] ?? null, signal));
          return;
        }
        if (command === "permissions") {
          const session = new SessionManager(systemSecrets());
          if (!await session.scopes() && !await systemSecrets().get("session.current")) console.log(t().cli.notLoggedIn);
          else await printPermissions(session, true);
          return;
        }
        if (command === "login" || command === "logout") {
          const session = new SessionManager(systemSecrets(), undefined, account => { store.ensureAccount(account); store.pause(account, "authentication"); });
          if (command === "logout") {
            const account = store.config("active_account");
            if (account) store.pause(account, "authentication");
            await session.logout();
            console.log(t().cli.loggedOut);
          } else {
            const account = await login(session, args[1] === "--force");
            store.ensureAccount(account); store.setConfig("active_account", account); store.clearAuthenticationPause(account);
            console.log(t().cli.loggedIn);
            await printPermissions(session, false);
          }
          return;
        }
        if (command === "config" && args[1] === "--files") {
          console.log(t().cli.savedActiveFiles(saveActiveFiles(store, args[2]!)));
        } else if (command === "config" && args[1] === "--connections") {
          console.log(t().cli.savedConnections(saveConnections(store, args[2]!)));
        } else if (command === "config" && args[1] === "--language") {
          // 先保存并切换，再取文字：确认提示已经是新语言。
          const setting = saveLanguage(store, args[2]!);
          console.log(t().cli.savedLanguage(languageName(setting)));
        } else if (command === "config") {
          const output = await realpath(resolve(args[2]!));
          if (!(await stat(output)).isDirectory()) throw new AppError("invalid_input");
          await access(output, constants.W_OK | constants.X_OK);
          store.setConfig("output_root", output);
          const account = store.config("active_account"), moved = account ? store.moveUnstartedShares(account, output).length : 0;
          console.log(t().cli.savedOutput(moved));
        } else {
          const account = activeAccount(store);
          if (command === "cancel") { store.cancel(account, args[1]!); store.recheckCancelledPause(account); console.log(t().cli.cancelled); }
          else { store.retry(account, args[1]!); console.log(t().cli.retried); }
        }
      } finally { store.close(); }
    } finally { lock.release(); }
    return;
  }
  throw new AppError("invalid_input");
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  // 输出任何文字前确定语言（add-multilingual-ui 决策 4）；剪贴板子进程不输出文字。
  if (args[0] !== "--internal-clipboard") {
    let database: string | null = null;
    try { database = join(stateRoot(), "tasks.sqlite"); } catch { /* 平台不受支持时跟随系统，错误由命令本身报告。 */ }
    await initLanguage(database);
  }
  try { await runCli(args); }
  catch (error) { console.error(publicError(error)); process.exitCode = 1; }
}

if (import.meta.main) await main();
