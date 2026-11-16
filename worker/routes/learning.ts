import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { lessonProgressSchema } from '../../shared/schemas.ts';
import type { Course, LearningTrack, Lesson } from '../../shared/types.ts';
import { optionalAuth, requireAuth } from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const learningRoutes = new Hono<AppEnv>();

interface DbCourseRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  track: LearningTrack;
  category: string;
  is_pro: number;
  published: number;
  created_at: string;
  lesson_count: number;
  completed_count: number;
  bookmarked: number;
}

interface DbLessonRow {
  id: string;
  course_id: string;
  title: string;
  content_md: string;
  duration_mins: number;
  sort_order: number;
  created_at: string;
  completed: number;
}

function mapCourse(row: DbCourseRow): Course {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    track: row.track,
    category: row.category,
    isPro: row.is_pro === 1,
    published: row.published === 1,
    lessonCount: Number(row.lesson_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    bookmarked: row.bookmarked === 1,
    createdAt: row.created_at,
  };
}

learningRoutes.get('/courses', optionalAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user');
  const track = c.req.query('track');
  const q = c.req.query('q')?.trim();

  const conditions: string[] = ['c.published = 1'];
  const params: Array<string | number> = [];

  if (track && ['beginner', 'intermediate', 'advanced'].includes(track)) {
    conditions.push('c.track = ?');
    params.push(track);
  }

  if (q) {
    conditions.push('(c.title LIKE ? OR c.summary LIKE ? OR c.category LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const userId = user?.id ?? '__anon__';
  const sql = `
    SELECT
      c.id, c.slug, c.title, c.summary, c.track, c.category, c.is_pro, c.published, c.created_at,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
      (SELECT COUNT(*) FROM lesson_progress lp
       INNER JOIN lessons l2 ON l2.id = lp.lesson_id
       WHERE l2.course_id = c.id AND lp.user_id = ?) AS completed_count,
      EXISTS(
        SELECT 1 FROM bookmarks b
        WHERE b.user_id = ? AND b.item_type = 'course' AND b.item_id = c.id
      ) AS bookmarked
    FROM courses c
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.is_pro ASC, c.created_at DESC
  `;

  const rows = await db
    .prepare(sql)
    .bind(userId, userId, ...params)
    .all<DbCourseRow>();

  return c.json({
    courses: (rows.results ?? []).map(mapCourse),
  });
});

learningRoutes.get('/courses/:id', optionalAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const courseId = c.req.param('id');
  const user = c.get('user');
  const userId = user?.id ?? '__anon__';

  const courseRow = await db
    .prepare(
      `SELECT
        c.id, c.slug, c.title, c.summary, c.track, c.category, c.is_pro, c.published, c.created_at,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
        (SELECT COUNT(*) FROM lesson_progress lp
         INNER JOIN lessons l2 ON l2.id = lp.lesson_id
         WHERE l2.course_id = c.id AND lp.user_id = ?) AS completed_count,
        EXISTS(
          SELECT 1 FROM bookmarks b
          WHERE b.user_id = ? AND b.item_type = 'course' AND b.item_id = c.id
        ) AS bookmarked
      FROM courses c
      WHERE c.id = ? AND c.published = 1`
    )
    .bind(userId, userId, courseId)
    .first<DbCourseRow>();

  if (!courseRow) {
    return c.json({ error: 'Not found', message: 'Course not found.' }, 404);
  }

  const hasProAccess = user?.tier === 'pro' || user?.role === 'admin';
  const lockedCourse = courseRow.is_pro === 1 && !hasProAccess;

  const lessonsResult = await db
    .prepare(
      `SELECT
        l.id, l.course_id, l.title, l.content_md, l.duration_mins, l.sort_order, l.created_at,
        EXISTS(
          SELECT 1 FROM lesson_progress lp
          WHERE lp.lesson_id = l.id AND lp.user_id = ?
        ) AS completed
      FROM lessons l
      WHERE l.course_id = ?
      ORDER BY l.sort_order ASC, l.created_at ASC`
    )
    .bind(userId, courseId)
    .all<DbLessonRow>();

  const lessons: Lesson[] = (lessonsResult.results ?? []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    contentMd: lockedCourse
      ? 'This lesson is part of AFRINEX Pro. Upgrade on My Dashboard to unlock full content.'
      : row.content_md,
    durationMins: row.duration_mins,
    sortOrder: row.sort_order,
    completed: row.completed === 1,
    locked: lockedCourse,
    createdAt: row.created_at,
  }));

  return c.json({
    course: mapCourse(courseRow),
    lessons,
  });
});

learningRoutes.post(
  '/lessons/:id/complete',
  requireAuth,
  zValidator('json', lessonProgressSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) {
      return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
    }

    const user = c.get('user')!;
    const lessonId = c.req.param('id');
    const { completed } = c.req.valid('json');

    const lesson = await db
      .prepare(
        `SELECT l.id, c.is_pro
         FROM lessons l
         INNER JOIN courses c ON c.id = l.course_id
         WHERE l.id = ?`
      )
      .bind(lessonId)
      .first<{ id: string; is_pro: number }>();

    if (!lesson) {
      return c.json({ error: 'Not found', message: 'Lesson not found.' }, 404);
    }

    if (lesson.is_pro === 1 && user.tier !== 'pro' && user.role !== 'admin') {
      return c.json(
        {
          error: 'Pro required',
          message: 'Upgrade to AFRINEX Pro to track progress on Pro lessons.',
        },
        403
      );
    }

    if (completed) {
      await db
        .prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)')
        .bind(user.id, lessonId)
        .run();
    } else {
      await db
        .prepare('DELETE FROM lesson_progress WHERE user_id = ? AND lesson_id = ?')
        .bind(user.id, lessonId)
        .run();
    }

    return c.json({ ok: true, lessonId, completed });
  }
);

export default learningRoutes;
