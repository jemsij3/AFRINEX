import { ArrowLeft } from 'lucide-react';
import type { PlatformSectionId } from '../../shared/types.ts';
import { BuildersSection } from '../features/builders/BuildersSection.tsx';

interface BotBuilderPageProps {
  onClose: () => void;
}

/**
 * Standalone pathname entry point for the existing AFRINEX builder workspace.
 * The feature itself continues to use the established app-state navigation and
 * builder API/schema; this page is only a direct-access shell for /builders.
 */
export function BotBuilderPage({ onClose }: BotBuilderPageProps) {
  const navigate = (_section: PlatformSectionId) => {
    onClose();
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--afrinex-bg)] text-[var(--afrinex-text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--afrinex-border)] bg-[var(--afrinex-surface)]/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--afrinex-border)] px-3 text-sm font-medium hover:border-[var(--afrinex-accent)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to AFRINEX
          </button>
          <span className="font-display text-sm font-semibold">AFRINEX Bot Builder</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <BuildersSection onNavigate={navigate} />
      </main>
    </div>
  );
}
