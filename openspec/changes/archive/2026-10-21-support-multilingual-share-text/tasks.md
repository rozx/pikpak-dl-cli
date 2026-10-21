## 1. 调研

- [x] 1.1 取得 PikPak 网页版各语言的分享文本模板，并用 vue-i18n 渲染核对（结果见 design Evidence）。
- [x] 1.2 取得 Android 应用各语言的提取码标注与 Vault 分享文案。

## 2. 实现

- [x] 2.1 `parse.ts`：多语言标注列表、标注与值之间的写法、同一行内取值、NFKC 归一。
- [x] 2.2 排除解压、账号、保险箱与 Wi-Fi 密码。
- [x] 2.3 链接遇到全角括号、书名号与引号即结束。

## 3. 测试与文档

- [x] 3.1 新增 `tests/share-text.test.ts`：网页版与应用各语言模板、日文模板漏填密码、同义词与写法、排除项。
- [x] 3.2 更新 `docs/clipboard.md` 及英文、日文译本与 README 中关于提取码标注的说明。
- [x] 3.3 运行 `bun run check` 与 `openspec validate support-multilingual-share-text --strict`。
