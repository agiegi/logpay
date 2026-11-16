// ホーム画面への追加まわり

const DISMISS_KEY = 'logpay_install_dismissed';
const AGAIN_DAYS = 30;

export type InstallEnv = 'ios-safari' | 'ios-other' | 'none';

// ホーム画面やデスクトップのアプリとして開いているか
export function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS の Safari は display-mode を返さないので, こちらも見る
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPad は Mac と名乗るので, タッチの有無で見分ける
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function detectEnv(): InstallEnv {
  if (!isIOS()) return 'none';
  // iOS の Chrome などは CriOS / FxiOS / EdgiOS と名乗る
  return /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent) ? 'ios-other' : 'ios-safari';
}

// 閉じてから AGAIN_DAYS の間は出さない
export function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw === null) return false;
    const at = Date.parse(raw);
    if (Number.isNaN(at)) return false;
    return Date.now() - at < AGAIN_DAYS * 86400000;
  } catch {
    return false;
  }
}

export function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
  } catch {
    // 保存できなくても困らない
  }
}

// 容量が足りなくなったときの退避対象から外してもらう
export async function askPersist(): Promise<void> {
  try {
    if (typeof navigator.storage === 'undefined') return;
    if (typeof navigator.storage.persist !== 'function') return;
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch {
    // 断られても何もしない
  }
}
