## Why

复制 `链接 + 空行 + 单独一行的提取码`（不带“密码：”之类的标注）时，解析器认不出提取码，分享按无码接收。服务端返回需要提取码后，分享的扫描记为失败，界面却仍显示“扫描中…”，只有事件区写着“扫描等待：分享需要提取码，或提取码不正确”。用户看不出任务已经停下，只能重新复制完整文本，没有就地补填提取码的办法。

## What Changes

- 解析：整段文本只有一个分享链接（独占一行）和一行单独的提取码时，把这一行识别为该链接的提取码。
- 扫描结果区分“缺少提取码”（服务端 `PASS_CODE_EMPTY`）与“提取码错误”（`PASS_CODE_ERROR`），分别记录原因。
- 主面板：扫描失败的分享不再显示“扫描中”，改用错误色显示失败原因；等待提取码的分享显示“按 Enter 输入提取码”。
- 选中等待提取码的分享按 Enter，打开提取码输入框；提交后更新该分享的访问资料并重新扫描。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `clipboard-intake`：完整分享文本解析支持“单独一行的提取码”；缺失或错误提取码可以在界面中为指定分享补填。
- `terminal-ui`：扫描失败的分享显示错误状态；新增提取码输入框。

## Impact

- `src/intake/parse.ts`、`src/intake/receiver.ts`
- `src/pikpak/shares.ts`（区分缺码与错码）、`src/runtime/engine.ts`、`src/runtime/session.ts`（新命令 `setPassCode`）
- `src/tui/app.tsx`、`main-panel.tsx`、`pages.tsx`、`view-model.ts` 与三种语言的界面文字
- 测试：`tests/share-text.test.ts`、`tests/shares.test.ts`、界面与会话测试
