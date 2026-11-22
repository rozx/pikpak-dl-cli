## 1. 调度

- [x] 1.1 `store.ts`：`nextPresave` 按队列顺序选第一个没有保留副本、也没有已发出转存的文件。
- [x] 1.2 `engine.ts`：`presave` 与 `presaveOnce`：门槛、选择登记、核对来源、空间计划、转存；放不下时停在该文件并记 `presaveWaitUntil`，`completed` 与 `copy_released` 事件清除。
- [x] 1.3 `engine.ts`：转存锁 `saving`，串行步骤的转存也经过它；等锁时可被中断。
- [x] 1.4 `engine.ts`：串行步骤选中预先转存中的文件时等它结束；`haltPool`、`stopActive` 与手动释放处理预先转存。
- [x] 1.5 `session.ts`：启动核对之后启动预先转存循环，停止时等它返回。

## 2. 界面

- [x] 2.1 `view-model.ts`：已转存、等待下载的文件外观与分享计数；`presaving` 事件的说明。
- [x] 2.2 `main-panel.tsx`：分享行显示已转存数量；`live.ts`：`presaved` 事件刷新云盘容量。
- [x] 2.3 三种语言的界面文字。

## 3. 测试

- [x] 3.1 `tests/presave.test.ts`：按顺序转存全部文件后下载；放不下时先回收、仍放不下时停住且不改变状态；暂停时不转存、跳过暂停的文件；串行步骤等待预先转存、转存不并发；取消中断预先转存。
- [x] 3.2 `tests/runtime-session.test.ts`：下载期间接收的分享立即扫描并预先转存。
- [x] 3.3 `tests/tui-view-model.test.ts`：已转存、等待下载的显示与计数。

## 4. 收尾

- [x] 4.1 更新 README、`docs/downloads.md` 与 `docs/cloud-space.md` 及英文、日文译本。
- [x] 4.2 运行 `bun run check` 与 `openspec validate presave-on-intake --strict`。
- [ ] 4.3 实机验证：复制多文件分享后，第一个文件下载期间其余文件已转存；云盘放不下时先回收已交付的副本。
- [x] 4.4 归档变更。
