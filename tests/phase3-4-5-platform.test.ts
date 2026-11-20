import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../worker/index.ts';
import { runScheduledMaintenance } from '../worker/lib/cronJobs.ts';
import { isEncryptedBotToken } from '../worker/lib/botTokenCrypto.ts';
import { scrubSensitiveObject, scrubSensitiveText } from '../worker/lib/monitoring.ts';
import type { WorkerBindings } from '../worker/types.ts';
import { createMigratedTestDb, createSignedTelegramInitData } from './d1-shim.ts';
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_TOOLS,
} from '../src/features/integrations/integrationsCatalog.ts';

const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_JWT_SECRET = 'test-jwt-secret-with-at-least-thirty-two-characters-here';
const TEST_TG_BOT_TOKEN = '123456789:AAHTestTelegramBotTokenForSigning123456';

function makeEnv(d1: D1Database, overrides: Partial<WorkerBindings> = {}): WorkerBindings {
  return {
    DB: d1,
    ENVIRONMENT: 'production',
    APP_BASE_URL: 'https://afrinex.example.com',
    BOT_TOKEN_ENCRYPTION_KEY: TEST_KEY_HEX,
    JWT_SECRET: TEST_JWT_SECRET,
    TELEGRAM_BOT_TOKEN: TEST_TG_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-with-at-least-thirty-two-chars',
    ADMIN_TELEGRAM_IDS: '999000111',
    AI: {
      run: async () => ({ response: 'AFRINEX structured test output.' }),
    } as unknown as Ai,
    ...overrides,
  };
}

async function loginUser(
  env: WorkerBindings,
  tgId: number,
  firstName = 'Amara'
): Promise<{ userId: string; headers: { Authorization: string } }> {
  const initData = await createSignedTelegramInitData(
    { id: tgId, first_name: firstName, username: `user_${tgId}` },
    TEST_TG_BOT_TOKEN
  );
  const res = await app.request(
    'https://afrinex.example.com/api/auth/telegram',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    },
    env
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { token: string; user: { id: string } };
  return {
    userId: body.user.id,
    headers: { Authorization: `Bearer ${body.token}` },
  };
}

