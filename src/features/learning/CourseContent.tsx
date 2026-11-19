import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import {
  copyTextToClipboard,
  isSafeExternalUrl,
  openTelegramExternalLink,
  triggerHapticSelection,
} from '../../lib/telegram.ts';

export function handleCourseExternalLinkClick(
  e: MouseEvent<HTMLAnchorElement>,
  url: string
): void {
  triggerHapticSelection();
  if (openTelegramExternalLink(url)) {
    e.preventDefault();
  }
}

interface CopyButtonProps {
  value: string;
  label?: string;
  compact?: boolean;
}

export function CopyLinkButton({ value, label = 'Copy Link', compact = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    triggerHapticSelection();
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setCopied(true);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? 'Copied link' : `Copy ${value}`}
      className={
        compact
          ? 'inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-2.5 py-1 text-xs font-medium text-[var(--afrinex-text)] hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0'
          : 'min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3.5 text-xs font-medium text-[var(--afrinex-text)] hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0'
      }
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-[var(--afrinex-accent)]" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 text-[var(--afrinex-muted)]" />
          {label}
        </>
      )}
    </button>
  );
}

interface CourseLinkCardProps {
  title?: string;
  url: string;
  openLabel?: string;
}

export function CourseLinkCard({
  title,
  url,
  openLabel = 'Open Full Course',
}: CourseLinkCardProps) {
  const safe = isSafeExternalUrl(url);
  const trimmedUrl = url.trim();

  if (!safe) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3.5 space-y-2.5">
      <div className="space-y-1 min-w-0">
        {title && (
          <a
            href={trimmedUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => handleCourseExternalLinkClick(e, trimmedUrl)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--afrinex-accent)] hover:underline"
          >
            <span>{title}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        )}
        <a
          href={trimmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => handleCourseExternalLinkClick(e, trimmedUrl)}
          className="block font-mono text-xs text-[var(--afrinex-accent)] underline underline-offset-2 break-all select-all"
        >
          {trimmedUrl}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={trimmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => handleCourseExternalLinkClick(e, trimmedUrl)}
          className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-3.5 text-xs font-medium text-[var(--afrinex-accent-text)] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
        >
          <span>{openLabel}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
        <CopyLinkButton value={trimmedUrl} label="Copy Link" />
      </div>
    </div>
  );
}

function splitUrlAndTrailingPunctuation(raw: string): { url: string; trailing: string } {
  const match = raw.match(/^(https?:\/\/[^\s<>]+?)([.,;!?]+)?$/);
  if (!match) {
    return { url: raw, trailing: '' };
  }
  return {
    url: match[1] ?? raw,
    trailing: match[2] ?? '',
  };
}

