export type ShareInput = { shareId: string; passCode: string };
export type ParseResult = { shares: ShareInput[]; issues: Array<"input_too_large" | "ambiguous_code" | "unsupported_link"> };
type Link = { start: number; end: number; raw: string; shareId: string; codes: string[] };
const trimPresentation = (value: string) => value.replace(/[，。；、）】》」\]),.;!！？?]+$/u, "");

// 提取码的标注（support-multilingual-share-text 决策 1）：PikPak 网页版与 Android 应用各语言复制文本里的写法，
// 加上人们手写分享说明时的常见同义词。长的写法在前，“提取密码”不会只匹配到“密码”。
const LABELS: readonly string[] = [
  // 中文（简体与繁体）
  "提取码", "提取碼", "提取密码", "提取密碼", "访问码", "訪問碼", "访问密码", "訪問密碼", "识别码", "識別碼", "分享码", "分享碼", "分享密码", "分享密碼",
  "验证码", "驗證碼", "取件码", "取件碼", "口令", "密码", "密碼",
  // 日文、韩文、泰文
  "パスワード", "パスコード", "暗証番号", "抽出コード", "アクセスコード", "共有コード", "비밀번호", "암호", "추출 코드", "접근 코드", "รหัสผ่าน",
  // 以空格分词的文字
  "password", "passcode", "pass code", "pwd", "access code", "extraction code", "kata sandi", "kata laluan", "contraseña", "contrasena", "senha",
  "mot de passe", "passwort", "wachtwoord", "hasło", "mật khẩu", "şifre", "пароль", "код доступа", "كلمة المرور", "كلمة السر",
].map(label => label.normalize("NFKC"));
// 以空格分词的文字：标注前后必须是词边界，值前必须有冒号、等号或 is，避免把“Password reset link”中的单词当成提取码。
const SPACED = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Arabic}]/u;
const source = (label: string) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[ _-]+/g, "[ \\t_-]*");
const labelPattern = new RegExp([...LABELS].sort((a, b) => b.length - a.length)
  .map(label => SPACED.test(label) ? `(?<![\\p{L}\\p{N}])${source(label)}(?![\\p{L}])` : source(label)).join("|"), "giu");
// 这些修饰词说明后面的密码不是分享的提取码：压缩包的解压密码、账号或保险箱密码、Wi-Fi 密码等。
const NOT_SHARE = /(?:解压|解壓|压缩包?|壓縮包?|解凍|圧縮|압축(?:\s*해제)?|unzip|unpack|archive|decompress(?:ion)?|extract|zip|rar|7z|7-zip|登录|登錄|登入|账号|賬號|帳號|账户|帳戶|ログイン|로그인|login|log-in|sign-in|account|vault|保险箱|保險箱|金库|金庫|wi-?fi)[\s_-]*(?:文件|檔案|ファイル|file|的|の)?[\s_-]*$/iu;
// 文本与标注先做 NFKC 归一：全角冒号、全角字母数字与半角片假名都按常规写法比较。
// 值只在同一行内查找：标注后为空时（例如 PikPak 网页版日文模板漏填密码）不会把下一行的文件名当成提取码。
const H = "[^\\S\\r\\n]", MARKS = "[\\u200e\\u200f\\u061c]*", OPEN = "[「『【\\[(（\"'“‘《]?";
const TOKEN = "([^\\s，。,；;<>「」『』【】\\[\\]()（）\"'“”‘’《》！？!?]+)", ASCII = "([A-Za-z0-9０-９Ａ-Ｚａ-ｚ]{4,32})(?![A-Za-z0-9０-９Ａ-Ｚａ-ｚ])";
const VALUES: Record<"explicit" | "connector" | "nextLine" | "spaced" | "adjacent" | "is", RegExp> = {
  explicit: new RegExp(`${MARKS}${H}*${MARKS}[:：=＝]${H}*${MARKS}${OPEN}${TOKEN}`, "uy"),
  connector: new RegExp(`${H}*(?:是|为|為|は)${H}*${OPEN}${ASCII}`, "uy"),
  // 冒号在行尾、下一行只有一串字母数字。
  nextLine: new RegExp(`${H}*[:：]${H}*\\r?\\n${H}*${ASCII}${H}*(?=\\r?\\n|$)`, "uy"),
  spaced: new RegExp(`${H}+${OPEN}${TOKEN}`, "uy"),
  adjacent: new RegExp(ASCII, "uy"),
  is: new RegExp(`${H}+is${H}+${ASCII}`, "iuy"),
};
function valueAt(text: string, at: number, spaced: boolean): string | null {
  for (const kind of spaced ? ["explicit", "nextLine", "is"] as const : ["explicit", "connector", "nextLine", "spaced", "adjacent"] as const) {
    const pattern = VALUES[kind]; pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (match) return trimPresentation(match[1]!.normalize("NFKC"));
  }
  return null;
}
function codes(input: string): string[] {
  const text = input.normalize("NFKC"), found: string[] = [];
  for (const match of text.matchAll(labelPattern)) {
    const lineStart = text.lastIndexOf("\n", match.index - 1) + 1;
    if (NOT_SHARE.test(text.slice(Math.max(lineStart, match.index - 24), match.index))) continue;
    const value = valueAt(text, match.index + match[0].length, SPACED.test(match[0]));
    if (value !== null) found.push(value);
  }
  return found;
}
const urls = /https?:\/\/[^\s<>"'，。；、（）【】《》「」『』]+/gi;
// 官方复制的分享文本以空行隔开链接与提取码；只含码的块并入紧邻的、尚无任何码的链接块，其余块仍互相隔离。
function blocks(text: string): string[] {
  const result: string[] = [];
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    if (!block.trim()) continue;
    const previous = result.at(-1);
    if (previous !== undefined && !/https?:\/\//i.test(block) && codes(block).length && /https?:\/\//i.test(previous)
      && !codes(previous.replace(urls, " ")).length && !/https?:\/\/\S*[?&](?:pwd|password|passcode|pass_code)=/i.test(previous)) {
      result[result.length - 1] = `${previous}\n${block}`;
    } else result.push(block);
  }
  return result;
}
function uniqueCode(values: string[]): string | null {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length <= 1 && unique.every(value => /^[A-Za-z0-9]{1,32}$/.test(value)) ? unique[0] ?? "" : null;
}

