## 1. 删除已取消的任务

- [x] 1.1 `store.ts`：`forgettable` 接受已取消的文件；`shareForgettable` 接受没有文件的已取消分享；`releaseTargets` 返回已取消的空分享，`ReleaseTarget.completed` 改名为 `finished`。
- [x] 1.2 `workspace.ts`：`discardTemporary` 核对身份后删除未完成的临时文件。
- [x] 1.3 `engine.ts`：释放与全部释放覆盖已取消任务；删除已取消文件的记录前先删除临时文件，失败时保留记录并发出 `task_remove_failed`。
- [x] 1.4 界面：确认框文字（已取消、没有文件的分享）、事件文字；三种语言。
- [x] 1.5 测试：store、引擎/空间的释放与删除、临时文件删除（真实文件系统）。

## 2. 剪贴板接收反馈

- [x] 2.1 会话：剪贴板来源的接收事件带 `reason: "clipboard"`，事件区写明来自剪贴板。
- [x] 2.2 `platform/window.ts`：Windows、macOS、Linux X11 的窗口前置，失败静默。
- [x] 2.3 `LiveController` 收到剪贴板接收事件时前置窗口（1 秒内至多一次）；`run.tsx` 注入。
- [x] 2.4 测试：事件来源、前置触发与节流。

## 3. 事件区展开与折叠

- [x] 3.1 `main-panel.tsx` / `app.tsx`：`l` 切换事件区高度，事件区上方分隔线提示 `l 展开日志`/`l 收起日志`。
- [x] 3.2 测试：展开/折叠高度与分隔线提示；三种语言 100 列内放下按键提示。

## 4. 启动时不接收旧剪贴板

- [x] 4.1 `IntakeReceiver.baseline` 与会话的基线标记（启动与重新开启监听）。
- [x] 4.2 测试：启动时已有分享不接收、之后复制照常接收、重新开启监听。

## 5. 收尾

- [x] 5.1 更新 `README*`、`docs/clipboard.md`、`docs/cloud-space.md` 及英文、日文译本。
- [x] 5.2 运行 `bun run check` 与 `openspec validate improve-intake-feedback-and-cleanup --strict`。
- [x] 5.3 升级版本号（0.10.0）并归档变更。
