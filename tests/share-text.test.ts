import { expect, test } from "bun:test";
import { parseShares } from "../src/intake/parse";

// 支持的分享文本（support-multilingual-share-text）：样本取自 PikPak 网页版（v2.29）与 Android 应用的文案，链接、码与文件名均为虚构。
const link = "https://mypikpak.com/s/VOsynthetic01";
const share = (passCode: string) => [{ shareId: "VOsynthetic01", passCode }];

test("PikPak 网页版各语言复制的分享文本都能识别链接与提取码", () => {
  const web: Record<string, string> = {
    "zh-CN": `${link}\n密码: w2k9\nMovie.mkv\n复制这段内容后打开 PikPak-App，畅享极速秒播`,
    "zh-TW": `${link}\n密碼: w2k9\nMovie.mkv\n複製這段內容後打開 PikPak-App，暢享極速秒播`,
    "en-US": `${link}\nPassword: w2k9\nMovie.mkv\nAfter copying this content, open PikPak-App and enjoy extremely fast streaming`,
    ko: `${link}\n비밀번호: w2k9\nMovie.mkv\n이 콘텐츠를 복사한 후 픽팍 앱을 열고 초고속 스트리밍을 즐기십시오.`,
    id: `${link}\nKata sandi: w2k9\nMovie.mkv\nSetelah menyalin konten ini, buka Aplikasi PikPak dan nikmati streaming yang sangat cepat`,
    ms: `${link}\nKata laluan: w2k9\nMovie.mkv\nSelepas menyalin kandungan ini, buka PikPak-App dan nikmati penstriman yang sangat pantas`,
  };
  for (const [language, text] of Object.entries(web)) expect({ language, ...parseShares(text) }).toEqual({ language, shares: share("w2k9"), issues: [] });
});

test("网页版日文模板漏填密码：识别为无码分享，不把下一行的文件名当成提取码", () => {
  // 模板原文含字面的反斜杠与 n（语言包中多转义了一层，见 support-multilingual-share-text 的 design Evidence）。
  const text = `${link}\n\\nパスワード: \n\\nMovie2024\n\\nこのコンテンツをコピーした後、PikPak アプリを開いて、超高速のインスタント ブロードキャストをお楽しみください`;
  expect(parseShares(text)).toEqual({ shares: share(""), issues: [] });
  // 用户补上密码后照常识别。
  expect(parseShares(text.replace("パスワード: ", "パスワード: w2k9")).shares).toEqual(share("w2k9"));
  // PikPak 修好多余的换行但仍漏填密码时，标注后的冒号在行尾、下一行是不带后缀的文件名、再下一行是说明：文件名也不能当成提取码。
  const single = `${link}\nパスワード: \nMovie2024\nこのコンテンツをコピーした後、PikPak アプリを開いて、超高速のインスタント ブロードキャストをお楽しみください`;
  expect(parseShares(single)).toEqual({ shares: share(""), issues: [] });
  expect(parseShares(`${link}\nPassword:\nMovie2024\nAfter copying this content, open PikPak-App`).shares).toEqual(share(""));
  // 同理，冒号在行尾、下一行之后紧跟说明时无法区分码与文件名，按未提供提取码处理；码行后空一行即可识别。
  expect(parseShares(`${link}\n提取码：\nw2k9\n需要的抓紧存`).shares).toEqual(share(""));
  expect(parseShares(`${link}\n提取码：\nw2k9\n\n需要的抓紧存`).shares).toEqual(share("w2k9"));
});

test("Android 应用各语言的提取码写法都能识别，包括全角冒号与从右到左的文字", () => {
  const labels = ["Password: ", "密码：", "密碼：", "パスワード： ", "비밀번호: ", "Kata sandi: ", "Kata laluan: ", "Contraseña: ", "Senha: ", "Пароль: ", "كلمة المرور:", "‏كلمة المرور: ‏"];
  for (const label of labels) {
    expect({ label, ...parseShares(`Movie.mkv\n${link}\n\n${label}w2k9`) }).toEqual({ label, shares: share("w2k9"), issues: [] });
    expect({ label, ...parseShares(`${link}\n${label}w2k9`) }).toEqual({ label, shares: share("w2k9"), issues: [] });
  }
});

