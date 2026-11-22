## Context

improve-account-login 确定：授权请求的 `scope` 固定为 `openid profile`，由 PikPak 授权页让用户逐项勾选应用权限；登录后按令牌返回的授权范围核对必需权限（账号信息、管理文件、分享）。当时发现文档的 `scopes_supported` 只有登录基础范围，请求其他值可能被拒绝。

2026-11-21 的发现文档列出 `openid`、`files:read`、`files:write`、`files:manage`、`files:purge`、`cloud_download`、`share`、`invite`、`account`，不再列出 `profile`。授权页只显示请求中列出的应用权限。

## Goals / Non-Goals

**Goals:**
- 浏览器授权重新可以完成。
- 必需权限只包含服务端实际会授予、且本工具实际依赖的权限。

**Non-Goals:**
- 不重新注册已保存的本机 OAuth 客户端，也不在注册请求中声明 `scope`：现有客户端已经可以取得账号信息、管理文件与云下载。
- 不请求 `files:purge`：删除副本已由 `files:manage` 覆盖（add-task-controls 实测）。
- 不移除 `profile`：服务端照常接受，移除后能否读取账号名称与邮箱未经验证。

## Decisions

### 1. 授权请求列出应用权限

`AUTHORIZATION_SCOPE` 由 `openid profile` 加上 `PERMISSIONS` 中全部权限的 `scope` 组成，请求与核对使用同一份定义。

### 2. 分享改为建议权限

`share` 的 `required` 改为 `false`，与云下载一样标为“建议勾选”。仍在请求中列出：服务端以后提供这一项时，用户可以授予，账号页照常显示授予状态。必需权限只剩账号信息与管理文件，授权缺少其中任一项时仍不保存。

## Risks / Trade-offs

- [服务端以后对分享接口要求 `share`] → 扫描或转存被拒绝时按现有规则以权限原因暂停（`pikpak/client.ts` 对 401、403 与 `permission_denied` 的处理不变），用户可以看到原因。
- [授权页再次改版] → 授权返回后的范围核对仍然有效，缺少必需权限时提示重新授权。

## Evidence

2026-11-21 实机登录（Windows，v0.10.2 测试构建）：

1. 只请求 `openid profile`：授权页“此应用请求”下没有任何权限，“授权”按钮不可用。
2. 请求 `openid profile account files:manage share cloud_download`：授权页列出“管理文件”“云下载”“账号设置”并默认勾选，没有“分享”。授权后本地结果页提示缺少“分享”，其余必需权限齐全。
3. 把 `share` 改为非必需后重新登录：登录成功；复制一个分享后，扫描、转存到云盘与下载都正常完成。
