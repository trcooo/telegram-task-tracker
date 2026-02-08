export type TgWebApp = {
  initData: string;
  initDataUnsafe: any;
  expand: () => void;
  ready: () => void;
  close: () => void;
  themeParams?: Record<string, string>;
};

export function getWebApp(): TgWebApp | null {
  const w = window as any;
  return w?.Telegram?.WebApp ?? null;
}

export function initTelegramUi() {
  const WebApp = getWebApp();
  if (!WebApp) return;
  WebApp.ready();
  WebApp.expand();

  const t = WebApp.themeParams || {};
  const root = document.documentElement;
  if (t.bg_color) root.style.setProperty("--tg-bg", t.bg_color);
  if (t.text_color) root.style.setProperty("--tg-text", t.text_color);
  if (t.hint_color) root.style.setProperty("--tg-hint", t.hint_color);
}

export function getInitData(): string {
  const WebApp = getWebApp();
  return WebApp?.initData || "";
}

export function haptic(type: "impact" | "success" | "warning" | "error" = "impact") {
  const w = window as any;
  const h = w?.Telegram?.WebApp?.HapticFeedback;
  if (!h) return;
  if (type === "impact") h.impactOccurred("light");
  if (type === "success") h.notificationOccurred("success");
  if (type === "warning") h.notificationOccurred("warning");
  if (type === "error") h.notificationOccurred("error");
}