test("手写分享说明中的同义词与常见写法", () => {
  const variants = [
    `${link} 提取码：w2k9`, `${link} 提取碼：w2k9`, `${link} 提取密码：w2k9`, `${link} 识别码：w2k9`, `${link} 識別碼 w2k9`, `${link} 访问码：w2k9`,
    `${link} 分享码：w2k9`, `${link} 口令：w2k9`, `${link}\n【提取码：w2k9】`, `${link}（密码：w2k9）`, `${link} 密码：「w2k9」`, `${link} 提取码w2k9`,
    `${link} 密码是 w2k9`, `${link} 提取码为w2k9。`, `${link} 密码：ｗ２ｋ９`, `${link}\n提取码：\nw2k9`, `${link}\n提取码：\nw2k9\n\n其他说明`, `资源.zip ${link}\nmovie.rar 密码：w2k9`, `${link} 7z-tools 提取码：w2k9`, `${link} パスコード：w2k9`, `${link} パスワードは w2k9`,
    `${link} ﾊﾟｽﾜｰﾄﾞ: w2k9`, `${link} 暗証番号：w2k9`, `${link} access code: w2k9`, `${link} Pass code = w2k9`, `${link} passcode:w2k9`, `${link} PWD: w2k9`,
    `${link} The password is w2k9.`, `${link} Extraction code: w2k9`, `${link} mot de passe : w2k9`, `${link} Passwort: w2k9`, `${link} Mật khẩu: w2k9`,
    `${link} Şifre: w2k9`, `${link} hasło: w2k9`, `${link} 암호: w2k9`, `${link} รหัสผ่าน: w2k9`,
  ];
  for (const text of variants) expect({ text, ...parseShares(text) }).toEqual({ text, shares: share("w2k9"), issues: [] });
});

test("只有链接与单独一行的提取码时识别该提取码", () => {
  // 用户样本的形状：链接、空行、只含不间断空格的行、空行、提取码。
  expect(parseShares(`${link}\n\n \n\nw2k9`)).toEqual({ shares: share("w2k9"), issues: [] });
  expect(parseShares(`${link}\r\nw2k9\r\n`)).toEqual({ shares: share("w2k9"), issues: [] });
  expect(parseShares(`  ${link}  \n\n  ｗ２ｋ９ `).shares).toEqual(share("w2k9"));
  // 其他形状不猜测：多出说明文字、链接行带文字、码太短或含非字母数字、多个链接。
  expect(parseShares(`${link}\nMovie2024\n说明`).shares).toEqual(share(""));
  expect(parseShares(`分享 ${link}\n\nw2k9`).shares).toEqual(share(""));
  expect(parseShares(`${link}\n\nw2k`).shares).toEqual(share(""));
  expect(parseShares(`${link}\n\nmovie.mkv`).shares).toEqual(share(""));
  expect(parseShares(`${link}\nhttps://mypikpak.com/s/VOsynthetic02`).shares.map(item => item.passCode)).toEqual(["", ""]);
  // 链接自带的码与单独一行的码矛盾时提示歧义。
  expect(parseShares(`${link}?pwd=abcd\n\nw2k9`).issues).toEqual(["ambiguous_code"]);
});

test("不是提取码的密码不会被当成提取码：解压、账号、保险箱与 Wi-Fi 密码，以及普通单词", () => {
  expect(parseShares(`${link}\n提取码：w2k9\n解压密码：www.example.com`).shares).toEqual(share("w2k9"));
  expect(parseShares(`${link}\n密码：w2k9\n压缩包密码：zip123`).shares).toEqual(share("w2k9"));
  expect(parseShares(`${link}\nPassword: w2k9\nUnzip password: arc123\nArchive password: arc456`).shares).toEqual(share("w2k9"));
  expect(parseShares(`${link}\nパスワード：w2k9\n解凍パスワード：arc123`).shares).toEqual(share("w2k9"));
  expect(parseShares(`${link}\n登录密码：secret12\nWi-Fi password: home1234`).shares).toEqual(share(""));
  // Vault 加密分享的“密钥”不是提取码。
  expect(parseShares(`链接：${link}\n密钥：K3yMaterial\nKey: K3yMaterial`).shares).toEqual(share(""));
  // 单词边界：MyPassword、passwords 里的 password 不是标注；没有冒号的英文单词不当成码。
  expect(parseShares(`MyPassword: abcd1234 ${link}`).shares).toEqual(share(""));
  expect(parseShares(`Password reset link ${link}`).shares).toEqual(share(""));
  expect(parseShares(`密码管理器下载 ${link} 密码：w2k9`).shares).toEqual(share("w2k9"));
  // 标注后的内容不是合法提取码时提示歧义，不猜测。
  expect(parseShares(`${link} 密码：多少？`).issues).toEqual(["ambiguous_code"]);
});
