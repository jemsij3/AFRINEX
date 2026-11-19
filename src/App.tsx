import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  Compass,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Moon,
  ShieldCheck,
  Sun,
  Wrench,
} from 'lucide-react';
import type { PlatformSectionId } from '../shared/types.ts';
import { AFRINEX_SECTIONS } from './data/platformSections.ts';
import { AdminConsole } from './features/admin/AdminConsole.tsx';
import { AssistantSection } from './features/assistant/AssistantSection.tsx';
import { BuildersSection } from './features/builders/BuildersSection.tsx';
import { DashboardSection } from './features/dashboard/DashboardSection.tsx';
import { LearningSection } from './features/learning/LearningSection.tsx';
import { OpportunitiesSection } from './features/opportunities/OpportunitiesSection.tsx';
import { ToolsSection } from './features/tools/ToolsSection.tsx';
import { AuthProvider, useAuth } from './lib/auth-context.tsx';
import {
  applyTelegramThemeVariables,
  getTelegramWebApp,
  initTelegramMiniApp,
  triggerHapticSelection,
  type TelegramRuntimeContext,
} from './lib/telegram.ts';
import { BotBuilderPage } from './pages/BotBuilderPage.tsx';
import { TelegramBotsPage } from './pages/TelegramBotsPage.tsx';

