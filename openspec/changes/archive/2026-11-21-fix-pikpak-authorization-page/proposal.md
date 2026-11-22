## Why

2026-11-21 起 PikPak 授权页改版：只显示应用在授权请求 `scope` 中列出的应用权限，服务端发现文档的 `scopes_supported` 也改为列出 `account`、`files:manage`、`share`、`cloud_download` 等应用权限。本工具一直只请求 `openid profile`（improve-account-login 的 Non-Goal：当时发现文档只列出登录基础范围，授权页另外让用户逐项勾选全部应用权限）。改版后授权页的权限列表为空，“授权”按钮不可用，首次登录、`login --force` 与重新授权都无法完成。

在授权请求中列出应用权限后，授权页显示“管理文件”“云下载”“账号设置”三项，没有“分享”。授权返回的范围因此不含 `share`，登录被判定为缺少必需权限，同样无法完成。实测（见 design Evidence）不含 `share` 的授权照样能扫描、转存并下载分享。

## What Changes

- 授权请求的 `scope` 在 `openid profile` 之外列出本工具用到的全部应用权限：`account`、`files:manage`、`share`、`cloud_download`。列表取自权限定义，与登录后的核对保持一致。
- 分享（`share`）改为建议权限，不再是必需权限：授权不含 `share` 时照常保存会话。仍在授权请求中列出，授予时照常记录与显示。
- 本地授权页、全屏界面的重新授权提示与 `permissions` 命令随权限定义变化：必须勾选的只剩账号信息与管理文件。
- 更新 README 与 `docs/login.md`（含英文、日文译本）中的权限说明。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `account-session`：授权请求列出应用权限；必需权限改为账号信息与管理文件；本地入口页列出的必须勾选权限随之变化。

## Impact

- `src/pikpak/protocol.ts`（`AUTHORIZATION_SCOPE`、`authorizationUrl`）
- `src/auth/permissions.ts`（`share` 改为非必需）
- 测试：`tests/protocol.test.ts`、`tests/permissions.test.ts`、`tests/i18n.test.ts`、`tests/tui-startup.test.tsx`
- 文档：`README.md`、`README.en.md`、`README.ja.md`、`docs/login.md`、`docs/en/login.md`、`docs/ja/login.md`
- 已保存的会话与已注册的本机 OAuth 客户端照常使用，不需要迁移。
