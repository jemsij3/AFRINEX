import { useCallback, useEffect, useState } from 'react';
import { Bookmark, ExternalLink, Search } from 'lucide-react';
import type { AiTool, AiToolCategory, PlatformSectionId } from '../../../shared/types.ts';
import {
  EmptyState,
  ErrorBanner,
  PaginationBar,
  SkeletonCards,
  useDebouncedValue,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { openTelegramExternalLink } from '../../lib/telegram.ts';

const TOOL_CATEGORIES: Array<{ id: 'all' | AiToolCategory; label: string }> = [
  { id: 'all', label: 'All Tools' },
  { id: 'writing', label: 'Writing' },
  { id: 'coding', label: 'Coding' },
  { id: 'design', label: 'Design' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'business', label: 'Business' },
];

interface ToolsSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

export function ToolsSection({ onNavigate }: ToolsSectionProps) {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const [category, setCategory] = useState<'all' | AiToolCategory>('all');
  const [search, setSearch] = useState<string>('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [tools, setTools] = useState<AiTool[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [category, debouncedSearch]);

  const loadTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    params.set('page', String(page));
    params.set('per_page', '12');

    const res = await apiFetch<{
      tools: AiTool[];
      page?: number;
      total?: number;
      total_pages?: number;
    }>(`/api/tools?${params.toString()}`, undefined, token);
    if (res.ok && res.data) {
      setTools(res.data.tools);
      setTotal(res.data.total ?? res.data.tools.length);
      setTotalPages(res.data.total_pages ?? 1);
    } else {
      setError(res.error ?? 'Failed to load AI tools.');
    }
    setLoading(false);
  }, [category, debouncedSearch, page, token]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const toggleBookmark = async (tool: AiTool) => {
    if (!user || !token) {
      onNavigate('dashboard');
      return;
    }

    const res = await apiFetch<{ bookmarked: boolean }>(
      '/api/bookmarks',
      {
        method: 'POST',
        body: JSON.stringify({ itemType: 'tool', itemId: tool.id }),
      },
      token
    );

    if (res.ok && res.data) {
      const next = res.data.bookmarked;
      setTools((prev) =>
        prev.map((item) => (item.id === tool.id ? { ...item, bookmarked: next } : item))
      );
      showToast(next ? `Saved ${tool.name}` : `Removed ${tool.name} from bookmarks`, 'info');
    } else {
      showToast(res.error ?? 'Could not update bookmark.', 'error');
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--afrinex-accent)]">
            AI Tools Directory
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Curated AI Tools & Frameworks
          </h1>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {TOOL_CATEGORIES.map((item) => {
          const active = category === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
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

      {error && <ErrorBanner message={error} onRetry={() => void loadTools()} />}

      {loading ? (
        <SkeletonCards count={6} />
      ) : tools.length === 0 ? (
        <EmptyState
          title="No AI tools found"
          description={
            category === 'all' && !debouncedSearch.trim()
              ? 'No published AI tools are available yet.'
              : 'Try adjusting your category filter or search terms.'
          }
          actionLabel={category !== 'all' || search.trim() ? 'Reset Filters' : undefined}
          onAction={() => {
            setCategory('all');
            setSearch('');
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <article
                key={tool.id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--afrinex-border)] p-5 space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--afrinex-muted)] capitalize">
                      {tool.category} · {tool.pricingModel}
                      {tool.featured ? ' · Featured' : ''}
                    </span>
                    <button
                      type="button"
                      aria-label={`Bookmark ${tool.name}`}
                      onClick={() => void toggleBookmark(tool)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                    >
                      <Bookmark
                        className={`h-4 w-4 ${
                          tool.bookmarked
                            ? 'fill-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                            : ''
                        }`}
                      />
                    </button>
                  </div>

                  <h2 className="font-display text-base font-semibold">{tool.name}</h2>
                  <p className="text-sm leading-relaxed text-[var(--afrinex-muted)]">
                    {tool.summary}
                  </p>
                </div>

                <a
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (openTelegramExternalLink(tool.url)) {
                      e.preventDefault();
                    }
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--afrinex-border)] text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors"
                >
                  Visit Tool
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </article>
            ))}
          </div>

          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}
