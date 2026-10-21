# Copying share text

Copy the complete text in one go, so that the link and the pass code are in the same snapshot. The example below only shows a synthetic format and points to no real resource:

```text
Link: https://mypikpak.com/s/synthetic-one
Password: demo
```

The label in front of the pass code can be `password`, `pass code`, `提取码` or `密码`. Explicitly labelled `pwd`, `password`, `passcode` or `pass_code` parameters in the link are also supported, and for a share without a pass code you can copy just the link. A missing pass code and a wrong pass code have been observed as `PASS_CODE_EMPTY` and `PASS_CODE_ERROR`. In those cases the program waits for a new complete text and does not treat them as the whole account failing.

Several shares can each take their own line or paragraph, as long as each pass code is clearly paired. A pass code after several links that cannot be told apart is never guessed; copy them separately. Look-alike domains, other PikPak pages, a pass code on its own and ordinary text do not create tasks. The raw clipboard is never written to logs or the database.

Only a receipt with a task ID means the details and the request were saved. If some shares in one copy fail to save, the confirmed shares are kept and watching retries only the unconfirmed part. The clipboard is a snapshot of its current content: copying quickly can overwrite content that has not been read yet, and the change counter cannot restore history. If you see no receipt, copy again.

Copying the same text again can trigger an incremental scan. Leaving the clipboard unchanged does not keep scanning, and remote shares are not checked for updates on a timer. A completed version that has not changed is not downloaded again automatically, even if you moved its local files away; a new version with the same name keeps the old files. After the failure budget runs out, stop watching and run `retry <task ID>` to start a new limited retry cycle. Copying the share does not reset a file's retry budget.

When you change the default folder, new shares and shares with nothing local yet use the new folder. Later files of shares that have started downloading or are completed keep using their original folder. `cancel` keeps the resources and a cancel mark; a cancelled share does not start again even if the old text is still on the clipboard.

In the full-screen interface, clipboard watching is on by default and can be turned off in Settings; when off, press `a` to paste share text. The paste box uses the same parsing rules as the clipboard. Clipboard reading is isolated in a child process, so a failure does not block downloads. macOS reads a snapshot of the system clipboard, Windows reads it through the system PowerShell, and Linux calls `wl-paste` (Wayland) or `xclip` / `xsel` (X11). Without a usable clipboard, the interface shows a watching error, and pasting still works.
