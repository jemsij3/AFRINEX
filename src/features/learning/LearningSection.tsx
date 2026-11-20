import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Bookmark,
  CheckCircle2,
  Circle,
  ExternalLink,
  Lock,
  Search,
  UserCheck,
} from 'lucide-react';
import type {
  Course,
  CourseCertificate,
  LearningTrack,
  Lesson,
  PlatformSectionId,
} from '../../../shared/types.ts';
import {
  EmptyState,
  ErrorBanner,
  PaginationBar,
  SkeletonCards,
  SkeletonList,
  useDebouncedValue,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { isSafeExternalUrl, setTelegramBackButton } from '../../lib/telegram.ts';
import {
  CopyLinkButton,
  CourseLinkCard,
  LessonMarkdown,
  handleCourseExternalLinkClick,
} from './CourseContent.tsx';

const TRACK_FILTERS: Array<{ id: 'all' | LearningTrack; label: string }> = [
  { id: 'all', label: 'All Tracks' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

interface LearningSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

export function LearningSection({ onNavigate }: LearningSectionProps) {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'courses' | 'certificates'>('courses');
  const [track, setTrack] = useState<'all' | LearningTrack>('all');
  const [search, setSearch] = useState<string>('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [loadingCourse, setLoadingCourse] = useState<boolean>(false);
  const [updatingLessonId, setUpdatingLessonId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<boolean>(false);

  const [courseCertificate, setCourseCertificate] = useState<CourseCertificate | null>(null);
  const [claimingCert, setClaimingCert] = useState<boolean>(false);

  const [certificates, setCertificates] = useState<CourseCertificate[]>([]);
  const [loadingCerts, setLoadingCerts] = useState<boolean>(false);

  useEffect(() => {
    setPage(1);
  }, [track, debouncedSearch]);

  useEffect(() => {
    if (!selectedCourse) return;
    return setTelegramBackButton(true, () => {
      setSelectedCourse(null);
      setCourseCertificate(null);
    });
  }, [selectedCourse]);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (track !== 'all') params.set('track', track);
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    params.set('page', String(page));
    params.set('per_page', '12');

    const res = await apiFetch<{
      courses: Course[];
      page?: number;
      total?: number;
      total_pages?: number;
    }>(`/api/courses?${params.toString()}`, undefined, token);
    if (res.ok && res.data) {
      setCourses(res.data.courses);
      setTotal(res.data.total ?? res.data.courses.length);
      setTotalPages(res.data.total_pages ?? 1);
    } else {
      setError(res.error ?? 'Failed to load courses.');
    }
    setLoading(false);
  }, [track, debouncedSearch, page, token]);

  const loadCertificates = useCallback(async () => {
    if (!token) {
      setCertificates([]);
      return;
    }
    setLoadingCerts(true);
    const res = await apiFetch<{ certificates: CourseCertificate[] }>(
      '/api/certificates',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setCertificates(res.data.certificates);
    } else {
      setError(res.error ?? 'Failed to load certificates.');
    }
    setLoadingCerts(false);
  }, [token]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (viewMode === 'certificates' && user && token) {
      void loadCertificates();
    }
  }, [viewMode, user, token, loadCertificates]);

  const openCourse = async (courseId: string) => {
    setLoadingCourse(true);
    setError(null);
    setCourseCertificate(null);
    const res = await apiFetch<{ course: Course; lessons: Lesson[] }>(
      `/api/courses/${courseId}`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setSelectedCourse(res.data.course);
      setLessons(res.data.lessons);
      setActiveLessonId(res.data.lessons[0]?.id ?? null);
    } else {
      setError(res.error ?? 'Unable to open course.');
    }
    setLoadingCourse(false);
  };

  const handleEnroll = async (courseId: string) => {
    if (!user || !token) {
      onNavigate('dashboard');
      return;
    }
    setEnrolling(true);
    setError(null);
    const res = await apiFetch<{ ok: boolean; enrolled: boolean }>(
      `/api/courses/${courseId}/enroll`,
      { method: 'POST' },
      token
    );
    if (res.ok) {
      setSelectedCourse((prev) => (prev ? { ...prev, enrolled: true } : prev));
      setCourses((prev) =>
        prev.map((item) => (item.id === courseId ? { ...item, enrolled: true } : item))
      );
      showToast('Enrolled in course!', 'success');
    } else {
      setError(res.error ?? 'Unable to enroll in course.');
    }
    setEnrolling(false);
  };

  const handleGetCertificate = async (courseId: string) => {
    if (!user || !token) {
      onNavigate('dashboard');
      return;
    }
    setClaimingCert(true);
    setError(null);
    const res = await apiFetch<{ certificate: CourseCertificate }>(
      `/api/courses/${courseId}/certificate`,
      undefined,
      token
    );
    if (res.ok && res.data?.certificate) {
      setCourseCertificate(res.data.certificate);
      showToast('Certificate issued!', 'success');
    } else {
      setError(res.error ?? 'Could not retrieve certificate.');
    }
    setClaimingCert(false);
  };

  const toggleCourseBookmark = async (course: Course) => {
    if (!user || !token) {
      onNavigate('dashboard');
      return;
    }

    const res = await apiFetch<{ bookmarked: boolean }>(
      '/api/bookmarks',
      {
        method: 'POST',
        body: JSON.stringify({ itemType: 'course', itemId: course.id }),
      },
      token
    );

    if (res.ok && res.data) {
      const next = res.data.bookmarked;
      setCourses((prev) =>
        prev.map((item) => (item.id === course.id ? { ...item, bookmarked: next } : item))
      );
      if (selectedCourse?.id === course.id) {
        setSelectedCourse({ ...selectedCourse, bookmarked: next });
      }
      showToast(next ? `Saved "${course.title}"` : `Removed "${course.title}" from bookmarks`, 'info');
    } else {
      showToast(res.error ?? 'Could not update bookmark.', 'error');
    }
  };

  const toggleLessonComplete = async (lesson: Lesson) => {
    if (!user || !token) {
      onNavigate('dashboard');
      return;
    }
    if (lesson.locked) return;

    setUpdatingLessonId(lesson.id);
    const nextCompleted = !lesson.completed;
    const res = await apiFetch(
      `/api/lessons/${lesson.id}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({ completed: nextCompleted }),
      },
      token
    );

    if (res.ok) {
      setLessons((prev) =>
        prev.map((item) =>
          item.id === lesson.id ? { ...item, completed: nextCompleted } : item
        )
      );
      void loadCourses();
      showToast(nextCompleted ? 'Lesson completed!' : 'Lesson marked incomplete', 'success');
    } else {
      setError(res.error ?? 'Could not update lesson progress.');
    }
    setUpdatingLessonId(null);
  };

  if (selectedCourse) {
    const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? lessons[0] ?? null;
    const completedCount = lessons.filter((l) => l.completed).length;
    const progressPct =
      lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;
    const allCompleted = lessons.length > 0 && completedCount === lessons.length;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedCourse(null);
              setCourseCertificate(null);
            }}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            All Courses
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {selectedCourse.enrolled ? (
              <span className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-accent)]/10 px-4 text-xs font-medium text-[var(--afrinex-accent)]">
                <CheckCircle2 className="h-4 w-4" />
                Enrolled
              </span>
            ) : (
              <button
                type="button"
                disabled={enrolling}
                onClick={() => void handleEnroll(selectedCourse.id)}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {enrolling ? 'Enrolling...' : 'Enroll in Course'}
              </button>
            )}

            <button
              type="button"
              onClick={() => void toggleCourseBookmark(selectedCourse)}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0"
            >
              <Bookmark
                className={`h-4 w-4 ${
                  selectedCourse.bookmarked
                    ? 'fill-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                    : ''
                }`}
              />
              {selectedCourse.bookmarked ? 'Saved' : 'Save Course'}
            </button>
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-8 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--afrinex-accent)] capitalize">
              {selectedCourse.track} · {selectedCourse.category}
              {selectedCourse.isPro ? ' · AFRINEX Pro' : ''}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {selectedCourse.title}
            </h1>
            {selectedCourse.imageUrl && (
              <div className="overflow-hidden rounded-xl border border-[var(--afrinex-border)] max-w-2xl">
                <img
                  src={selectedCourse.imageUrl}
                  alt={selectedCourse.title}
                  referrerPolicy="no-referrer"
                  className="h-44 w-full object-cover"
                />
              </div>
            )}

            <p className="text-sm leading-relaxed text-[var(--afrinex-muted)]">
              {selectedCourse.summary}
            </p>

            {selectedCourse.resources && selectedCourse.resources.length > 0 && (
              <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5 space-y-2.5 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
                  Course Resources
                </p>
                <div className="space-y-2.5">
                  {selectedCourse.resources.map((resource, idx) => (
                    <CourseLinkCard
                      key={`${resource.url}-${idx}`}
                      title={resource.title}
                      url={resource.url}
                      openLabel="Open Full Course"
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5 pt-1 max-w-md">
              <div className="flex items-center justify-between text-xs text-[var(--afrinex-muted)] tabular-nums">
                <span>
                  {completedCount} of {lessons.length} lessons completed
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className="h-full bg-[var(--afrinex-accent)] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {allCompleted && user && (
              <div className="pt-2">
                <button
                  type="button"
                  disabled={claimingCert}
                  onClick={() => void handleGetCertificate(selectedCourse.id)}
                  className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Award className="h-4 w-4" />
                  {claimingCert
                    ? 'Generating Certificate...'
                    : courseCertificate
                      ? 'Certificate Issued'
                      : 'Claim Course Certificate'}
                </button>
              </div>
            )}
          </div>

          {courseCertificate && (
            <div className="rounded-2xl border-2 border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-bg)] p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--afrinex-accent)]">
                <Award className="h-4 w-4" />
                AFRINEX Completion Certificate
              </div>
              <h2 className="font-display text-lg font-bold">
                {courseCertificate.courseTitle}
              </h2>
              <p className="text-sm text-[var(--afrinex-muted)]">
                Awarded to{' '}
                <span className="font-medium text-[var(--afrinex-text)]">
                  {courseCertificate.recipientName ||
                    `${user?.firstName ?? ''}${user?.lastName ? ` ${user.lastName}` : ''}`}
                </span>
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--afrinex-border)] text-xs text-[var(--afrinex-muted)]">
                <span className="font-mono">Code: {courseCertificate.certificateCode}</span>
                <span className="font-mono tabular-nums">
                  Issued {courseCertificate.issuedAt.slice(0, 10)}
                </span>
              </div>
            </div>
          )}

          {error && <ErrorBanner message={error} />}

          {loadingCourse ? (
            <SkeletonList rows={4} />
          ) : lessons.length === 0 ? (
            <EmptyState
              title="No lessons published yet"
              description="Check back soon as instructors publish modules for this course."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)] h-fit">
                {lessons.map((lesson, idx) => {
                  const isActive = activeLesson?.id === lesson.id;
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => setActiveLessonId(lesson.id)}
                      className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors ${
                        isActive ? 'bg-black/5 dark:bg-white/5' : ''
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-[var(--afrinex-accent)]">
                        {lesson.locked ? (
                          <Lock className="h-4 w-4 text-[var(--afrinex-muted)]" />
                        ) : lesson.completed ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4 text-[var(--afrinex-muted)]" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">
                          {idx + 1}. {lesson.title}
                        </p>
                        <p className="mt-1 text-xs text-[var(--afrinex-muted)] tabular-nums">
                          {lesson.durationMins} min
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeLesson && (
                <article className="rounded-xl border border-[var(--afrinex-border)] p-5 space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--afrinex-border)] pb-4">
                    <div>
                      <h2 className="font-display text-lg font-semibold">
                        {activeLesson.title}
                      </h2>
                      <p className="text-xs text-[var(--afrinex-muted)] tabular-nums">
                        Estimated reading time · {activeLesson.durationMins} min
                      </p>
                    </div>

                    {!activeLesson.locked && (
                      <button
                        type="button"
                        disabled={updatingLessonId === activeLesson.id}
                        onClick={() => void toggleLessonComplete(activeLesson)}
                        className={`min-h-[40px] rounded-xl px-4 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          activeLesson.completed
                            ? 'border border-[var(--afrinex-border)] text-[var(--afrinex-text)]'
                            : 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                        }`}
                      >
                        {activeLesson.completed ? 'Completed' : 'Mark Complete'}
                      </button>
                    )}
                  </div>

                  <LessonMarkdown text={activeLesson.contentMd} />

                  {!activeLesson.locked &&
                    selectedCourse.resources &&
                    selectedCourse.resources.some(
                      (res) =>
                        isSafeExternalUrl(res.url) &&
                        !activeLesson.contentMd.includes(res.url.trim())
                    ) && (
                      <div className="pt-3 border-t border-[var(--afrinex-border)] space-y-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
                          Full Course Link
                        </p>
                        <div className="space-y-2">
                          {selectedCourse.resources.map((resource, idx) =>
                            isSafeExternalUrl(resource.url) &&
                            !activeLesson.contentMd.includes(resource.url.trim()) ? (
                              <CourseLinkCard
                                key={`footer-${resource.url}-${idx}`}
                                title={resource.title}
                                url={resource.url}
                                openLabel="Open Full Course"
                              />
                            ) : null
                          )}
                        </div>
                      </div>
                    )}
                </article>
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              Learning Center
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Digital Skills & Engineering Tracks
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setViewMode('courses');
              }}
              className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'courses'
                  ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                  : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
              }`}
            >
              Courses
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setViewMode('certificates');
              }}
              className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'certificates'
                  ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                  : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              My Certificates
            </button>
          </div>
        </div>

        {viewMode === 'certificates' ? (
          !user ? (
            <div className="rounded-xl border border-[var(--afrinex-border)] p-5 space-y-3">
              <div className="flex items-start gap-3">
                <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
                <div className="space-y-1">
                  <h2 className="font-display text-base font-semibold">Sign in to view certificates</h2>
                  <p className="text-sm text-[var(--afrinex-muted)]">
                    Complete all published lessons in a course to earn your AFRINEX certificate.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="min-h-[40px] rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
              >
                Go to My Account
              </button>
            </div>
          ) : loadingCerts ? (
            <SkeletonCards count={2} />
          ) : error ? (
            <ErrorBanner message={error} onRetry={() => void loadCertificates()} />
          ) : certificates.length === 0 ? (
            <EmptyState
              title="No certificates earned yet"
              description="Complete all published lessons inside any AFRINEX course track to claim a verifiable certificate."
              actionLabel="Browse Courses"
              onAction={() => setViewMode('courses')}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {certificates.map((cert) => (
                <article
                  key={cert.id}
                  className="rounded-2xl border border-[var(--afrinex-border)] p-5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--afrinex-accent)]">
                      <Award className="h-4 w-4" />
                      Certificate Earned
                    </span>
                    <span className="font-mono text-xs text-[var(--afrinex-muted)] tabular-nums">
                      {cert.issuedAt.slice(0, 10)}
                    </span>
                  </div>
                  <h2 className="font-display text-base font-semibold">{cert.courseTitle}</h2>
                  {(cert.courseTrack || cert.courseCategory) && (
                    <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                      {[cert.courseTrack, cert.courseCategory].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="font-mono text-xs text-[var(--afrinex-muted)] break-all pt-2 border-t border-[var(--afrinex-border)]">
                    {cert.certificateCode}
                  </p>
                </article>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {TRACK_FILTERS.map((item) => {
                  const active = track === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTrack(item.id)}
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

              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search courses..."
                  className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
                />
              </div>
            </div>

            {error && <ErrorBanner message={error} onRetry={() => void loadCourses()} />}

            {loading ? (
              <SkeletonCards count={6} />
            ) : courses.length === 0 ? (
              <EmptyState
                title="No courses match your filter"
                description={
                  track === 'all' && !debouncedSearch.trim()
                    ? 'No courses are published yet.'
                    : 'Reset your track or search query to view all available courses.'
                }
                actionLabel={track !== 'all' || search.trim() ? 'Reset Filters' : undefined}
                onAction={() => {
                  setTrack('all');
                  setSearch('');
                }}
              />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {courses.map((course) => {
                    const progressPct =
                      course.lessonCount > 0
                        ? Math.round((course.completedCount / course.lessonCount) * 100)
                        : 0;
                    return (
                      <article
                        key={course.id}
                        className="flex flex-col justify-between rounded-2xl border border-[var(--afrinex-border)] p-5 space-y-4"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-[var(--afrinex-muted)] capitalize">
                              {course.track} · {course.category}
                              {course.isPro ? ' · Pro' : ''}
                              {course.enrolled ? ' · Enrolled' : ''}
                            </span>
                            <button
                              type="button"
                              aria-label={`Save ${course.title}`}
                              onClick={() => void toggleCourseBookmark(course)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                            >
                              <Bookmark
                                className={`h-4 w-4 ${
                                  course.bookmarked
                                    ? 'fill-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                                    : ''
                                }`}
                              />
                            </button>
                          </div>

                          <h2 className="font-display text-base font-semibold leading-snug">
                            {course.title}
                          </h2>
                          <p className="text-sm leading-relaxed text-[var(--afrinex-muted)]">
                            {course.summary}
                          </p>
                        </div>

                        <div className="space-y-3 pt-2">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-[var(--afrinex-muted)] tabular-nums">
                              <span>
                                {course.completedCount}/{course.lessonCount} lessons
                              </span>
                              <span>{progressPct}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                              <div
                                className="h-full bg-[var(--afrinex-accent)] transition-all"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void openCourse(course.id)}
                            className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors"
                          >
                            Open Course
                          </button>

                          {course.resources?.[0] && isSafeExternalUrl(course.resources[0].url) && (
                            <div className="space-y-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-2.5">
                              <a
                                href={course.resources[0].url.trim()}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) =>
                                  handleCourseExternalLinkClick(e, course.resources![0].url)
                                }
                                className="block font-mono text-[11px] text-[var(--afrinex-accent)] underline underline-offset-2 break-all select-all"
                              >
                                {course.resources[0].url.trim()}
                              </a>
                              <div className="flex items-center gap-2">
                                <a
                                  href={course.resources[0].url.trim()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) =>
                                    handleCourseExternalLinkClick(e, course.resources![0].url)
                                  }
                                  className="min-h-[38px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-3 text-xs font-medium text-[var(--afrinex-accent-text)] hover:opacity-90 transition-opacity whitespace-nowrap"
                                >
                                  <span>Full Course</span>
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                </a>
                                <CopyLinkButton
                                  value={course.resources[0].url}
                                  label="Copy Link"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                <PaginationBar
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  onPageChange={setPage}
                />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
