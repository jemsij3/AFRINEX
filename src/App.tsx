import { useEffect, useState } from 'react';
import {
  Bot,
  Briefcase,
  Compass,
  Cpu,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Moon,
  RefreshCw,
  Send,
  ShieldCheck,
  Sun,
  Wrench,
} from 'lucide-react';
import type { HealthCheckResponse, PlatformSectionId } from '../shared/types.ts';
import { AFRINEX_SECTIONS } from './data/platformSections.ts';
import { AdminConsole } from './features/admin/AdminConsole.tsx';
import { AssistantSection } from './features/assistant/AssistantSection.tsx';
import { BuildersSection } from './features/builders/BuildersSection.tsx';
import { DashboardSection } from './features/dashboard/DashboardSection.tsx';
import { LearningSection } from './features/learning/LearningSection.tsx';
import { OpportunitiesSection } from './features/opportunities/OpportunitiesSection.tsx';
import { TelegramServicesSection } from './features/telegram/TelegramServicesSection.tsx';
import { ToolsSection } from './features/tools/ToolsSection.tsx';
import { fetchWorkerHealth } from './lib/api.ts';
import { AuthProvider, useAuth } from './lib/auth-context.tsx';
import {
  applyTelegramThemeVariables,
  getTelegramWebApp,
  initTelegramMiniApp,
  triggerHapticSelection,
  type TelegramRuntimeContext,
} from './lib/telegram.ts';

const SECTION_ICONS: Record<Exclude<PlatformSectionId, 'hub'>, typeof MessageSquare> = {
  assistant: MessageSquare,
  builders: Bot,
  telegram: Send,
  learning: GraduationCap,
  tools: Wrench,
  opportunities: Briefcase,
  dashboard: LayoutDashboard,
  admin: ShieldCheck,
};

