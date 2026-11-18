import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  Course,
  CourseResource,
  LearningTrack,
  Lesson,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { ConfirmDialog } from './AdminShared.tsx';

interface AdminLearningSectionProps {
  token: string | null;
  onRefreshOverview: () => void;
}

export function AdminLearningSection({
  token,
  onRefreshOverview,
}: AdminLearningSectionProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Course Create / Edit form
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseSummary, setCourseSummary] = useState('');
  const [courseTrack, setCourseTrack] = useState<LearningTrack>('beginner');
  const [courseCategory, setCourseCategory] = useState('AI & Automation');
  const [courseIsPro, setCourseIsPro] = useState(false);
  const [courseImageUrl, setCourseImageUrl] = useState('');
  const [courseResources, setCourseResources] = useState<CourseResource[]>([]);
  const [newResTitle, setNewResTitle] = useState('');
  const [newResUrl, setNewResUrl] = useState('');

  // Selected course lessons manager
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  // Lesson Create / Edit form
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonContentMd, setLessonContentMd] = useState('');
  const [lessonDurationMins, setLessonDurationMins] = useState('12');
  const [lessonSortOrder, setLessonSortOrder] = useState('1');
  const [lessonPublished, setLessonPublished] = useState(true);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'course' | 'lesson';
    id: string;
    label: string;
  } | null>(null);

  const loadCourses = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<{ courses: Course[] }>('/api/admin/courses', undefined, token);
    if (res.ok && res.data) {
      setCourses(res.data.courses);
    } else if (res.error) {
      setFeedback(res.error);
    }
    setLoading(false);
  }, [token]);

  const loadLessons = useCallback(
    async (courseId: string) => {
      if (!token) return;
      setLoadingLessons(true);
      const res = await apiFetch<{ lessons: Lesson[] }>(
        `/api/admin/courses/${courseId}/lessons`,
        undefined,
        token
      );
      if (res.ok && res.data) {
        setLessons(res.data.lessons);
        setLessonSortOrder(String(res.data.lessons.length + 1));
      } else if (res.error) {
        setFeedback(res.error);
      }
      setLoadingLessons(false);
    },
    [token]
  );

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (activeCourseId) {
      void loadLessons(activeCourseId);
    } else {
      setLessons([]);
    }
  }, [activeCourseId, loadLessons]);

  const resetCourseForm = () => {
    setEditingCourseId(null);
    setCourseTitle('');
    setCourseSummary('');
    setCourseTrack('beginner');
    setCourseCategory('AI & Automation');
    setCourseIsPro(false);
    setCourseImageUrl('');
    setCourseResources([]);
    setNewResTitle('');
    setNewResUrl('');
  };

  const startEditCourse = (course: Course) => {
    setEditingCourseId(course.id);
    setCourseTitle(course.title);
    setCourseSummary(course.summary);
    setCourseTrack(course.track);
    setCourseCategory(course.category);
    setCourseIsPro(course.isPro);
    setCourseImageUrl(course.imageUrl ?? '');
    setCourseResources(course.resources ?? []);
  };

  const addResourceLink = () => {
    if (!newResTitle.trim() || !newResUrl.trim()) return;
    setCourseResources((prev) => [
      ...prev,
      { title: newResTitle.trim(), url: newResUrl.trim() },
    ]);
    setNewResTitle('');
    setNewResUrl('');
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setFeedback(null);

    const payload = {
      title: courseTitle,
      summary: courseSummary,
      track: courseTrack,
      category: courseCategory,
      isPro: courseIsPro,
      imageUrl: courseImageUrl.trim(),
      resources: courseResources,
    };

    const res = editingCourseId
      ? await apiFetch(
          `/api/admin/courses/${editingCourseId}`,
          { method: 'PUT', body: JSON.stringify(payload) },
          token
        )
      : await apiFetch(
          '/api/admin/courses',
          { method: 'POST', body: JSON.stringify(payload) },
          token
        );

    if (res.ok) {
      setFeedback(editingCourseId ? 'Course updated.' : 'Course created.');
      resetCourseForm();
      await loadCourses();
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Failed to save course.');
    }
    setBusy(false);
  };

  const toggleCoursePublish = async (course: Course) => {
    if (!token) return;
    const res = await apiFetch(
      `/api/admin/courses/${course.id}/publish`,
      { method: 'PATCH', body: JSON.stringify({ published: !course.published }) },
      token
    );
    if (res.ok) {
      setCourses((prev) =>
        prev.map((c) => (c.id === course.id ? { ...c, published: !course.published } : c))
      );
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Failed to toggle publish state.');
    }
  };

  const resetLessonForm = () => {
    setEditingLessonId(null);
    setLessonTitle('');
    setLessonContentMd('');
    setLessonDurationMins('12');
    setLessonSortOrder(String(lessons.length + 1));
    setLessonPublished(true);
  };

  const startEditLesson = (lesson: Lesson) => {
    setEditingLessonId(lesson.id);
    setLessonTitle(lesson.title);
    setLessonContentMd(lesson.contentMd);
    setLessonDurationMins(String(lesson.durationMins));
    setLessonSortOrder(String(lesson.sortOrder));
    setLessonPublished(lesson.published !== false);
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeCourseId) return;
    const durationNum = Number(lessonDurationMins.trim());
    const orderNum = Number(lessonSortOrder.trim());
    if (!lessonDurationMins.trim() || !Number.isInteger(durationNum) || durationNum < 1 || durationNum > 240) {
      setFeedback('Enter a lesson duration between 1 and 240 minutes.');
      return;
    }
    if (!lessonSortOrder.trim() || !Number.isInteger(orderNum) || orderNum < 1 || orderNum > 500) {
      setFeedback('Enter a lesson sort order between 1 and 500.');
      return;
    }
    setBusy(true);
    setFeedback(null);

    const res = editingLessonId
      ? await apiFetch(
          `/api/admin/lessons/${editingLessonId}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              title: lessonTitle,
              contentMd: lessonContentMd,
              durationMins: durationNum,
              sortOrder: orderNum,
              published: lessonPublished,
            }),
          },
          token
        )
      : await apiFetch(
          '/api/admin/lessons',
          {
            method: 'POST',
            body: JSON.stringify({
              courseId: activeCourseId,
              title: lessonTitle,
              contentMd: lessonContentMd,
              durationMins: durationNum,
              sortOrder: orderNum,
              published: lessonPublished,
            }),
          },
          token
        );

    if (res.ok) {
      setFeedback(editingLessonId ? 'Lesson updated.' : 'Lesson added.');
      resetLessonForm();
      await loadLessons(activeCourseId);
      await loadCourses();
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Failed to save lesson.');
    }
    setBusy(false);
  };

  const moveLesson = async (index: number, direction: -1 | 1) => {
    if (!token || !activeCourseId) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;

    const reordered = [...lessons];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const normalized = reordered.map((l, idx) => ({ ...l, sortOrder: idx + 1 }));
    setLessons(normalized);

    const res = await apiFetch(
      `/api/admin/courses/${activeCourseId}/lessons/reorder`,
      {
        method: 'POST',
        body: JSON.stringify({ lessonIds: normalized.map((l) => l.id) }),
      },
      token
    );
    if (!res.ok) {
      setFeedback(res.error ?? 'Failed to reorder lessons.');
      await loadLessons(activeCourseId);
    }
  };

  const toggleLessonPublish = async (lesson: Lesson) => {
    if (!token) return;
    const nextPub = lesson.published === false;
    const res = await apiFetch(
      `/api/admin/lessons/${lesson.id}/publish`,
      { method: 'PATCH', body: JSON.stringify({ published: nextPub }) },
      token
    );
    if (res.ok) {
      setLessons((prev) =>
        prev.map((l) => (l.id === lesson.id ? { ...l, published: nextPub } : l))
      );
      onRefreshOverview();
    }
  };

  const handleConfirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setBusy(true);
    const endpoint =
      deleteTarget.kind === 'course'
        ? `/api/admin/courses/${deleteTarget.id}`
        : `/api/admin/lessons/${deleteTarget.id}`;

    const res = await apiFetch(endpoint, { method: 'DELETE' }, token);
    if (res.ok) {
      if (deleteTarget.kind === 'course') {
        if (activeCourseId === deleteTarget.id) setActiveCourseId(null);
        await loadCourses();
      } else if (activeCourseId) {
        await loadLessons(activeCourseId);
        await loadCourses();
      }
      onRefreshOverview();
      setFeedback(`Deleted ${deleteTarget.kind} "${deleteTarget.label}".`);
      setDeleteTarget(null);
    } else {
      setFeedback(res.error ?? `Failed to delete ${deleteTarget.kind}.`);
    }
    setBusy(false);
  };

  const activeCourse = courses.find((c) => c.id === activeCourseId) ?? null;

  return (
    <div className="space-y-6">
      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      {/* Course Create / Edit Form */}
      <form
        onSubmit={(e) => void handleSaveCourse(e)}
        className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">
            {editingCourseId ? 'Edit Course' : 'Create New Course'}
          </h3>
          {editingCourseId && (
            <button
              type="button"
              onClick={resetCourseForm}
              className="text-xs text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            required
            minLength={3}
            maxLength={120}
            value={courseTitle}
            onChange={(e) => setCourseTitle(e.target.value)}
            placeholder="Course title"
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />
          <select
            value={courseTrack}
            onChange={(e) => setCourseTrack(e.target.value as LearningTrack)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          >
            <option value="beginner">Beginner Track</option>
            <option value="intermediate">Intermediate Track</option>
            <option value="advanced">Advanced Track</option>
          </select>
          <input
            required
            minLength={2}
            maxLength={60}
            value={courseCategory}
            onChange={(e) => setCourseCategory(e.target.value)}
            placeholder="Category (e.g. AI & Automation)"
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />
        </div>

        <textarea
          required
          minLength={10}
          maxLength={500}
          rows={2}
          value={courseSummary}
          onChange={(e) => setCourseSummary(e.target.value)}
          placeholder="Course summary and learning outcomes..."
          className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 text-sm"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="url"
            value={courseImageUrl}
            onChange={(e) => setCourseImageUrl(e.target.value)}
            placeholder="Optional cover image URL (https://...)"
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />

          <label className="min-h-[42px] flex items-center gap-2 text-xs px-2 cursor-pointer">
            <input
              type="checkbox"
              checked={courseIsPro}
              onChange={(e) => setCourseIsPro(e.target.checked)}
              className="h-4 w-4 accent-[var(--afrinex-accent)]"
            />
            AFRINEX Pro Course (locks lessons beyond lesson 1 for Free tier)
          </label>
        </div>

        {/* Learning Resource Links */}
        <div className="space-y-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3">
          <p className="text-xs font-medium text-[var(--afrinex-muted)]">
            Learning Resource Links (docs, repositories, reference guides)
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newResTitle}
              onChange={(e) => setNewResTitle(e.target.value)}
              placeholder="Resource title"
              className="min-h-[38px] flex-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
            />
            <input
              type="url"
              value={newResUrl}
              onChange={(e) => setNewResUrl(e.target.value)}
              placeholder="https://..."
              className="min-h-[38px] flex-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
            />
            <button
              type="button"
              onClick={addResourceLink}
              className="min-h-[38px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
            >
              Add Link
            </button>
          </div>
          {courseResources.length > 0 && (
            <div className="space-y-1 pt-1">
              {courseResources.map((res, idx) => (
                <div
                  key={`${res.url}-${idx}`}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">
                    {res.title} · <span className="font-mono text-[var(--afrinex-muted)]">{res.url}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCourseResources((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-red-600 text-[11px]"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {editingCourseId ? 'Update Course' : 'Publish New Course'}
        </button>
      </form>

      {/* Existing Courses List */}
      {loading ? (
        <p className="text-sm text-[var(--afrinex-muted)]">Loading courses...</p>
      ) : (
        <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
          {courses.map((course) => (
            <div
              key={course.id}
              className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">{course.title}</p>
                <p className="text-xs text-[var(--afrinex-muted)] capitalize tabular-nums">
                  {course.track} · {course.category} · {course.lessonCount} lessons ·{' '}
                  {course.enrollmentCount ?? 0} enrolled · {course.completionCount ?? 0} certificates ·{' '}
                  {course.published ? 'Published' : 'Unpublished'}
                  {course.isPro ? ' · Pro' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setActiveCourseId(activeCourseId === course.id ? null : course.id)
                  }
                  className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                    activeCourseId === course.id
                      ? 'border-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                      : 'border-[var(--afrinex-border)]'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Lessons ({course.lessonCount})
                </button>
                <button
                  type="button"
                  onClick={() => startEditCourse(course)}
                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void toggleCoursePublish(course)}
                  className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium"
                >
                  {course.published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDeleteTarget({ kind: 'course', id: course.id, label: course.title })
                  }
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-red-600"
                  aria-label={`Delete ${course.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Course Lesson Manager */}
      {activeCourse && (
        <section className="rounded-xl border border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-bg)] p-4 sm:p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-[var(--afrinex-accent)]">Lesson Editor</p>
              <h3 className="font-display text-base font-bold">{activeCourse.title}</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveCourseId(null);
                resetLessonForm();
              }}
              className="text-xs text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
            >
              Close Lessons
            </button>
          </div>

          <form
            onSubmit={(e) => void handleSaveLesson(e)}
            className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-display text-xs font-semibold uppercase tracking-wide">
                {editingLessonId ? 'Edit Lesson' : 'Add Lesson'}
              </h4>
              {editingLessonId && (
                <button
                  type="button"
                  onClick={resetLessonForm}
                  className="text-xs text-[var(--afrinex-muted)]"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_110px]">
              <input
                required
                minLength={3}
                maxLength={120}
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="Lesson title"
                className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
              />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={lessonDurationMins}
                onChange={(e) => setLessonDurationMins(e.target.value.replace(/\D/g, ''))}
                placeholder="Minutes"
                className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm tabular-nums"
              />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={lessonSortOrder}
                onChange={(e) => setLessonSortOrder(e.target.value.replace(/\D/g, ''))}
                placeholder="Order"
                className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm tabular-nums"
              />
            </div>

            <textarea
              required
              minLength={10}
              maxLength={12000}
              rows={4}
              value={lessonContentMd}
              onChange={(e) => setLessonContentMd(e.target.value)}
              placeholder="Lesson content (Markdown / plain text)..."
              className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={lessonPublished}
                  onChange={(e) => setLessonPublished(e.target.checked)}
                  className="h-4 w-4 accent-[var(--afrinex-accent)]"
                />
                Published to students
              </label>

              <button
                type="submit"
                disabled={busy}
                className="min-h-[40px] rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
              >
                {editingLessonId ? 'Save Lesson' : 'Add Lesson'}
              </button>
            </div>
          </form>

          {loadingLessons ? (
            <p className="text-xs text-[var(--afrinex-muted)]">Loading lessons...</p>
          ) : lessons.length === 0 ? (
            <p className="text-xs text-[var(--afrinex-muted)]">No lessons in this course yet.</p>
          ) : (
            <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)]">
              {lessons.map((lesson, idx) => (
                <div
                  key={lesson.id}
                  className="p-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <span className="font-mono text-xs text-[var(--afrinex-muted)] mr-2 tabular-nums">
                        #{lesson.sortOrder}
                      </span>
                      {lesson.title}
                    </p>
                    <p className="text-xs text-[var(--afrinex-muted)] tabular-nums">
                      {lesson.durationMins} min ·{' '}
                      {lesson.published === false ? 'Draft / Unpublished' : 'Published'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void moveLesson(idx, -1)}
                      aria-label="Move lesson up"
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === lessons.length - 1}
                      onClick={() => void moveLesson(idx, 1)}
                      aria-label="Move lesson down"
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditLesson(lesson)}
                      className="min-h-[34px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleLessonPublish(lesson)}
                      className="min-h-[34px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                    >
                      {lesson.published === false ? 'Publish' : 'Unpublish'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({ kind: 'lesson', id: lesson.id, label: lesson.title })
                      }
                      aria-label={`Delete ${lesson.title}`}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.kind === 'course' ? 'Course' : 'Lesson'}?`}
        description={`Are you sure you want to permanently delete "${deleteTarget?.label ?? ''}"? This action cannot be undone.`}
        confirmLabel="Delete Permanently"
        destructive
        busy={busy}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
