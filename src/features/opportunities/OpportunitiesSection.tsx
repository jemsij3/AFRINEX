import { useCallback, useEffect, useState } from 'react';
import { Bookmark, ExternalLink, Search } from 'lucide-react';
import type {
  Opportunity,
  OpportunityRegion,
  OpportunityType,
  PlatformSectionId,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

const TYPE_FILTERS: Array<{ id: 'all' | OpportunityType; label: string }> = [
  { id: 'all', label: 'All Types' },
  { id: 'job', label: 'Jobs' },
  { id: 'freelance', label: 'Freelance' },
  { id: 'scholarship', label: 'Scholarships' },
  { id: 'grant', label: 'Grants' },
  { id: 'event', label: 'Events' },
];

const REGION_FILTERS: Array<{ id: 'all' | OpportunityRegion; label: string }> = [
  { id: 'all', label: 'All Regions' },
  { id: 'africa', label: 'Africa' },
  { id: 'remote', label: 'Remote' },
  { id: 'global', label: 'Global' },
];

interface OpportunitiesSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

export function OpportunitiesSection({ onNavigate }: OpportunitiesSectionProps) {
  const { user, token } = useAuth();
  const [oppType, setOppType] = useState<'all' | OpportunityType>('all');
  const [region, setRegion] = useState<'all' | OpportunityRegion>('all');
  const [search, setSearch] = useState<string>('');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (oppType !== 'all') params.set('type', oppType);
    if (region !== 'all') params.set('region', region);
    if (search.trim()) params.set('q', search.trim());

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiFetch<{ opportunities: Opportunity[] }>(
      `/api/opportunities${query}`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setOpportunities(res.data.opportunities);
    } else {
      setError(res.error ?? 'Failed to load opportunities.');
    }
    setLoading(false);
  }, [oppType, region, search, token]);

  useEffect(() => {
    void loadOpportunities();
  }, [loadOpportunities]);

  const toggleBookmark = async (opp: Opportunity) => {
    if (!user || !token) {
      onNavigate('dashboard');
      return;
    }

    const res = await apiFetch<{ bookmarked: boolean }>(
      '/api/bookmarks',
      {
        method: 'POST',
        body: JSON.stringify({ itemType: 'opportunity', itemId: opp.id }),
      },
      token
    );

    if (res.ok && res.data) {
      const next = res.data.bookmarked;
      setOpportunities((prev) =>
        prev.map((item) => (item.id === opp.id ? { ...item, bookmarked: next } : item))
      );
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--afrinex-accent)]">
            Global & African Opportunities
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Jobs, Grants, Scholarships & Events
          </h1>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opportunities..."
            className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {TYPE_FILTERS.map((item) => {
            const active = oppType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setOppType(item.id)}
                className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                    : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {REGION_FILTERS.map((item) => {
            const active = region === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRegion(item.id)}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-black/10 dark:bg-white/15 text-[var(--afrinex-text)]'
                    : 'text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-[var(--afrinex-muted)]">Loading opportunities...</p>
      ) : opportunities.length === 0 ? (
        <p className="text-sm text-[var(--afrinex-muted)]">
          No opportunities match your filter.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {opportunities.map((opp) => (
            <article
              key={opp.id}
              className="flex flex-col justify-between rounded-2xl border border-[var(--afrinex-border)] p-5 space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--afrinex-muted)] capitalize">
                    {opp.opportunityType} · {opp.region}
                    {opp.deadline ? ` · Due ${opp.deadline}` : ''}
                  </span>
                  <button
                    type="button"
                    aria-label={`Bookmark ${opp.title}`}
                    onClick={() => void toggleBookmark(opp)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                  >
                    <Bookmark
                      className={`h-4 w-4 ${
                        opp.bookmarked
                          ? 'fill-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                          : ''
                      }`}
                    />
                  </button>
                </div>

                <h2 className="font-display text-base font-semibold">{opp.title}</h2>
                <p className="text-xs font-medium text-[var(--afrinex-accent)]">
                  {opp.organization}
                </p>
                <p className="text-sm leading-relaxed text-[var(--afrinex-muted)]">
                  {opp.summary}
                </p>
              </div>

              <a
                href={opp.url}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--afrinex-border)] text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors"
              >
                View Opportunity
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
