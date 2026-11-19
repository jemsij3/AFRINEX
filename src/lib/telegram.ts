export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramWebAppInstance {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    start_param?: string;
    auth_date?: number;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  ready: () => void;
  expand: () => void;
  onEvent: (eventType: string, callback: () => void) => void;
  offEvent: (eventType: string, callback: () => void) => void;
  HapticFeedback?: {
    selectionChanged: () => void;
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  openInvoice?: (
    url: string,
    callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void
  ) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebAppInstance;
    };
  }
}

export interface TelegramRuntimeContext {
  inTelegram: boolean;
  platform: string;
  version: string;
  colorScheme: 'light' | 'dark';
  viewportStableHeight: number;
  user: TelegramWebAppUser | null;
  hasInitData: boolean;
}

export function getTelegramWebApp(): TelegramWebAppInstance | null {
  if (typeof window === 'undefined') return null;
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return null;
  return webApp;
}

export function initTelegramMiniApp(): TelegramRuntimeContext {
  const webApp = getTelegramWebApp();
  const inTelegram = Boolean(webApp && (webApp.initData || webApp.platform !== 'unknown'));

  if (webApp) {
    try {
      webApp.ready();
      webApp.expand();
      applyTelegramThemeVariables(webApp.themeParams);
    } catch {
      // Ignore if running in restricted browser preview
    }
  }

  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  return {
    inTelegram,
    platform: webApp?.platform && webApp.platform !== 'unknown' ? webApp.platform : 'web',
    version: webApp?.version || '',
    colorScheme: webApp?.colorScheme ?? (prefersDark ? 'dark' : 'light'),
    viewportStableHeight:
      webApp?.viewportStableHeight ||
      (typeof window !== 'undefined' ? window.innerHeight : 0),
    user: webApp?.initDataUnsafe?.user ?? null,
    hasInitData: Boolean(webApp?.initData),
  };
}

export function applyTelegramThemeVariables(params?: TelegramThemeParams): void {
  if (!params || typeof document === 'undefined') return;
  const root = document.documentElement;
  const mapping: Array<[keyof TelegramThemeParams, string]> = [
    ['bg_color', '--tg-theme-bg-color'],
    ['secondary_bg_color', '--tg-theme-secondary-bg-color'],
    ['text_color', '--tg-theme-text-color'],
    ['hint_color', '--tg-theme-hint-color'],
    ['link_color', '--tg-theme-link-color'],
    ['button_color', '--tg-theme-button-color'],
    ['button_text_color', '--tg-theme-button-text-color'],
  ];

  for (const [key, cssVar] of mapping) {
    const val = params[key];
    if (val) {
      root.style.setProperty(cssVar, val);
    }
  }
}

export function triggerHapticSelection(): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged();
  } catch {
    // No-op outside Telegram
  }
}

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function openTelegramExternalLink(url: string): boolean {
  const trimmed = url.trim();
  if (!isSafeExternalUrl(trimmed)) return false;

  const webApp = getTelegramWebApp();
  const inTelegram = Boolean(webApp && (webApp.initData || webApp.platform !== 'unknown'));
  if (inTelegram && typeof webApp?.openLink === 'function') {
    try {
      webApp.openLink(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to execCommand below for restricted WebViews
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function openTelegramInvoice(
  invoiceUrl: string,
  onStatus: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void
): boolean {
  const webApp = getTelegramWebApp();
  if (!webApp?.openInvoice) {
    return false;
  }
  webApp.openInvoice(invoiceUrl, onStatus);
  return true;
}