function renderInlineTokens(text: string, keyPrefix: string): ReactNode[] {
  const tokenRegex = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s<>]+)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(tokenRegex)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    const token = match[0];
    const key = `${keyPrefix}-${tokenIndex}`;
    tokenIndex += 1;

    if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const splitIdx = token.indexOf('](');
      const label = token.slice(1, splitIdx);
      const url = token.slice(splitIdx + 2, -1);
      if (isSafeExternalUrl(url)) {
        parts.push(
          <span key={key} className="inline-flex max-w-full flex-wrap items-center gap-1.5 align-baseline">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => handleCourseExternalLinkClick(e, url)}
              className="inline-flex max-w-full items-center gap-1 font-medium text-[var(--afrinex-accent)] underline underline-offset-2 break-all"
            >
              <span>{label}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            <CopyLinkButton value={url} label="Copy" compact />
          </span>
        );
      } else {
        parts.push(label);
      }
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key}
          className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (/^https?:\/\//.test(token)) {
      const { url, trailing } = splitUrlAndTrailingPunctuation(token);
      if (isSafeExternalUrl(url)) {
        parts.push(
          <span key={key} className="inline-flex max-w-full flex-wrap items-center gap-2 align-baseline">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => handleCourseExternalLinkClick(e, url)}
              className="inline-flex max-w-full items-center gap-1 font-medium text-[var(--afrinex-accent)] underline underline-offset-2 break-all select-all"
            >
              <span>{url}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            <CopyLinkButton value={url} label="Copy" compact />
            {trailing}
          </span>
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(token);
    }

    lastIndex = matchIndex + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function LessonMarkdown({ text }: { text: string }) {
  const normalized = text.replace(/\r\n/g, '\n');
  const codeSegments = normalized.split(/```([\s\S]*?)```/g);

  return (
    <div className="space-y-4 text-sm leading-relaxed text-[var(--afrinex-text)] break-words">
      {codeSegments.map((segment, segIdx) => {
        if (segIdx % 2 === 1) {
          return (
            <pre
              key={`code-${segIdx}`}
              className="overflow-x-auto rounded-xl border border-[var(--afrinex-border)] bg-black/10 p-3.5 font-mono text-xs dark:bg-white/10"
            >
              <code>{segment.replace(/^\w+\n/, '')}</code>
            </pre>
          );
        }

        const lines = segment.split('\n');
        const nodes: ReactNode[] = [];
        let i = 0;

        while (i < lines.length) {
          const line = lines[i].trim();
          if (!line) {
            i += 1;
            continue;
          }

          if (line.startsWith('### ')) {
            nodes.push(
              <h4 key={`h4-${segIdx}-${i}`} className="font-display text-sm font-semibold pt-1">
                {renderInlineTokens(line.slice(4).trim(), `h4-${segIdx}-${i}`)}
              </h4>
            );
            i += 1;
            continue;
          }

          if (line.startsWith('## ')) {
            nodes.push(
              <h3 key={`h3-${segIdx}-${i}`} className="font-display text-base font-semibold pt-1">
                {renderInlineTokens(line.slice(3).trim(), `h3-${segIdx}-${i}`)}
              </h3>
            );
            i += 1;
            continue;
          }

          if (line.startsWith('# ')) {
            nodes.push(
              <h2 key={`h2-${segIdx}-${i}`} className="font-display text-lg font-bold pt-1">
                {renderInlineTokens(line.slice(2).trim(), `h2-${segIdx}-${i}`)}
              </h2>
            );
            i += 1;
            continue;
          }

          if (/^[-*]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
              items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
              i += 1;
            }
            nodes.push(
              <ul key={`ul-${segIdx}-${i}`} className="list-disc pl-5 space-y-1.5">
                {items.map((item, idx) => (
                  <li key={`li-${idx}`}>{renderInlineTokens(item, `ul-${segIdx}-${i}-${idx}`)}</li>
                ))}
              </ul>
            );
            continue;
          }

          if (/^\d+\.\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
              items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
              i += 1;
            }
            nodes.push(
              <ol key={`ol-${segIdx}-${i}`} className="list-decimal pl-5 space-y-1.5">
                {items.map((item, idx) => (
                  <li key={`oli-${idx}`}>{renderInlineTokens(item, `ol-${segIdx}-${i}-${idx}`)}</li>
                ))}
              </ol>
            );
            continue;
          }

          if (/^https?:\/\/\S+$/.test(line) && isSafeExternalUrl(line)) {
            nodes.push(
              <CourseLinkCard key={`url-${segIdx}-${i}`} url={line} openLabel="Open Full Course" />
            );
            i += 1;
            continue;
          }

          const paraLines: string[] = [];
          while (
            i < lines.length &&
            lines[i].trim() &&
            !lines[i].trim().startsWith('#') &&
            !/^[-*]\s+/.test(lines[i].trim()) &&
            !/^\d+\.\s+/.test(lines[i].trim()) &&
            !/^https?:\/\/\S+$/.test(lines[i].trim())
          ) {
            paraLines.push(lines[i].trim());
            i += 1;
          }

          nodes.push(
            <p key={`p-${segIdx}-${i}`} className="leading-relaxed">
              {renderInlineTokens(paraLines.join(' '), `p-${segIdx}-${i}`)}
            </p>
          );
        }

        return <div key={`seg-${segIdx}`} className="space-y-3">{nodes}</div>;
      })}
    </div>
  );
}
