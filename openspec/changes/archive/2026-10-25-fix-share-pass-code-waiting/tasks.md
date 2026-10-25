## 1. 解析

- [x] 1.1 `parse.ts`：只有一个链接行与一行单独提取码时识别该提取码。
- [x] 1.2 `tests/share-text.test.ts`：覆盖用户样本（含不间断空格的空白行）及不应识别的形状。

## 2. 扫描与命令

- [x] 2.1 `ShareScanError` 增加 `reason`，区分 `pass_code_missing` 与 `pass_code_wrong`；`scanShare` 与引擎事件使用它。
- [x] 2.2 `IntakeReceiver.receivePassCode` 与会话命令 `setPassCode`：校验提取码、更新访问资料并重新扫描。
- [x] 2.3 测试：扫描原因、`setPassCode` 命令。

## 3. 界面

- [x] 3.1 分享行：扫描失败显示错误状态与原因，等待提取码时提示按 Enter。
- [x] 3.2 提取码输入框：Enter 打开、提交、Esc 取消，按键提示随选中项变化。
- [x] 3.3 三种语言的界面文字与原因说明。
- [x] 3.4 界面测试。

## 4. 收尾

- [x] 4.1 更新 `docs/clipboard.md` 及英文、日文译本。
- [x] 4.2 运行 `bun run check` 与 `openspec validate fix-share-pass-code-waiting --strict`。
- [x] 4.3 升级版本号并归档变更。