describe('Phases 3, 4 & 5: Platform Expansion, Integrations, Workspace, Support & Monitoring', () => {
  it('handles unified filterable bookmarks, deduplication, and REST DELETE cleanly', async () => {
    const { d1, sqlite } = createMigratedTestDb();
    const env = makeEnv(d1);
    const member = await loginUser(env, 4001001, 'Zara');

    sqlite
      .prepare(
        `INSERT INTO ai_tools (id, name, summary, category, url, pricing_model, featured, published)
         VALUES ('tool_1', 'WorkerStudio', 'Edge compute playground', 'coding', 'https://example.com/ws', 'free', 1, 1)`
      )
      .run();

    // Toggle bookmark on -> true
    const toggleOn = await app.request(
      'https://afrinex.example.com/api/bookmarks',
      {
        method: 'POST',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: 'tool', itemId: 'tool_1' }),
      },
      env
    );
    assert.equal(toggleOn.status, 200);
    const onBody = (await toggleOn.json()) as { bookmarked: boolean };
    assert.equal(onBody.bookmarked, true);

    // Filter unified GET /api/bookmarks?type=tool
    const listTools = await app.request(
      'https://afrinex.example.com/api/bookmarks?type=tool',
      { method: 'GET', headers: member.headers },
      env
    );
    assert.equal(listTools.status, 200);
    const listBody = (await listTools.json()) as {
      bookmarks: { courses: unknown[]; tools: Array<{ id: string }>; opportunities: unknown[] };
      total: number;
    };
    assert.equal(listBody.total, 1);
    assert.equal(listBody.bookmarks.tools[0].id, 'tool_1');

    // Explicit DELETE /api/bookmarks/tool/tool_1
    const delRes = await app.request(
      'https://afrinex.example.com/api/bookmarks/tool/tool_1',
      { method: 'DELETE', headers: member.headers },
      env
    );
    assert.equal(delRes.status, 200);

    const afterList = await app.request(
      'https://afrinex.example.com/api/bookmarks',
      { method: 'GET', headers: member.headers },
      env
    );
    const afterBody = (await afterList.json()) as { total: number };
    assert.equal(afterBody.total, 0);
  });

  it('tracks opportunity applications, upcoming/overdue deadlines, and cron 48h reminders', async () => {
    const { d1, sqlite } = createMigratedTestDb();
    const env = makeEnv(d1);
    const member = await loginUser(env, 4001002, 'Chidi');

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    sqlite
      .prepare(
        `INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url, deadline, published)
         VALUES
           ('opp_due', 'Africa AI Fellowship', 'AfriLabs', 'Fellowship for builders', 'grant', 'africa', 'https://example.com/fellowship', ?, 1),
           ('opp_past', 'Early Grant Round', 'SeedFund', 'Closed round', 'grant', 'global', 'https://example.com/past', ?, 1)`
      )
      .run(tomorrow, pastDate);

    // Track both
    const trackDue = await app.request(
      'https://afrinex.example.com/api/opportunities/tracker/opp_due',
      {
        method: 'POST',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'saved', notes: 'Preparing draft proposal' }),
      },
      env
    );
    assert.equal(trackDue.status, 201);

    const trackPast = await app.request(
      'https://afrinex.example.com/api/opportunities/tracker/opp_past',
      {
        method: 'POST',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'applied', notes: 'Submitted form' }),
      },
      env
    );
    assert.equal(trackPast.status, 201);

    // Query upcoming & overdue filters
    const upcomingRes = await app.request(
      'https://afrinex.example.com/api/opportunities/tracker?deadline=upcoming',
      { method: 'GET', headers: member.headers },
      env
    );
    assert.equal(upcomingRes.status, 200);
    const upcomingData = (await upcomingRes.json()) as {
      applications: Array<{ opportunityId: string }>;
    };
    assert.equal(upcomingData.applications.length, 1);
    assert.equal(upcomingData.applications[0].opportunityId, 'opp_due');

    const overdueRes = await app.request(
      'https://afrinex.example.com/api/opportunities/tracker?deadline=overdue',
      { method: 'GET', headers: member.headers },
      env
    );
    const overdueData = (await overdueRes.json()) as {
      applications: Array<{ opportunityId: string }>;
    };
    assert.equal(overdueData.applications.length, 1);
    assert.equal(overdueData.applications[0].opportunityId, 'opp_past');

    // Cron runs -> sends 1 deduplicated deadline reminder for opp_due
    const maint1 = await runScheduledMaintenance(env);
    assert.equal(maint1.deadlineRemindersSent, 1);

    // Running cron a second time does not duplicate reminder
    const maint2 = await runScheduledMaintenance(env);
    assert.equal(maint2.deadlineRemindersSent, 0);

    // Notifications center contains the deadline reminder
    const notifRes = await app.request(
      'https://afrinex.example.com/api/notifications',
      { method: 'GET', headers: member.headers },
      env
    );
    assert.equal(notifRes.status, 200);
    const notifBody = (await notifRes.json()) as {
      notifications: Array<{ type: string; linkSection: string }>;
      unreadCount: number;
    };
    assert.ok(notifBody.unreadCount >= 1);
    assert.ok(
      notifBody.notifications.some((n) => n.type === 'opportunity' && n.linkSection === 'opportunities')
    );
  });

  it('supports builder workspace folders, favorites, duplication, versioning, restore & ownership isolation', async () => {
    const { d1 } = createMigratedTestDb();
    const env = makeEnv(d1);
    const owner = await loginUser(env, 4001003, 'Amina');
    const stranger = await loginUser(env, 4001004, 'Intruder');

    // Create project plan
    const createRes = await app.request(
      'https://afrinex.example.com/api/builders/projects',
      {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          builderType: 'website',
          name: 'Lagos Fintech Landing',
          prompt: 'Build a conversion-focused landing site for mobile payments in Lagos.',
          generationStep: 'plan',
        }),
      },
      env
    );
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { project: { id: string; status: string } };
    const projectId = created.project.id;

    // Organize folder, favorite & status
    const patchRes = await app.request(
      `https://afrinex.example.com/api/builders/projects/${projectId}`,
      {
        method: 'PATCH',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: 'Client Work',
          isFavorite: true,
          status: 'in_progress',
          name: 'Lagos Pay v2',
        }),
      },
      env
    );
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as {
      project: { folder: string; isFavorite: boolean; status: string; name: string };
    };
    assert.equal(patched.project.folder, 'Client Work');
    assert.equal(patched.project.isFavorite, true);
    assert.equal(patched.project.status, 'in_progress');

    // Create manual checkpoint snapshot
    const snapRes = await app.request(
      `https://afrinex.example.com/api/builders/projects/${projectId}/versions`,
      {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Checkpoint v2' }),
      },
      env
    );
    assert.equal(snapRes.status, 201);

    // Mutate project name
    await app.request(
      `https://afrinex.example.com/api/builders/projects/${projectId}`,
      {
        method: 'PATCH',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Broken Rename' }),
      },
      env
    );

    // List versions and restore Checkpoint v2
    const verListRes = await app.request(
      `https://afrinex.example.com/api/builders/projects/${projectId}/versions`,
      { method: 'GET', headers: owner.headers },
      env
    );
    assert.equal(verListRes.status, 200);
    const verList = (await verListRes.json()) as {
      versions: Array<{ id: string; label: string; name: string }>;
    };
    const target = verList.versions.find((v) => v.label === 'Checkpoint v2');
    assert.ok(target);

    const restoreRes = await app.request(
      `https://afrinex.example.com/api/builders/projects/${projectId}/versions/${target.id}/restore`,
      { method: 'POST', headers: owner.headers },
      env
    );
    assert.equal(restoreRes.status, 200);
    const restored = (await restoreRes.json()) as { project: { name: string } };
    assert.equal(restored.project.name, 'Lagos Pay v2');

    // Duplicate project
    const dupRes = await app.request(
      `https://afrinex.example.com/api/builders/projects/${projectId}/duplicate`,
      { method: 'POST', headers: owner.headers },
      env
    );
    assert.equal(dupRes.status, 201);
    const dupBody = (await dupRes.json()) as { project: { id: string; name: string } };
    assert.ok(dupBody.project.name.startsWith('Copy of'));

    // Stranger cannot access, snapshot, or duplicate owner's project
    const strangerGet = await app.request(
      `https://afrinex.example.com/api/builders/projects/${projectId}/versions`,
      { method: 'GET', headers: stranger.headers },
      env
    );
    assert.equal(strangerGet.status, 404);
  });

  it('encrypts integration secrets with AES-GCM, blocks SSRF URLs, masks previews, and tests live', async () => {
    const { d1, sqlite } = createMigratedTestDb();
    const env = makeEnv(d1);
    const owner = await loginUser(env, 4001005, 'Tunde');
    const stranger = await loginUser(env, 4001006, 'OtherUser');

    // Block private loopback SSRF URL on draft test & save
    const ssrfDraftRes = await app.request(
      'https://afrinex.example.com/api/integrations/test-draft',
      {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'webhook',
          endpointUrl: 'http://127.0.0.1:8080/internal',
          secretValue: 'secret-key-9999',
        }),
      },
      env
    );
    assert.equal(ssrfDraftRes.status, 400);

    const ssrfRes = await app.request(
      'https://afrinex.example.com/api/integrations',
      {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'webhook',
          name: 'Local SSRF Attempt',
          endpointUrl: 'http://127.0.0.1:8080/internal',
          secretValue: 'secret-key-9999',
        }),
      },
      env
    );
    assert.equal(ssrfRes.status, 400);

    // Valid external API credential with catalog toolId scoping
    const secretValue = 'sk-live-super-secret-token-4455';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as typeof fetch;
    try {
      const draftOkRes = await app.request(
        'https://afrinex.example.com/api/integrations/test-draft',
        {
          method: 'POST',
          headers: { ...owner.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'external_api',
            endpointUrl: 'https://api.example.com/health',
            secretValue,
          }),
        },
        env
      );
      assert.equal(draftOkRes.status, 200);
      const draftOkBody = (await draftOkRes.json()) as { ok: boolean };
      assert.equal(draftOkBody.ok, true);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const createRes = await app.request(
      'https://afrinex.example.com/api/integrations',
      {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'external_api',
          name: 'Chapa',
          endpointUrl: 'https://api.example.com/health',
          secretValue,
          config: { toolId: 'chapa', categoryId: 'finance-payments', authMode: 'apiKey' },
        }),
      },
      env
    );
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as {
      integration: {
        id: string;
        hasCredential: boolean;
        credentialPreview: string;
        config: Record<string, unknown>;
      };
    };
    assert.equal(created.integration.hasCredential, true);
    assert.equal(created.integration.credentialPreview.includes(secretValue), false);
    assert.ok(created.integration.credentialPreview.endsWith('4455'));
    assert.equal(created.integration.config.toolId, 'chapa');

    // Encrypted at rest in SQLite
    const dbRow = sqlite
      .prepare('SELECT credentials_encrypted FROM integrations WHERE id = ?')
      .get(created.integration.id) as { credentials_encrypted: string };
    assert.equal(isEncryptedBotToken(dbRow.credentials_encrypted), true);

    // Test saved connection with mocked fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as typeof fetch;
    try {
      const testRes = await app.request(
        `https://afrinex.example.com/api/integrations/${created.integration.id}/test`,
        { method: 'POST', headers: owner.headers },
        env
      );
      assert.equal(testRes.status, 200);
      const testBody = (await testRes.json()) as { ok: boolean; integration: { status: string } };
      assert.equal(testBody.ok, true);
      assert.equal(testBody.integration.status, 'connected');
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Stranger isolation
    const strangerDel = await app.request(
      `https://afrinex.example.com/api/integrations/${created.integration.id}`,
      { method: 'DELETE', headers: stranger.headers },
      env
    );
    assert.equal(strangerDel.status, 404);
  });

  it('supports support tickets, admin triage/reply with notifications, log scrubbing, and cron maintenance', async () => {
    const { d1, sqlite } = createMigratedTestDb();
    const env = makeEnv(d1);
    const member = await loginUser(env, 4001007, 'Ngozi');
    const admin = await loginUser(env, 999000111, 'Owner');

    // Member creates support ticket
    const ticketRes = await app.request(
      'https://afrinex.example.com/api/support/tickets',
      {
        method: 'POST',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'builders',
          subject: 'Need help configuring webhook endpoint',
          message: 'How do I verify my Telegram secret header on Workers?',
        }),
      },
      env
    );
    assert.equal(ticketRes.status, 201);
    const ticketBody = (await ticketRes.json()) as { ticket: { id: string; status: string } };
    assert.equal(ticketBody.ticket.status, 'open');

    // Admin replies and resolves ticket
    const replyRes = await app.request(
      `https://afrinex.example.com/api/admin/support/tickets/${ticketBody.ticket.id}`,
      {
        method: 'PATCH',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'resolved',
          adminReply: 'Check TELEGRAM_WEBHOOK_SECRET in your Worker environment bindings.',
        }),
      },
      env
    );
    assert.equal(replyRes.status, 200);

    // Member received support notification
    const notifRes = await app.request(
      'https://afrinex.example.com/api/notifications',
      { method: 'GET', headers: member.headers },
      env
    );
    const notifBody = (await notifRes.json()) as {
      notifications: Array<{ type: string; title: string }>;
    };
    assert.ok(notifBody.notifications.some((n) => n.type === 'support'));

    // Log scrubber strips sensitive tokens & credentials
    const scrubbed = scrubSensitiveText(
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret.sig failed against bot123456:AAHSecretTokenHere12345'
    );
    assert.equal(scrubbed.includes('eyJhbGciOiJIUzI1NiJ9'), false);
    assert.equal(scrubbed.includes('AAHSecretTokenHere12345'), false);

    const scrubbedObj = scrubSensitiveObject({
      credential: 'top-secret',
      safeField: 'visible',
      nested: { bot_token: '999:AAHxxx' },
    });
    assert.equal(scrubbedObj.credential, '[REDACTED]');
    assert.equal((scrubbedObj.nested as Record<string, unknown>).bot_token, '[REDACTED]');
    assert.equal(scrubbedObj.safeField, 'visible');

    // Seed expired subscription + expired nonce for cron cleanup test
    sqlite
      .prepare(`UPDATE users SET tier = 'pro', pro_expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`)
      .run(member.userId);
    sqlite
      .prepare(
        `INSERT INTO subscriptions (id, user_id, plan, status, started_at, expires_at)
         VALUES ('sub_exp_1', ?, 'pro_monthly', 'active', '2019-12-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`
      )
      .run(member.userId);
    sqlite
      .prepare(
        `INSERT INTO auth_nonces (hash, expires_at)
         VALUES ('old_nonce_hash', ?)`
      )
      .run(Math.floor(Date.now() / 1000) - 60);

    // Admin triggers maintenance cron manually via API
    const cronRes = await app.request(
      'https://afrinex.example.com/api/admin/monitoring/run-cron',
      { method: 'POST', headers: admin.headers },
      env
    );
    assert.equal(cronRes.status, 200);
    const cronBody = (await cronRes.json()) as {
      ok: boolean;
      summary: { expiredSubscriptionsUpdated: number; expiredNoncesRemoved: number };
    };
    assert.equal(cronBody.ok, true);
    assert.equal(cronBody.summary.expiredSubscriptionsUpdated, 1);
    assert.equal(cronBody.summary.expiredNoncesRemoved, 1);

    const downgraded = sqlite
      .prepare('SELECT tier FROM users WHERE id = ?')
      .get(member.userId) as { tier: string };
    assert.equal(downgraded.tier, 'free');

    // Admin extended overview & monitoring endpoints
    const [overviewRes, monitoringRes] = await Promise.all([
      app.request('https://afrinex.example.com/api/admin/overview', { headers: admin.headers }, env),
      app.request('https://afrinex.example.com/api/admin/monitoring', { headers: admin.headers }, env),
    ]);
    assert.equal(overviewRes.status, 200);
    assert.equal(monitoringRes.status, 200);
    const overviewData = (await overviewRes.json()) as {
      metrics: { metricClassification?: { confirmedD1Metrics: string[] } };
    };
    assert.ok(overviewData.metrics.metricClassification?.confirmedD1Metrics.length);
  });

  it('provides 3 samplePrompts and aboutText for every tool across all 10 integration categories', () => {
    assert.equal(INTEGRATION_CATEGORIES.length, 10);
    assert.equal(INTEGRATION_TOOLS.length, 52);

    const seenIds = new Set<string>();
    for (const category of INTEGRATION_CATEGORIES) {
      const catTools = INTEGRATION_TOOLS.filter((t) => t.categoryId === category.id);
      assert.ok(catTools.length >= 5, `Expected >= 5 tools in ${category.label}`);
    }

    for (const tool of INTEGRATION_TOOLS) {
      assert.equal(seenIds.has(tool.id), false, `Duplicate tool id: ${tool.id}`);
      seenIds.add(tool.id);
      assert.ok(tool.description.trim().length >= 15, `Missing description for ${tool.name}`);
      assert.ok(tool.aboutText.trim().length >= 30, `Missing aboutText for ${tool.name}`);
      assert.equal(tool.samplePrompts.length, 3, `Expected 3 samplePrompts for ${tool.name}`);
      for (const prompt of tool.samplePrompts) {
        assert.ok(prompt.trim().length >= 10, `Prompt too short for ${tool.name}`);
      }
    }
  });
});
