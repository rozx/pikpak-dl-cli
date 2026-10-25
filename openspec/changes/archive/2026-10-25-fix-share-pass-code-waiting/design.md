## Context

分享扫描在 `scanShare` 中调用 `/drive/v1/share`；服务端返回 `PASS_CODE_EMPTY` 或 `PASS_CODE_ERROR` 时抛出 `ShareScanError("access_required")`，`finishScan` 把分享的 `scan_status` 记为 `failed`、`last_error` 记为 `access_required`。界面的分享行只区分“已完成扫描”与“其他”，`failed` 也被当成扫描中。

## Goals / Non-Goals

**Goals:** 等待提取码的分享一眼可见，并能在界面中就地补填；识别“链接 + 单独一行提取码”的简单写法。

**Non-Goals:** 不放宽多分享或带说明文字时的配对规则；不把之后单独复制的提取码自动关联到任务（`clipboard-intake` 原有要求保持不变）。

## Decisions

1. **单独一行的提取码只在最简单的形状下识别。** 整段文本去掉空白行后恰好两行：一行只有一个受支持的分享链接，另一行只有 4–32 位字母数字。其他形状（有说明文字、多个链接、带文件名的模板）仍按原规则处理，避免把文件名当成提取码。即使误判，服务端会拒绝，分享进入“提取码错误”，用户可以按 Enter 改正。
2. **缺码与错码分开记录。** `ShareScanError` 保留 `access_required` 作为类别（文件转存路径仍按它判断），另带 `reason`：`pass_code_missing` 或 `pass_code_wrong`。`finishScan` 与 `scan_waiting` 事件使用 `reason`；访问资料不可读时仍为 `access_required`。
3. **扫描失败的分享显示错误状态。** `scan_status` 为 `pending` 或 `active` 才算扫描中；`failed` 时用错误色显示原因，没有文件时替代“扫描中”，有文件时附在计数后。
4. **补填提取码是显式指定目标的输入。** 选中原因为 `pass_code_missing`、`pass_code_wrong` 或 `access_required` 的分享按 Enter 时打开输入框（其他分享仍是展开/折叠）。提交时由 `RuntimeSession` 的新命令 `setPassCode` 交给 `IntakeReceiver.receivePassCode`，复用 `acceptShare`：写入新的访问资料、重置因提取码失败的文件并请求重新扫描。这是用户对选中分享的明确操作，不违反“不自动关联单独复制的提取码”。提取码不写入事件、日志或快照。
