import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { lessonProgressSchema } from '../../shared/schemas.ts';
import type {
  Course,
  CourseCertificate,
  CourseProgressResponse,
  CourseResource,
  LearningTrack,
  Lesson,
} from '../../shared/types.ts';
import { getAppSettings } from '../lib/settings.ts';
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
  image_url?: string | null;
  resources_json?: string | null;
  created_at: string;
  lesson_count: number;
  completed_count: number;
  bookmarked: number;
  enrolled?: number;
}

interface DbLessonRow {
  id: string;
  course_id: string;
  title: string;
  content_md: string;
  duration_mins: number;
  sort_order: number;
  published: number;
  created_at: string;
  completed: number;
}

interface DbCertificateRow {
  id: string;
  user_id: string;
  course_id: string;
  certificate_code: string;
  issued_at: string;
  course_title: string;
  course_track?: LearningTrack;
  course_category?: string;
}

function parseResources(raw: string | null | undefined): CourseResource[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CourseResource =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as CourseResource).title === 'string' &&
        typeof (item as CourseResource).url === 'string'
    );
  } catch {
    return [];
  }
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
    imageUrl: row.image_url ?? null,
    resources: parseResources(row.resources_json),
    lessonCount: Number(row.lesson_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    bookmarked: row.bookmarked === 1,
    enrolled: row.enrolled === 1,
    createdAt: row.created_at,
  };
}

learningRoutes.get('/courses', optionalAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user');
  const settings = await getAppSettings(db);
  if (!settings.featureLearningEnabled && user?.role !== 'admin') {
    return c.json(
      { error: 'Feature disabled', message: 'Learning Center is temporarily disabled.' },
      503
    );
  }
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
      c.id, c.slug, c.title, c.summary, c.track, c.category, c.is_pro, c.published, c.image_url, c.resources_json, c.created_at,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS lesson_count,
      (SELECT COUNT(*) FROM lesson_progress lp
       INNER JOIN lessons l2 ON l2.id = lp.lesson_id
       WHERE l2.course_id = c.id AND l2.published = 1 AND lp.user_id = ?) AS completed_count,
      EXISTS(
        SELECT 1 FROM bookmarks b
        WHERE b.user_id = ? AND b.item_type = 'course' AND b.item_id = c.id
      ) AS bookmarked,
      EXISTS(
        SELECT 1 FROM course_enrollments e
        WHERE e.user_id = ? AND e.course_id = c.id
      ) AS enrolled
    FROM courses c
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.is_pro ASC, c.created_at DESC
  `;

  const rows = await db
    .prepare(sql)
    .bind(userId, userId, userId, ...params)
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
        c.id, c.slug, c.title, c.summary, c.track, c.category, c.is_pro, c.published, c.image_url, c.resources_json, c.created_at,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS lesson_count,
        (SELECT COUNT(*) FROM lesson_progress lp
         INNER JOIN lessons l2 ON l2.id = lp.lesson_id
         WHERE l2.course_id = c.id AND l2.published = 1 AND lp.user_id = ?) AS completed_count,
        EXISTS(
          SELECT 1 FROM bookmarks b
          WHERE b.user_id = ? AND b.item_type = 'course' AND b.item_id = c.id
        ) AS bookmarked,
        EXISTS(
          SELECT 1 FROM course_enrollments e
          WHERE e.user_id = ? AND e.course_id = c.id
        ) AS enrolled
      FROM courses c
      WHERE c.id = ? AND c.published = 1`
    )
    .bind(userId, userId, userId, courseId)
    .first<DbCourseRow>();

  if (!courseRow) {
    return c.json({ error: 'Not found', message: 'Course not found.' }, 404);
  }

  const hasProAccess = user?.tier === 'pro' || user?.role === 'admin';
  const lockedCourse = courseRow.is_pro === 1 && !hasProAccess;

  const lessonsResult = await db
    .prepare(
      `SELECT
        l.id, l.course_id, l.title, l.content_md, l.duration_mins, l.sort_order, l.published, l.created_at,
        EXISTS(
          SELECT 1 FROM lesson_progress lp
          WHERE lp.lesson_id = l.id AND lp.user_id = ?
        ) AS completed
      FROM lessons l
      WHERE l.course_id = ? AND l.published = 1
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
    published: row.published === 1,
    completed: row.completed === 1,
    locked: lockedCourse,
    createdAt: row.created_at,
  }));

  return c.json({
    course: mapCourse(courseRow),
    lessons,
  });
});

learningRoutes.post('/courses/:id/enroll', requireAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user')!;
  const courseId = c.req.param('id');

  const course = await db
    .prepare('SELECT id, is_pro FROM courses WHERE id = ? AND published = 1')
    .bind(courseId)
    .first<{ id: string; is_pro: number }>();

  if (!course) {
    return c.json({ error: 'Not found', message: 'Course not found.' }, 404);
  }

  if (course.is_pro === 1 && user.tier !== 'pro' && user.role !== 'admin') {
    return c.json(
      {
        error: 'Pro required',
        message: 'Upgrade to AFRINEX Pro to enroll in this course.',
      },
      403
    );
  }

  const enrollmentId = `enr_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await db
    .prepare(
      'INSERT OR IGNORE INTO course_enrollments (id, user_id, course_id) VALUES (?, ?, ?)'
    )
    .bind(enrollmentId, user.id, courseId)
    .run();

  return c.json({ ok: true, enrolled: true, courseId });
});

