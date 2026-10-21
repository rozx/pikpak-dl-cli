## Why

程序的全部输出都是简体中文：全屏界面、CLI 帮助与提示、错误信息和浏览器里的本地授权页。PikPak 在中文以外的地区也有大量用户，看不懂中文的用户无法判断任务状态、失败原因和确认框里的删除范围，只能靠猜。

## What Changes

- 支持三种界面语言：简体中文、英文、日文。
- 默认按系统语言自动选择：中文系统用简体中文，日文系统用日文，其余（包括无法判断）用英文。
- 用户可以手动指定语言：设置页新增“语言”项，CLI 新增 `config --language <auto|zh-CN|en|ja>`。选择保存在任务库配置中，下次启动沿用；在设置页切换后界面立即改用新语言。
- 翻译范围：全屏界面、CLI 帮助与输出、`watch` 的纯文本提示、错误信息、本地授权页面。
- 新增英文与日文 README 及 `docs/` 文档，README 截图按语言分别生成。
- 不翻译的内容：分享标题与文件名、`status` 输出的 JSON 字段与原因代码、代码注释与 OpenSpec 规格。

## Capabilities

### New Capabilities

- `localization`：界面语言的种类、自动检测、手动设置与回退规则，以及翻译覆盖范围。

### Modified Capabilities

- `terminal-ui`：设置页新增语言项；按键提示与标签宽度按当前语言的文字计算。

## Impact

- 新增 `src/i18n/`：语言检测与设置、三份文案目录（`messages/zh-CN.ts` 为基准，`en.ts`、`ja.ts` 由类型检查保证与之完全对应）。
- `src/tui/`、`src/cli.ts`、`src/errors.ts`、`src/runtime/watch.ts`、`src/runtime/lifecycle.ts`、`src/auth/login.ts`、`src/auth/login-page.ts`、`src/auth/permissions.ts`：文字改从文案目录读取。
- `src/runtime/session.ts`：新增 `setLanguage` 命令。
- `src/state/store.ts`：配置键新增 `language`，不需要迁移。
- 文档：新增 `README.en.md`、`README.ja.md`、`docs/en/`、`docs/ja/`；`scripts/screenshots.tsx` 按语言输出截图。
