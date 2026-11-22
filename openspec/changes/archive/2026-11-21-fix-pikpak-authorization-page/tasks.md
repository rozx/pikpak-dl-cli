## 1. 授权请求

- [x] 1.1 `protocol.ts`：新增 `AUTHORIZATION_SCOPE`（`openid profile` 加全部应用权限），`authorizationUrl` 使用它。
- [x] 1.2 `tests/protocol.test.ts`：授权 URL 的 `scope` 列出全部应用权限。

## 2. 必需权限

- [x] 2.1 `permissions.ts`：`share` 改为非必需，注明原因。
- [x] 2.2 测试：缺少权限的名称列表、界面重新授权提示，以及不含 `share` 的实测授权范围不判定缺少。

## 3. 收尾

- [x] 3.1 实机验证：授权页列出权限并可授权；不含 `share` 的授权能扫描、转存与下载分享。
- [x] 3.2 更新 README 与 `docs/login.md` 及英文、日文译本。
- [x] 3.3 运行 `bun run check` 与 `openspec validate fix-pikpak-authorization-page --strict`。
- [x] 3.4 归档变更。