const SECTION_ICONS: Partial<Record<Exclude<PlatformSectionId, 'hub'>, typeof MessageSquare>> = {
  assistant: MessageSquare,
  builders: Bot,
  'telegram-bots': Bot,
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
  const { user, platformConfig } = useAuth();
  const [activeSection, setActiveSection] = useState<PlatformSectionId>(() =>
    window.location.pathname === '/telegram-bots' ? 'telegram-bots' : 'hub'
  );
  const [adminMemberPreview, setAdminMemberPreview] = useState<boolean>(false);
  const [isBuilderRoute, setIsBuilderRoute] = useState<boolean>(
    () => window.location.pathname === '/builders'
  );
  const [tgContext, setTgContext] = useState<TelegramRuntimeContext>(() =>
    initTelegramMiniApp()
  );
  const [isDark, setIsDark] = useState<boolean>(() => tgContext.colorScheme === 'dark');

  const isAdminUser = user?.role === 'admin';
  const brandName = platformConfig?.platformName || 'AFRINEX';
  const brandSlogan = platformConfig?.platformSlogan || 'African Roots. Global Impact.';

  useEffect(() => {
    const syncRoute = () => {
      setIsBuilderRoute(window.location.pathname === '/builders');
      if (window.location.pathname === '/telegram-bots') {
        setActiveSection('telegram-bots');
      }
    };
    const handlePopState = () => syncRoute();
    window.addEventListener('popstate', handlePopState);
    syncRoute();
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  const selectSection = (section: PlatformSectionId) => {
    triggerHapticSelection();
    if (section === 'admin') {
      setAdminMemberPreview(false);
    }
    if (section === 'dashboard' && isAdminUser) {
      setAdminMemberPreview(false);
    }
    setActiveSection(section);
    setIsBuilderRoute(false);
    if (section === 'telegram-bots') {
      if (window.location.pathname !== '/telegram-bots') {
        window.history.pushState({}, '', '/telegram-bots');
      }
    } else if (
      window.location.pathname === '/builders' ||
      window.location.pathname === '/telegram-bots'
    ) {
      window.history.pushState({}, '', '/');
    }
  };

  const openBuilderRoute = () => {
    window.history.pushState({}, '', '/builders');
    setIsBuilderRoute(true);
  };

  const closeBuilderRoute = () => {
    window.history.pushState({}, '', '/');
    setIsBuilderRoute(false);
    setActiveSection('hub');
  };

  // Ordinary members NEVER see admin navigation or admin cards
  const visibleSections = AFRINEX_SECTIONS.filter(
    (s) => s.id !== 'dashboard' && (s.id !== 'admin' || isAdminUser)
  );

  const desktopNavItems: PlatformSectionId[] = [
    'hub',
    'assistant',
    'builders',
    'telegram-bots',
    'learning',
    'tools',
    'opportunities',
    ...(isAdminUser ? (['admin'] as const) : (['dashboard'] as const)),
  ];

  if (isBuilderRoute) {
    return <BotBuilderPage onClose={closeBuilderRoute} />;
  }

  const maintenanceActive = Boolean(platformConfig?.maintenanceMode) && !isAdminUser;

  const renderDashboardView = () => {
    if (isAdminUser && !adminMemberPreview) {
      return (
        <AdminConsole
          onSwitchToMemberView={() => setAdminMemberPreview(true)}
          onNavigate={selectSection}
        />
      );
    }
    return (
      <DashboardSection
        inTelegram={tgContext.inTelegram}
        onNavigate={selectSection}
        onBackToAdmin={isAdminUser ? () => setAdminMemberPreview(false) : undefined}
      />
    );
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--afrinex-bg)] text-[var(--afrinex-text)] flex flex-col">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 h-13 border-b border-[var(--afrinex-border)] bg-[var(--afrinex-surface)]/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => selectSection('hub')}
            className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f5e43]"
          >
            {brandName}
          </button>

          <nav
            aria-label="Primary sections"
            className="hidden lg:flex items-center gap-5 text-sm font-medium text-[var(--afrinex-muted)]"
          >
            {desktopNavItems.map((navId) => {
              const label =
                navId === 'hub'
                  ? 'Hub'
                  : navId === 'admin'
                    ? 'Admin Dashboard'
                    : AFRINEX_SECTIONS.find((s) => s.id === navId)?.shortLabel ?? navId;
              const active =
                activeSection === navId ||
                (navId === 'admin' && activeSection === 'dashboard' && isAdminUser);
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
              onClick={openBuilderRoute}
              className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs font-medium text-[var(--afrinex-text)] transition-colors hover:border-[var(--afrinex-accent)]"
            >
              Bot Builder
            </button>
            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-[var(--afrinex-text)] hover:bg-black/5 dark:hover:bg-white/5"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:pb-12 space-y-6">
        {maintenanceActive && activeSection !== 'dashboard' && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Platform Maintenance Active</p>
              <p className="text-[var(--afrinex-muted)]">
                {platformConfig?.maintenanceMessage}
              </p>
            </div>
          </div>
        )}

        {activeSection === 'hub' ? (
          <div className="space-y-8">
            <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl space-y-3">
                  <p className="text-xs font-medium text-[var(--afrinex-accent)]">
                    {brandSlogan}
                    {user ? ` · Welcome, ${user.firstName}` : ''}
                  </p>
                  <h1 className="font-display text-2xl font-bold tracking-tight sm:text-4xl [text-wrap:balance]">
                    Learn. Build. Automate. Grow.
                  </h1>
                  <p className="text-sm leading-relaxed text-[var(--afrinex-muted)] sm:text-base">
                    {brandName} empowers people across Africa and worldwide to learn digital skills,
                    use AI, build technology products, automate Telegram workflows, and discover
                    global opportunities.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => selectSection('learning')}
                    className="min-h-[44px] rounded-xl bg-[var(--afrinex-accent)] px-5 py-2.5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 whitespace-nowrap"
                  >
                    Explore Learning Center
                  </button>
                  <button
                    type="button"
                    onClick={() => selectSection(isAdminUser ? 'admin' : 'dashboard')}
                    className="min-h-[44px] rounded-xl border border-[var(--afrinex-border)] px-4 py-2.5 text-sm font-medium transition-colors hover:border-[var(--afrinex-accent)] whitespace-nowrap"
                  >
                    {isAdminUser ? 'Admin Dashboard' : user ? 'My Dashboard' : 'My Account'}
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-lg font-semibold sm:text-xl">
                  {brandName} Platform
                </h2>
                <span className="text-xs text-[var(--afrinex-muted)]">{brandSlogan}</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleSections.map((section) => {
                  const Icon = SECTION_ICONS[section.id] ?? Bot;
                  const targetSection =
                    section.id === 'dashboard' && isAdminUser ? 'dashboard' : section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => {
                        if (section.id === 'dashboard' && isAdminUser) {
                          setAdminMemberPreview(true);
                        }
                        selectSection(targetSection);
                      }}
                      className="group flex flex-col justify-between text-left rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 transition-colors hover:border-[var(--afrinex-accent)]"
                    >
                      <div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--afrinex-border)] text-[var(--afrinex-accent)]">
                          <Icon className="h-5 w-5" />
                        </div>

                        <h3 className="mt-4 font-display text-base font-semibold group-hover:text-[var(--afrinex-accent)] transition-colors">
                          {section.id === 'admin' ? 'AFRINEX Admin Dashboard' : section.title}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-[var(--afrinex-muted)]">
                          {section.summary}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[var(--afrinex-border)] flex items-center justify-between text-xs font-medium text-[var(--afrinex-accent)]">
                        <span>{section.phaseTarget}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
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
        ) : activeSection === 'telegram-bots' ? (
          <TelegramBotsPage onNavigate={selectSection} />
        ) : activeSection === 'learning' ? (
          <LearningSection onNavigate={selectSection} />
        ) : activeSection === 'tools' ? (
          <ToolsSection onNavigate={selectSection} />
        ) : activeSection === 'opportunities' ? (
          <OpportunitiesSection onNavigate={selectSection} />
        ) : activeSection === 'dashboard' ? (
          renderDashboardView()
        ) : isAdminUser ? (
          <AdminConsole
            onSwitchToMemberView={() => {
              setAdminMemberPreview(true);
              setActiveSection('dashboard');
            }}
            onNavigate={selectSection}
          />
        ) : (
          <DashboardSection inTelegram={tgContext.inTelegram} onNavigate={selectSection} />
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
            const isDashTab = tab.id === 'dashboard';
            const active =
              activeSection === tab.id || (isDashTab && activeSection === 'admin');
            const label = isDashTab && isAdminUser ? 'Admin' : tab.label;
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
                {isDashTab && isAdminUser ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                <span className="text-[11px] font-medium leading-none whitespace-nowrap">
                  {label}
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