const BOTTOM_TABS: Array<{
  id: PlatformSectionId;
  label: string;
  icon: typeof Compass;
}> = [
  { id: 'hub', label: 'Hub', icon: Compass },
  { id: 'assistant', label: 'Assistant', icon: MessageSquare },
  { id: 'builders', label: 'Builders', icon: Bot },
  { id: 'learning', label: 'Learn', icon: GraduationCap },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

function AfrinexShell() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<PlatformSectionId>('hub');
  const [tgContext, setTgContext] = useState<TelegramRuntimeContext>(() =>
    initTelegramMiniApp()
  );
  const [isDark, setIsDark] = useState<boolean>(() => tgContext.colorScheme === 'dark');

  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;

    const handleThemeChange = () => {
      applyTelegramThemeVariables(webApp.themeParams);
      setIsDark(webApp.colorScheme === 'dark');
      setTgContext((prev) => ({
        ...prev,
        colorScheme: webApp.colorScheme,
        viewportStableHeight: webApp.viewportStableHeight || prev.viewportStableHeight,
      }));
    };

    const handleViewportChange = () => {
      setTgContext((prev) => ({
        ...prev,
        viewportStableHeight: webApp.viewportStableHeight || prev.viewportStableHeight,
      }));
    };

    webApp.onEvent('themeChanged', handleThemeChange);
    webApp.onEvent('viewportChanged', handleViewportChange);

    return () => {
      webApp.offEvent('themeChanged', handleThemeChange);
      webApp.offEvent('viewportChanged', handleViewportChange);
    };
  }, []);

  const checkHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    const result = await fetchWorkerHealth();
    if (result.ok && result.data) {
      setHealthData(result.data);
    } else {
      setHealthData(null);
      setHealthError(result.error ?? 'Worker health check unavailable');
    }
    setHealthLoading(false);
  };

  useEffect(() => {
    void checkHealth();
  }, []);

  const selectSection = (section: PlatformSectionId) => {
    triggerHapticSelection();
    setActiveSection(section);
  };

  const visibleSections = AFRINEX_SECTIONS.filter(
    (s) => s.id !== 'admin' || user?.role === 'admin'
  );

  const selectedBlueprint =
    activeSection === 'hub'
      ? null
      : AFRINEX_SECTIONS.find((item) => item.id === activeSection) ?? null;

  const desktopNavItems: PlatformSectionId[] = [
    'hub',
    'assistant',
    'builders',
    'learning',
    'opportunities',
    'dashboard',
    ...(user?.role === 'admin' ? (['admin'] as const) : []),
  ];

  return (
    <div className="min-h-[100dvh] bg-[var(--afrinex-bg)] text-[var(--afrinex-text)] flex flex-col">
      {/* Compact Sticky Top Bar: 3 zones, single-line controls, <= 52px */}
      <header className="sticky top-0 z-30 h-13 border-b border-[var(--afrinex-border)] bg-[var(--afrinex-surface)]/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => selectSection('hub')}
            className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f5e43]"
          >
            AFRINEX
          </button>

          <nav
            aria-label="Primary sections"
            className="hidden lg:flex items-center gap-6 text-sm font-medium text-[var(--afrinex-muted)]"
          >
            {desktopNavItems.map((navId) => {
              const label =
                navId === 'hub'
                  ? 'Hub'
                  : AFRINEX_SECTIONS.find((s) => s.id === navId)?.shortLabel ?? navId;
              const active = activeSection === navId;
              return (
                <button
                  key={navId}
                  type="button"
                  onClick={() => selectSection(navId)}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    active
                      ? 'border-[var(--afrinex-accent)] text-[var(--afrinex-text)]'
                      : 'border-transparent hover:text-[var(--afrinex-text)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-[var(--afrinex-text)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:pb-12">
        {activeSection === 'hub' ? (
          <div className="space-y-8">
            <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl space-y-3">
                  <p className="text-xs font-medium text-[var(--afrinex-accent)]">
                    African Roots · Global Impact
                    {user ? ` · Signed in as ${user.firstName} (${user.role})` : ''}
                  </p>
                  <h1 className="font-display text-2xl font-bold tracking-tight sm:text-4xl [text-wrap:balance]">
                    AFRINEX Digital Technology & AI Platform
                  </h1>
                  <p className="text-sm leading-relaxed text-[var(--afrinex-muted)] sm:text-base">
                    Empowering people across Africa and worldwide to learn digital skills,
                    build AI products, automate Telegram workflows, and discover global
                    opportunities.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => selectSection('dashboard')}
                    className="min-h-[44px] rounded-xl bg-[var(--afrinex-accent)] px-5 py-2.5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                  >
                    {user ? 'My Dashboard' : 'Account & Sign In'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void checkHealth()}
                    disabled={healthLoading}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`}
                    />
                    Test Worker API
                  </button>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold">
                    Telegram Mini App Runtime
                  </h2>
                  <Send className="h-4 w-4 text-[var(--afrinex-accent)]" />
                </div>
                <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--afrinex-muted)]">Environment</dt>
                    <dd className="font-medium">
                      {tgContext.inTelegram ? 'Telegram WebView' : 'Browser Preview'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--afrinex-muted)]">Platform</dt>
                    <dd className="font-mono text-xs pt-0.5">{tgContext.platform}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--afrinex-muted)]">Color Scheme</dt>
                    <dd className="font-medium capitalize">{tgContext.colorScheme}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--afrinex-muted)]">Auth Status</dt>
                    <dd className="font-medium">
                      {user ? `${user.role} · ${user.tier}` : 'Not signed in'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold">
                    Cloudflare Worker & Bindings
                  </h2>
                  <Cpu className="h-4 w-4 text-[var(--afrinex-accent)]" />
                </div>

                {healthLoading ? (
                  <p className="text-sm text-[var(--afrinex-muted)]">
                    Checking `/api/health` on Cloudflare Worker...
                  </p>
                ) : healthData ? (
                  <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    <div>
                      <dt className="text-xs text-[var(--afrinex-muted)]">Worker Status</dt>
                      <dd className="font-medium text-[var(--afrinex-accent)]">
                        Connected ({healthData.environment})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--afrinex-muted)]">D1 Database</dt>
                      <dd className="font-medium">
                        {healthData.bindings.d1 ? 'Bound & Ready' : 'Not Bound'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--afrinex-muted)]">Workers AI</dt>
                      <dd className="font-medium">
                        {healthData.bindings.workersAi ? 'Bound' : 'Not Bound'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--afrinex-muted)]">Default Model</dt>
                      <dd className="font-mono text-xs truncate pt-0.5">
                        {healthData.model}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      Local Worker not running on port 8787
                    </p>
                    <p className="text-xs leading-relaxed text-[var(--afrinex-muted)]">
                      {healthError}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-lg font-semibold sm:text-xl">
                  Core Platform Modules
                </h2>
                <span className="text-xs text-[var(--afrinex-muted)] tabular-nums">
                  {visibleSections.length} Modules Active
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleSections.map((section) => {
                  const Icon = SECTION_ICONS[section.id];
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => selectSection(section.id)}
                      className="group text-left rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 transition-colors hover:border-[var(--afrinex-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--afrinex-accent)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--afrinex-border)] text-[var(--afrinex-accent)]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-medium text-[var(--afrinex-muted)]">
                          {section.phaseTarget}
                        </span>
                      </div>

                      <h3 className="mt-4 font-display text-base font-semibold group-hover:text-[var(--afrinex-accent)] transition-colors">
                        {section.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--afrinex-muted)]">
                        {section.summary}
                      </p>

                      <div className="mt-4 pt-3 border-t border-[var(--afrinex-border)] text-xs text-[var(--afrinex-muted)] font-mono truncate">
                        {section.endpoints[0]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        ) : activeSection === 'assistant' ? (
          <AssistantSection onNavigate={selectSection} />
        ) : activeSection === 'builders' ? (
          <BuildersSection onNavigate={selectSection} />
        ) : activeSection === 'telegram' ? (
          <TelegramServicesSection onNavigate={selectSection} />
        ) : activeSection === 'learning' ? (
          <LearningSection onNavigate={selectSection} />
        ) : activeSection === 'tools' ? (
          <ToolsSection onNavigate={selectSection} />
        ) : activeSection === 'opportunities' ? (
          <OpportunitiesSection onNavigate={selectSection} />
        ) : activeSection === 'dashboard' ? (
          <DashboardSection
            workerEnvironment={healthData?.environment ?? null}
            inTelegram={tgContext.inTelegram}
            onNavigate={selectSection}
          />
        ) : activeSection === 'admin' ? (
          <AdminConsole />
        ) : (
          selectedBlueprint && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => selectSection('hub')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0"
                >
                  Back to Hub
                </button>
                <span className="text-xs font-medium text-[var(--afrinex-muted)]">
                  Scheduled for {selectedBlueprint.phaseTarget}
                </span>
              </div>

              <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-6">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--afrinex-accent)]">
                    AFRINEX Module Blueprint · {selectedBlueprint.phaseTarget}
                  </p>
                  <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    {selectedBlueprint.title}
                  </h1>
                  <p className="max-w-2xl text-sm leading-relaxed text-[var(--afrinex-muted)] sm:text-base">
                    {selectedBlueprint.summary}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2">
                    <h2 className="font-display text-sm font-semibold">
                      Planned Hono Worker Endpoints
                    </h2>
                    <ul className="space-y-1.5 font-mono text-xs text-[var(--afrinex-muted)]">
                      {selectedBlueprint.endpoints.map((ep) => (
                        <li key={ep}>{ep}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2">
                    <h2 className="font-display text-sm font-semibold">
                      D1 Schema Tables Prepared
                    </h2>
                    <ul className="space-y-1.5 font-mono text-xs text-[var(--afrinex-muted)]">
                      {selectedBlueprint.d1Tables.map((table) => (
                        <li key={table}>{table}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          )
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Thumb Zone, 60px + safe area) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--afrinex-border)] bg-[var(--afrinex-surface)]/95 backdrop-blur-md lg:hidden pb-safe"
      >
        <div className="grid h-15 grid-cols-5 items-center">
          {BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectSection(tab.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  active
                    ? 'text-[var(--afrinex-accent)]'
                    : 'text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium leading-none whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AfrinexShell />
    </AuthProvider>
  );
}
