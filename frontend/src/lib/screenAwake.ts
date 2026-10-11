// Keeps the screen on while Culicid listens. Phones dim and lock after a minute or so, and a
// locked phone takes the mic away from the browser, so continuous listening needs the Screen
// Wake Lock (Chrome; Safari on iOS 16.4+). The browser drops the lock whenever the page is
// hidden, so `reacquireScreenLock` is called again when it comes back. No-op where unsupported.

let lock: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || typeof document === "undefined" || document.visibilityState !== "visible") return;
  if (!("wakeLock" in navigator)) return;
  try {
    const l = await navigator.wakeLock.request("screen");
    if (!wanted) {
      l.release().catch(() => {});
      return;
    }
    lock = l;
    l.addEventListener("release", () => {
      if (lock === l) lock = null;
    });
  } catch {
    lock = null; // low battery mode, or the page isn't focused: listening still works until the screen sleeps
  }
}

export function keepScreenAwake(): Promise<void> {
  wanted = true;
  return acquire();
}

export function reacquireScreenLock(): Promise<void> {
  return acquire();
}

export function allowScreenSleep() {
  wanted = false;
  lock?.release().catch(() => {});
  lock = null;
}
