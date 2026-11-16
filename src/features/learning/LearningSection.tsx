import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Circle,
  Lock,
  Search,
} from 'lucide-react';
import type { Course, LearningTrack, Lesson, PlatformSectionId } from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

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
  const [track, setTrack] = useState<'all' | LearningTrack>('all');
  const [search, setSearch] = useState<string>('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [loadingCourse, setLoadingCourse] = useState<boolean>(false);
  const [updatingLessonId, setUpdatingLessonId] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (track !== 'all') params.set('track', track);
    if (search.trim()) params.set('q', search.trim());

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiFetch<{ courses: Course[] }>(`/api/courses${query}`, undefined, token);
    if (res.ok && res.data) {
      setCourses(res.data.courses);
    } else {
      setError(res.error ?? 'Failed to load courses.');
    }
    setLoading(false);
  }, [track, search, token]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  const openCourse = async (courseId: string) => {
    setLoadingCourse(true);
    setError(null);
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
    } else {
      setError(res.error ?? 'Could not update lesson progress.');
    }
    setUpdatingLessonId(null);
  };

  if (selectedCourse) {
    const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? lessons[0] ?? null;
    const completedCount = lessons.filter((l) => l.completed).length;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setSelectedCourse(null)}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            All Courses
          </button>

          <button
            type="button"
            onClick={() => void toggleCourseBookmark(selectedCourse)}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0"
          >
            <Bookmark
              className={`h-4 w-4 ${
                selectedCourse.bookmarked ? 'fill-[var(--afrinex-accent)] text-[var(--afrinex-accent)]' : ''
              }`}
            />
            {selectedCourse.bookmarked ? 'Saved' : 'Save Course'}
          </button>
        </div>

        <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--afrinex-accent)] capitalize">
              {selectedCourse.track} · {selectedCourse.category}
              {selectedCourse.isPro ? ' · AFRINEX Pro' : ''}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {selectedCourse.title}
            </h1>
            <p className="text-sm leading-relaxed text-[var(--afrinex-muted)]">
              {selectedCourse.summary}
            </p>
            <p className="text-xs text-[var(--afrinex-muted)] tabular-nums">
              {completedCount} of {lessons.length} lessons completed
            </p>
          </div>

          {error && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
          )}

          {loadingCourse ? (
            <p className="text-sm text-[var(--afrinex-muted)]">Loading lessons...</p>
          ) : lessons.length === 0 ? (
            <p className="text-sm text-[var(--afrinex-muted)]">
              No lessons published in this course yet.
            </p>
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

                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--afrinex-text)]">
                    {activeLesson.contentMd}
                  </div>
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

        {error && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-[var(--afrinex-muted)]">Loading courses...</p>
        ) : courses.length === 0 ? (
          <p className="text-sm text-[var(--afrinex-muted)]">
            No courses match your current filter.
          </p>
        ) : (
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
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
