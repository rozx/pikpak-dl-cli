import { dlopen, FFIType } from "bun:ffi";

// 把承载本程序的终端窗口带到前台（improve-intake-feedback-and-cleanup 决策 6）。尽力而为：不支持或失败时什么也不做。
export type WindowActivator = () => void;

type WindowsApi = ReturnType<typeof windowsApi>;
function windowsApi() {
  const kernel32 = dlopen("kernel32.dll", {
    GetConsoleWindow: { args: [], returns: FFIType.ptr },
    GetCurrentThreadId: { args: [], returns: FFIType.u32 },
  });
  const user32 = dlopen("user32.dll", {
    GetAncestor: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.ptr },
    GetForegroundWindow: { args: [], returns: FFIType.ptr },
    GetWindowThreadProcessId: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
    AttachThreadInput: { args: [FFIType.u32, FFIType.u32, FFIType.i32], returns: FFIType.i32 },
    IsIconic: { args: [FFIType.ptr], returns: FFIType.i32 },
    IsWindowVisible: { args: [FFIType.ptr], returns: FFIType.i32 },
    ShowWindow: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
    BringWindowToTop: { args: [FFIType.ptr], returns: FFIType.i32 },
    SetForegroundWindow: { args: [FFIType.ptr], returns: FFIType.i32 },
  });
  return { ...kernel32.symbols, ...user32.symbols };
}

const GA_ROOTOWNER = 3, SW_RESTORE = 9;
// Windows Terminal 的伪控制台窗口归属于终端的顶层窗口，传统控制台窗口的根就是它自己。
// 有些宿主（编辑器内置终端等）的伪控制台窗口不可见、也没有归属窗口：激活它只会让当前窗口失去焦点，跳过。
// 后台进程不能直接抢前台：临时把输入状态挂到当前前台线程上再设置前台窗口。
function activateWindows(api: WindowsApi): void {
  const host = api.GetConsoleWindow(); if (!host) return;
  const window = api.GetAncestor(host, GA_ROOTOWNER) || host;
  if (!api.IsWindowVisible(window)) return;
  if (api.IsIconic(window)) api.ShowWindow(window, SW_RESTORE);
  const foreground = api.GetForegroundWindow();
  if (foreground === window) return;
  const self = api.GetCurrentThreadId(), owner = foreground ? api.GetWindowThreadProcessId(foreground, null) : 0;
  const attached = owner !== 0 && owner !== self && api.AttachThreadInput(self, owner, 1) !== 0;
  try { api.BringWindowToTop(window); api.SetForegroundWindow(window); }
  finally { if (attached) api.AttachThreadInput(self, owner, 0); }
}

const spawnQuietly = (command: string[]) => { Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited.catch(() => {}); };

export function terminalActivator(platform: NodeJS.Platform = process.platform, env: Record<string, string | undefined> = process.env): WindowActivator {
  if (platform === "win32") {
    let api: WindowsApi | null | undefined;
    return () => {
      try { if (api === undefined) api = windowsApi(); if (api) activateWindows(api); } catch { api = null; }
    };
  }
  // 终端应用把自己的包标识写进子进程环境；open -b 激活该应用，不需要自动化权限。
  if (platform === "darwin") {
    const bundle = env.__CFBundleIdentifier;
    return bundle && /^[A-Za-z0-9.-]+$/.test(bundle) ? () => { try { spawnQuietly(["open", "-b", bundle]); } catch { /* 忽略。 */ } } : () => {};
  }
  // X11 终端多数设置 WINDOWID；Wayland 没有通用办法。
  if (platform === "linux") {
    const window = env.WINDOWID, xdotool = env.DISPLAY && window && /^\d+$/.test(window) ? Bun.which("xdotool") : null;
    return xdotool ? () => { try { spawnQuietly([xdotool, "windowactivate", window!]); } catch { /* 忽略。 */ } } : () => {};
  }
  return () => {};
}
