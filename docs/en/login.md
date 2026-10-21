# Signing in and authorizing again

On first launch, the full-screen interface walks you through signing in: press Enter to open the authorization page in your browser, then choose a download folder. On the command line, run `pikpak-dl-cli login`. With a valid session, it verifies the identity and quota with the server. Otherwise it opens a local sign-in page that leads to the official PikPak authorization page. You enter your password only on the official page. The authorization code comes back through a local callback. The program uses PKCE S256, a one-time state and a check of the account identity with the server, and the tokens go into the system credential store.

If the local port is in use, end the process behind an old sign-in window of this tool and try again. If the browser does not open automatically, open the local page shown in the terminal yourself. Do not paste your account password into chats, command-line arguments or configuration files. If the official page asks for extra verification, complete it on that page. The program does not bypass verification and does not retry authorization errors endlessly.

The PikPak authorization page lists each app permission. Select all of them. Account (`account`), Manage files (`files:manage`) and Shares (`share`) are required. Cloud download (`cloud_download`) is not used by this tool yet, but selecting it too is recommended. When the authorization comes back, the program first checks the scopes the server granted. If a required permission is missing, this authorization is not saved: the browser page lists the missing permissions with an "Authorize again" button, the terminal shows the same message, and sign-in keeps waiting. If the server returns no scopes, or the scopes contain no app permissions, the result is shown as "Cannot confirm" and sign-in is not blocked. Run `pikpak-dl-cli permissions` to see the scopes the server returned and how they were judged.

The first item in the full-screen interface's Settings is "Account". Press Enter to open the account page. It shows the account name, email and ID, the membership status and expiry date, the cloud quota, and whether each permission is granted. On the account page, press `r` to authorize again or `l` to sign out (asks for confirmation). Both first stop the current downloads at a safe point and save their progress. If you cancel authorizing again, press Esc to return to the original account. If the authorization saved at startup is missing required permissions, the interface asks you to authorize again; you can also press Esc to keep using it for now.

`login --force` runs the browser authorization again. The current browser flow has passed early real-world testing, so the unverified account-and-password fallback is not enabled. If a permission is refused or a refresh fails, stop `watch` first and then sign in again. Passing the identity and quota check does not guarantee that the current account can delete permanently; if a specific operation is refused, execution still pauses.

`logout` removes the authentication tokens and keeps the account's tasks, share details and downloaded files. Signing in to the same account again lets you continue. Signing in to a different account cannot run or delete the old account's resources.

The equivalent commands on Windows:

```powershell
.\pikpak-dl-cli-windows-x64.exe login
.\pikpak-dl-cli-windows-x64.exe watch --output "$env:USERPROFILE\Downloads"
.\pikpak-dl-cli-windows-x64.exe status
```

On Windows arm64, use `pikpak-dl-cli-windows-arm64.exe` from the same folder. After watching stops, `retry`, `cancel`, `config` and `logout` work the same way.

macOS uses this app's Keychain entry. Linux uses an entry of the same name in Secret Service (GNOME Keyring, KWallet and so on) through libsecret, and the keyring must be unlocked. Without a working service (for example, on a server with no graphical session), it reports that the credential store is unavailable and never falls back to plain text. On Windows, the bridge calls Credential Manager's `CredWriteW` through the system PowerShell, explicitly sets `CRED_PERSIST_LOCAL_MACHINE`, and reads back the persistence flag and the value to check them. Secrets travel only through process pipes, never on the command line or in ordinary files. Anything over 2560 UTF-8 bytes is refused rather than stored in plain text. The fields and limits follow the [Microsoft CREDENTIALW documentation](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw).

If the system credential store is unavailable or locked, a policy blocks the bridge, or the data is too long, fix that problem and try again. If a task's access details cannot be read, copy the complete text with both the link and the pass code again. This is not mistaken for a share that has expired for good, and the details of another task are never used instead. Updated details get a new reference; the old one can be reclaimed only after active scans and unknown operations are done with it.
