## Context

`intake/parse.ts` 的 `codes()` 用一条正则识别提取码：`(?:提取码|密码|pass\s*code|password)` 后接冒号、等号或空白，再取到下一个空白为止。空白可以跨行。

## Evidence

2026-10-21 从 PikPak 官方客户端取得分享文本模板：

**网页版**（`mypikpak.com/drive`，v2.29.0）的语言包键 `share-with-passcode-to-clipboard`，由 `{filename, link, passcode}` 填充：

| 语言 | 复制的文本 |
| --- | --- |
| zh-CN | `{link}\n密码: {passcode}\n{filename}\n复制这段内容后打开 PikPak-App，畅享极速秒播` |
| zh-TW | `{link}\n密碼: {passcode}\n{filename}\n…` |
| en-US | `{link}\nPassword: {passcode}\n{filename}\n…` |
| ko | `{link}\n비밀번호: {passcode}\n{filename}\n…` |
| id | `{link}\nKata sandi: {passcode}\n{filename}\n…` |
| ms | `{link}\nKata laluan: {passcode}\n{filename}\n…` |
| ja | `{link}\n\nパスワード: {password}\n\n{filename}\n\n…`（`\n` 为字面的反斜杠与 n） |
| ar | 空，回退到其他语言 |

日文模板有两个错误：多出字面的 `\n`，占位符写成 `{password}`，而调用方只传 `passcode`。用 vue-i18n 渲染的结果是 `パスワード: ` 后为空，所以网页版日文界面复制的文本里没有提取码。

**Android 应用**（`download.mypikpak.com/app/official_PikPak.apk`）的字符串资源 `xpan_share_pwd`：

| 语言 | 标注 |
| --- | --- |
| 默认（英文） | `Password: %s` |
| zh / zh-TW | `密码：%s` / `密碼：%s` |
| ja | `パスワード： %s` |
| ko | `비밀번호: %s` |
| in / ms | `Kata sandi: %s` / `Kata laluan: %s` |
| es / pt | `Contraseña: %s` / `Senha: %s` |
| ru / uk | `Пароль: %s` |
| ar | `كلمة المرور:%s` |

应用的代码经过加固（`libDexHelper`），无法读出拼接方式；现有解析已按实测支持链接与提取码之间隔着空行的格式。Vault 加密分享使用另一组文案 `链接：%1$s` 与 `密钥：%1$s`（`Key: %1$s`），其中的密钥是解密凭证，不是提取码。

网页版设置提取码的提示为“支持 4-10 位”。

## Goals / Non-Goals

**Goals:**
- PikPak 各语言客户端复制的文本都能识别提取码。
- 手写说明中常见的同义词与写法也能识别。
- 不把其他用途的密码当成提取码。

**Non-Goals:**
- 不处理 Vault 加密分享的密钥。
- 不支持 PikPak 的“分享代码”（链接的别名，需要在 PikPak 内输入）。
- 不修复网页版日文模板漏填的密码：文本里没有就无法识别，任务照常进入“需要提取码”，由用户补上后重新复制或粘贴。

## Decisions

### 1. 标注列表

在 PikPak 实际使用的标注之外，加入常见同义词：

- 中文（简繁）：提取码、提取密码、访问码、访问密码、识别码、分享码、分享密码、验证码、取件码、口令、密码。
- 日文：パスワード、パスコード、暗証番号、抽出コード、アクセスコード、共有コード。
- 韩文：비밀번호、암호、추출 코드、접근 코드。
- 泰文：รหัสผ่าน。
- 以空格分词的语言：password、passcode、pass code、pwd、access code、extraction code、kata sandi、kata laluan、contraseña、senha、mot de passe、passwort、wachtwoord、hasło、mật khẩu、şifre、пароль、код доступа、كلمة المرور、كلمة السر。

不收录“分享代码”和“密钥/Key”。前者是 PikPak 的分享别名，后者是 Vault 的解密密钥。

### 2. 标注与值之间的写法

- 冒号（含全角）或等号：之后的一串非空白字符作为值，不合法时按歧义处理，与原规则一致。
- “是/为/為/は”，或中日韩标注后直接紧跟：只接受 4–32 位字母数字，避免把“密码是多少”或“密码管理器”当成值。
- 冒号在行尾、下一行只有 4–32 位字母数字：取下一行。
- 中日韩标注后的空白：之后的非空白字符作为值（原规则）。
- 以空格分词的语言：标注前后必须是词边界，值前必须有冒号、等号或 `is`。
- 值只在同一行内查找。文本与标注先做 NFKC 归一，值去掉包裹的括号与引号。

### 3. 排除非提取码的密码

标注前同一行内紧挨着下列修饰词时跳过：解压、压缩包、解凍、圧縮、압축、unzip、unpack、archive、decompress、extract、zip、rar、7z；登录、账号、账户、ログイン、로그인、login、account；vault、保险箱、金库；Wi-Fi。

### 4. 链接的边界

链接遇到全角的左右括号、书名号、引号即结束，与原先遇到右括号即结束的规则对称。

## Risks / Trade-offs

- [同义词越多，越可能把说明文字当成提取码] → 值必须与链接在同一块内，且需通过 1–32 位字母数字的校验；多个不同的值按歧义处理，不猜测。
- [英文等语言的 `password demo`（无冒号）不再识别] → PikPak 生成的文本都带冒号；查询参数中的 `pwd` 等仍然识别。
