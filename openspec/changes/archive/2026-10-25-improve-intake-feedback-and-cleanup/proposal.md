## Why

实际使用 v0.9.2 时发现四个问题：

1. 已取消的任务无法从列表中删除。按 `x` 只提示“没有可释放的云端副本”，因为只有已完成的任务才能删除记录。
2. 从剪贴板接收分享时，终端窗口通常在后台，用户看不到任何反馈，不知道是否已经添加。
3. 事件区固定只显示最近 3 条，无法回看更早的事件。
4. 每次启动都会接收剪贴板里遗留的分享文本。用户没有新的复制动作，却多出了任务（或者重新扫描已取消、已完成的分享）。

## What Changes

- 已取消的任务（文件或分享）可以按 `x` 删除：有本工具保留的云端副本时先释放副本，再删除任务记录；没有副本时经确认只删除记录。本地未完成的临时文件（`.pikpak-part`）一并删除，已交付的本地文件不动。`X` 全部释放同时处理已完成与已取消的任务。
- 从剪贴板接收到分享时，全屏界面尝试把终端窗口带到前台，事件区写明“已从剪贴板接收”。
- 主面板按 `l` 展开或折叠事件区：展开时显示更多最近事件，再按一次恢复 3 行。
- 启动监听（程序启动或在设置中重新开启）后的第一次读取只记录剪贴板现状，不接收其中的分享；之后的复制事件照常接收。**BREAKING**：原规格要求启动时接收一次当前文本。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `clipboard-intake`：启动监听时不接收剪贴板中已有的文本。
- `transfer-queue`：已取消的任务可以经确认删除；“再次启动监听”不再出现在已取消分享的场景中。
- `cloud-space-reclamation`：手动释放与全部释放覆盖已取消的任务，并删除其记录与本地临时文件。
- `terminal-ui`：`x`、`X` 覆盖已取消任务；新增剪贴板接收反馈（窗口前置）与事件区展开/折叠。

## Impact

- `src/intake/receiver.ts`、`src/runtime/session.ts`（启动基线、接收来源）
- `src/state/store.ts`、`src/runtime/engine.ts`、`src/download/workspace.ts`（已取消任务的释放与删除、临时文件删除）
- `src/platform/window.ts`（新增：把终端窗口带到前台）、`src/tui/live.ts`、`src/tui/run.tsx`
- `src/tui/app.tsx`、`main-panel.tsx`、`view-model.ts` 与三种语言的界面文字
- 测试：会话、引擎、空间、界面与多语言测试
- 文档：`README*`、`docs/clipboard.md`、`docs/cloud-space.md` 及英文、日文译本