learningRoutes.get('/courses/:id/progress', requireAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user')!;
  const courseId = c.req.param('id');

  const course = await db
    .prepare('SELECT id FROM courses WHERE id = ? AND published = 1')
    .bind(courseId)
    .first<{ id: string }>();

  if (!course) {
    return c.json({ error: 'Not found', message: 'Course not found.' }, 404);
  }

  const [lessonRows, enrollmentRow] = await Promise.all([
    db
      .prepare(
        `SELECT
          l.id,
          EXISTS(
            SELECT 1 FROM lesson_progress lp
            WHERE lp.lesson_id = l.id AND lp.user_id = ?
          ) AS completed
        FROM lessons l
        WHERE l.course_id = ? AND l.published = 1
        ORDER BY l.sort_order ASC`
      )
      .bind(user.id, courseId)
      .all<{ id: string; completed: number }>(),
    db
      .prepare('SELECT id FROM course_enrollments WHERE user_id = ? AND course_id = ?')
      .bind(user.id, courseId)
      .first<{ id: string }>(),
  ]);

  const rows = lessonRows.results ?? [];
  const completedLessonIds = rows.filter((r) => r.completed === 1).map((r) => r.id);
  const totalLessons = rows.length;
  const completedLessons = completedLessonIds.length;
  const percentComplete =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const payload: CourseProgressResponse = {
    courseId,
    enrolled: Boolean(enrollmentRow),
    completedLessons,
    totalLessons,
    percentComplete,
    completedLessonIds,
  };

  return c.json(payload);
});

learningRoutes.get('/courses/:id/certificate', requireAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user')!;
  const courseId = c.req.param('id');

  const course = await db
    .prepare('SELECT id, title, track, category FROM courses WHERE id = ? AND published = 1')
    .bind(courseId)
    .first<{ id: string; title: string; track: LearningTrack; category: string }>();

  if (!course) {
    return c.json({ error: 'Not found', message: 'Course not found.' }, 404);
  }

  const recipientName = `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`;

  const existing = await db
    .prepare(
      `SELECT cert.id, cert.user_id, cert.course_id, cert.certificate_code, cert.issued_at,
              c.title AS course_title, c.track AS course_track, c.category AS course_category
       FROM certificates cert
       INNER JOIN courses c ON c.id = cert.course_id
       WHERE cert.user_id = ? AND cert.course_id = ?`
    )
    .bind(user.id, courseId)
    .first<DbCertificateRow>();

  if (existing) {
    const certificate: CourseCertificate = {
      id: existing.id,
      userId: existing.user_id,
      courseId: existing.course_id,
      courseTitle: existing.course_title,
      courseTrack: existing.course_track,
      courseCategory: existing.course_category,
      recipientName,
      certificateCode: existing.certificate_code,
      issuedAt: existing.issued_at,
    };
    return c.json({ certificate });
  }

  const counts = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = ? AND l.published = 1) AS total_lessons,
        (SELECT COUNT(*) FROM lesson_progress lp
         INNER JOIN lessons l2 ON l2.id = lp.lesson_id
         WHERE l2.course_id = ? AND l2.published = 1 AND lp.user_id = ?) AS completed_lessons`
    )
    .bind(courseId, courseId, user.id)
    .first<{ total_lessons: number; completed_lessons: number }>();

  const totalLessons = Number(counts?.total_lessons ?? 0);
  const completedLessons = Number(counts?.completed_lessons ?? 0);

  if (totalLessons === 0 || completedLessons < totalLessons) {
    return c.json(
      {
        error: 'Course incomplete',
        message: 'Complete all published lessons in this course to earn a certificate.',
      },
      400
    );
  }

  const certId = `cert_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const certificateCode = `AFRINEX-${courseId}-${user.id}-${Date.now()}`;

  await db
    .prepare(
      'INSERT OR IGNORE INTO certificates (id, user_id, course_id, certificate_code) VALUES (?, ?, ?, ?)'
    )
    .bind(certId, user.id, courseId, certificateCode)
    .run();

  const created = await db
    .prepare(
      `SELECT cert.id, cert.user_id, cert.course_id, cert.certificate_code, cert.issued_at,
              c.title AS course_title, c.track AS course_track, c.category AS course_category
       FROM certificates cert
       INNER JOIN courses c ON c.id = cert.course_id
       WHERE cert.user_id = ? AND cert.course_id = ?`
    )
    .bind(user.id, courseId)
    .first<DbCertificateRow>();

  if (!created) {
    return c.json({ error: 'Database error', message: 'Could not issue certificate.' }, 500);
  }

  const certificate: CourseCertificate = {
    id: created.id,
    userId: created.user_id,
    courseId: created.course_id,
    courseTitle: created.course_title,
    courseTrack: created.course_track,
    courseCategory: created.course_category,
    recipientName,
    certificateCode: created.certificate_code,
    issuedAt: created.issued_at,
  };

  return c.json({ certificate }, 201);
});

learningRoutes.get('/certificates', requireAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user')!;
  const recipientName = `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`;

  const rows = await db
    .prepare(
      `SELECT cert.id, cert.user_id, cert.course_id, cert.certificate_code, cert.issued_at,
              c.title AS course_title, c.track AS course_track, c.category AS course_category
       FROM certificates cert
       INNER JOIN courses c ON c.id = cert.course_id
       WHERE cert.user_id = ?
       ORDER BY cert.issued_at DESC`
    )
    .bind(user.id)
    .all<DbCertificateRow>();

  const certificates: CourseCertificate[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    courseTrack: row.course_track,
    courseCategory: row.course_category,
    recipientName,
    certificateCode: row.certificate_code,
    issuedAt: row.issued_at,
  }));

  return c.json({ certificates });
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
         WHERE l.id = ? AND l.published = 1 AND c.published = 1`
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
