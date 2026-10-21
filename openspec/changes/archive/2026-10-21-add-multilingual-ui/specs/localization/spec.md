## ADDED Requirements

### Requirement: 界面语言

系统 SHALL 支持简体中文（`zh-CN`）、英文（`en`）和日文（`ja`）三种界面语言。全屏界面、CLI 帮助与输出、`watch` 的纯文本提示、错误信息和本地授权页面 SHALL 使用当前语言。分享标题、文件名等用户数据 SHALL 原样显示，不做翻译。`status` 输出的 JSON 字段名与原因代码 SHALL 与语言无关，保持稳定，供脚本读取。

#### Scenario: 英文界面
- **WHEN** 当前语言为英文时用户打开全屏界面
- **THEN** 标题栏、任务状态、事件、按键提示、设置页与确认框都显示英文，分享标题与文件名保持原样

#### Scenario: 脚本读取状态
- **WHEN** 用户在日文环境中运行 `status`
- **THEN** 输出的 JSON 字段名与原因代码与中文环境完全相同

### Requirement: 系统语言检测

语言设置为“跟随系统”或未设置时，系统 SHALL 依次根据环境变量 `LANGUAGE`、`LC_ALL`、`LC_MESSAGES`、`LANG`（忽略 `C`、`POSIX` 及其变体），Windows 的用户界面语言，以及运行时默认区域确定语言。以 `zh` 开头的语言（含繁体中文）SHALL 使用简体中文，以 `ja` 开头的 SHALL 使用日文，其他语言或无法判断时 SHALL 使用英文。检测失败 MUST NOT 阻止程序启动。

#### Scenario: 中文系统
- **WHEN** 用户在 `LANG=zh_CN.UTF-8` 的终端中启动且未手动设置语言
- **THEN** 界面使用简体中文

#### Scenario: 繁体中文系统
- **WHEN** 系统语言为 `zh-TW`
- **THEN** 界面使用简体中文

#### Scenario: 不支持的系统语言
- **WHEN** 系统语言为法文，或环境只设置了 `LANG=C.UTF-8` 且其他来源也无法判断
- **THEN** 界面使用英文

### Requirement: 手动设置语言

系统 SHALL 允许用户在设置页或通过 `config --language <auto|zh-CN|en|ja>` 指定界面语言，保存在任务库配置中，下次启动沿用。手动指定的语言 SHALL 优先于系统语言；设为 `auto` 时恢复跟随系统。非法取值 SHALL 被拒绝，原设置保持不变。程序 SHALL 在输出任何文字前确定语言；任务库不可读时 SHALL 按跟随系统处理，不阻止命令执行。

#### Scenario: 命令行设置语言
- **WHEN** 用户运行 `config --language ja`
- **THEN** 系统保存设置，之后的帮助、提示、错误信息与全屏界面都使用日文

#### Scenario: 非法取值
- **WHEN** 用户运行 `config --language fr`
- **THEN** 系统提示输入无效，原语言设置保持不变

#### Scenario: 恢复跟随系统
- **WHEN** 用户把语言设为 `auto`
- **THEN** 系统重新按系统语言选择界面语言
