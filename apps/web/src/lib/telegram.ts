declare global {
  interface Window {
    Telegram?: any;
  }
}

export function getTelegram() {
  return window.Telegram?.WebApp;
}

export function getInitData(): string | null {
  const tg = getTelegram();
  return tg?.initData ? String(tg.initData) : null;
}

export function readyTelegram() {
  const tg = getTelegram();
  if (!tg) return;
  tg.ready();
  tg.expand?.();
  tg.setHeaderColor?.("#f8fafc");
  tg.setBackgroundColor?.("#f8fafc");
}

export function hapticImpact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
  const tg = getTelegram();
  try {
    tg?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    // ignore
  }
}

export function hapticSelection() {
  const tg = getTelegram();
  try {
    tg?.HapticFeedback?.selectionChanged?.();
  } catch {
    // ignore
  }
}