export function parseShares(text: string): ParseResult {
  if (text.length > 65536) return { shares: [], issues: text.includes("https://mypikpak.com/s/") ? ["input_too_large"] : [] };
  const result: ParseResult = { shares: [], issues: [] };
  for (const block of blocks(text)) {
    const links: Link[] = [];
    const urlMatches = [...block.matchAll(/https?:\/\/[^\s<>"'，。；、（）【】《》「」『』]+/gi)];
    for (const match of urlMatches) {
      const raw = trimPresentation(match[0]);
      let url: URL;
      try { url = new URL(raw); } catch { continue; }
      const path = /^\/s\/([A-Za-z0-9_-]{1,128})\/?$/.exec(url.pathname);
      if (url.origin !== "https://mypikpak.com" || url.username || url.password || !path?.[1]) {
        if (url.hostname === "mypikpak.com") result.issues.push("unsupported_link");
        continue;
      }
      const queryCodes = ["pwd", "password", "passcode", "pass_code"].flatMap(key => url.searchParams.getAll(key));
      links.push({ start: match.index, end: match.index + match[0].length, raw: match[0], shareId: path[1], codes: queryCodes });
    }
    if (!links.length) continue;
    const withoutUrls = block.replace(/https?:\/\/[^\s<>"'，。；、（）【】《》「」『』]+/gi, " ");
    if (urlMatches.length !== links.length && codes(withoutUrls).length) {
      result.issues.push("ambiguous_code"); continue;
    }
    if (links.length === 1) {
      const link = links[0]!;
      const passCode = uniqueCode([...link.codes, ...codes(withoutUrls)]);
      if (passCode === null) result.issues.push("ambiguous_code");
      else result.shares.push({ shareId: link.shareId, passCode });
      continue;
    }
    const externalCodes = codes(withoutUrls);
    const prefixCodes = codes(block.slice(0, links[0]!.start));
    const segments = links.map((link, index) => codes(block.slice(link.end, links[index + 1]?.start ?? block.length)));
    // 每行单独完整配对，或每个链接后均有明确标记，或码直接嵌在链接里。
    const lines = block.split(/\r?\n/);
    const ownLineCodes = links.map(link => {
      const start = block.lastIndexOf("\n", link.start - 1) + 1;
      const next = block.indexOf("\n", link.end);
      const end = next < 0 ? block.length : next;
      if (links.filter(other => other.start >= start && other.start < end).length !== 1) return null;
      return codes(block.slice(start, end).replace(/https?:\/\/[^\s<>"'，。；、（）【】《》「」『』]+/gi, " "));
    });
    const codesOutsideLinkLines = lines.some(line => !/https?:\/\//i.test(line) && codes(line).length > 0);
    const linePairs = ownLineCodes.every(value => value !== null) && !codesOutsideLinkLines;
    if (externalCodes.length && !linePairs && (prefixCodes.length || segments.some((values, index) => !values.length && !links[index]!.codes.length))) {
      result.issues.push("ambiguous_code"); continue;
    }
    const paired = links.map((link, index) => ({ shareId: link.shareId,
      passCode: uniqueCode([...link.codes, ...(linePairs ? ownLineCodes[index]! : segments[index]!)]) }));
    if (paired.some(value => value.passCode === null)) { result.issues.push("ambiguous_code"); continue; }
    for (const item of paired) result.shares.push({ shareId: item.shareId, passCode: item.passCode! });
  }
  // 同一份输入中同一分享出现矛盾访问码时不按文本顺序猜测。
  const grouped = new Map<string, Set<string>>();
  for (const item of result.shares) {
    const group = grouped.get(item.shareId) ?? new Set(); group.add(item.passCode); grouped.set(item.shareId, group);
  }
  result.shares = [...grouped].flatMap(([shareId, values]) => {
    if (values.size > 1) { result.issues.push("ambiguous_code"); return []; }
    return [{ shareId, passCode: [...values][0]! }];
  });
  result.issues = [...new Set(result.issues)];
  return result;
}
