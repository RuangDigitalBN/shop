import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, imports, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Request, Response, URL, TextDecoder, AbortSignal,
    require: name => { assert.ok(name in imports, name); return imports[name]; }, ...globals });
  return exports;
}
const helpers = load('src/lib/customer-requests.ts', {});
const key = '12345678-1234-4234-8234-123456789abc';
const id = '22345678-1234-4234-8234-123456789abc';
const game = { submission_key: key, request_type: 'game_request', game_name: ' New Game ', requested_item: ' Diamonds ', message: ' Please add it ', contact: ' 12345678 ', website: '' };
const feedback = { submission_key: key, request_type: 'feedback', feedback_category: 'Checkout', message: 'Useful feedback' };
const plain = value => JSON.parse(JSON.stringify(value));

test('validation trims text, selects only relevant fields, and never accepts client status/identity', () => {
  const result = helpers.validateCustomerRequest({ ...game, status: 'added', id, created_at: 'spoofed', feedback_category: 'Other' });
  assert.deepEqual(plain(result.errors), {});
  assert.deepEqual(plain(result.data), { submission_key: key, request_type: 'game_request', game_name: 'New Game', requested_item: 'Diamonds', feedback_category: null, message: 'Please add it', contact: '12345678' });
  const minimal = helpers.validateCustomerRequest({ ...game, requested_item: '', message: '', contact: '' }).data;
  assert.equal(minimal.message, null); assert.equal(minimal.contact, null);
  const f = helpers.validateCustomerRequest({ ...feedback, game_name: 'stale hidden value', requested_item: 'stale' }).data;
  assert.equal(f.game_name, null); assert.equal(f.requested_item, null); assert.equal(f.feedback_category, 'Checkout');
});

test('validation rejects missing fields, wrong types, excessive lengths, HTML and control characters', () => {
  for (const input of [null, [], {}, { ...game, game_name: ' ' }, { ...game, game_name: 3 },
    { ...game, submission_key: 'bad' }, { ...game, request_type: 'other' },
    { ...feedback, message: '' }, { ...feedback, feedback_category: 'bad' },
    { ...game, game_name: 'x'.repeat(121) }, { ...game, requested_item: 'x'.repeat(161) },
    { ...game, contact: 'x'.repeat(121) }, { ...game, message: 'x'.repeat(2001) },
    { ...game, message: '<script>alert(1)</script>' }, { ...game, contact: 'a\nb' }, { ...game, message: 'a\u0000b' }]) {
    assert.equal(helpers.validateCustomerRequest(input).data, undefined);
  }
  assert.ok(helpers.validateCustomerRequest({ ...game, message: 'Plain text\nsecond line\tokay' }).data);
});

function api(options = {}) {
  const writes = [], jobs = [], sent = [], logs = []; let now = 1_000_000;
  const notify = load('src/lib/telegram-requests.ts', { 'server-only': {} }, {
    process: { env: options.missingConfig ? {} : { TELEGRAM_BOT_TOKEN: 'secret-token', TELEGRAM_CHAT_ID: 'secret-chat' } },
    console: { error: (...values) => logs.push(values) },
    fetch: async (url, init) => {
      sent.push({ url, init });
      if (options.fetchError) throw new Error('secret-token private-contact');
      if (options.invalidJson) return new Response('private-response', { status: 200 });
      return Response.json({ ok: !options.apiError }, { status: options.httpError ? 500 : 200 });
    },
  });
  const route = load('src/app/api/requests/route.ts', {
    'node:crypto': crypto,
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) }, after: callback => { if (options.scheduleError) throw new Error('schedule failed'); jobs.push(callback); } },
    '@/lib/supabase-admin': { supabaseAdmin: { from(table) {
      assert.equal(table, 'customer_requests'); let payload;
      return { insert(value) { payload = value; return this; }, select: function () { return this; },
        async single() {
          writes.push(payload);
          return { data: options.noConfirmation ? null : { id, created_at: '2026-11-20T08:00:00Z' }, error: options.dbError ? { code: options.dbError, message: 'private-db-error' } : null };
        } };
    } } },
    '@/lib/customer-requests': helpers, '@/lib/telegram-requests': notify,
  }, { console: { error: (...values) => logs.push(values) }, Date: { now: () => now } });
  const post = (body = game, headers = {}) => route.POST(new Request('https://store.example/api/requests', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { post, writes, jobs, sent, logs, advance: () => { now += 600_001; } };
}

test('anonymous submission saves without a login, returns no request data and notifies only after save', async () => {
  const h = api(); const response = await h.post({ ...game, status: 'added' });
  assert.equal(response.status, 202); assert.deepEqual(await response.json(), { success: true });
  assert.equal(h.writes.length, 1); assert.equal('status' in h.writes[0], false); assert.equal('id' in h.writes[0], false);
  assert.equal(h.jobs.length, 1); assert.equal(h.sent.length, 0);
  await h.jobs[0](); assert.equal(h.sent.length, 1);
  const payload = JSON.parse(h.sent[0].init.body);
  assert.match(payload.text, /New Ruang Digital game request/); assert.match(payload.text, /Game: New Game/);
  assert.equal('parse_mode' in payload, false); assert.equal(payload.link_preview_options.is_disabled, true);
  assert.equal(h.sent[0].init.redirect, 'manual');
});

test('feedback uses its category; Telegram text is bounded and user newlines cannot inject labels', async () => {
  const h = api(); assert.equal((await h.post({ ...feedback, message: 'hello\nInjected: yes ' + 'x'.repeat(1950) })).status, 202);
  await h.jobs[0](); const text = JSON.parse(h.sent[0].init.body).text;
  assert.match(text, /Category: Checkout/); assert.ok(!text.includes('\nInjected:')); assert.ok(text.length < 1500);
});

for (const option of ['fetchError', 'httpError', 'apiError', 'invalidJson', 'missingConfig', 'scheduleError']) {
  test(`${option}: Telegram failure preserves a successful saved submission and logs no secrets/text`, async () => {
    const h = api({ [option]: true }); const response = await h.post();
    assert.equal(response.status, 202); assert.equal(h.writes.length, 1);
    for (const callback of h.jobs) await callback();
    assert.ok(h.logs.length); assert.doesNotMatch(JSON.stringify(h.logs), /secret-token|secret-chat|private-contact|private-response|12345678|Please add it/);
  });
}

test('database failure and missing confirmation fail closed; duplicate retries succeed without renotifying', async () => {
  for (const options of [{ dbError: '42P01' }, { noConfirmation: true }]) {
    const h = api(options); const response = await h.post(); assert.equal(response.status, 503); assert.equal(h.jobs.length, 0);
    assert.doesNotMatch(JSON.stringify(await response.json()), /private-db-error/);
  }
  const retry = api({ dbError: '23505' }); assert.equal((await retry.post()).status, 202); assert.equal(retry.jobs.length, 0);
});

test('honeypot, invalid input, malformed bodies, foreign origins and oversized streams never write', async () => {
  const bot = api(); assert.equal((await bot.post({ ...game, website: 'spam.example' })).status, 202); assert.equal(bot.writes.length, 0); assert.equal(bot.jobs.length, 0);
  const h = api();
  assert.equal((await h.post({ ...game, game_name: '' })).status, 400);
  assert.equal((await h.post('{bad')).status, 400);
  assert.equal((await h.post(game, { origin: 'https://other.example' })).status, 403);
  assert.equal((await h.post(game, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await h.post('x'.repeat(8193), { 'content-length': '0' })).status, 413);
  assert.equal(h.writes.length, 0);
});

test('Cloudflare per-worker throttle blocks the sixth attempt and expires after ten minutes', async () => {
  const h = api();
  for (let i = 0; i < 5; i++) assert.equal((await h.post(game, { 'cf-connecting-ip': '192.0.2.1' })).status, 202);
  const limited = await h.post(game, { 'cf-connecting-ip': '192.0.2.1' });
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '600'); assert.equal(h.writes.length, 5);
  assert.equal((await h.post(game, { 'cf-connecting-ip': '192.0.2.2' })).status, 202);
  h.advance(); assert.equal((await h.post(game, { 'cf-connecting-ip': '192.0.2.1' })).status, 202);
});

test('repeated-game counts normalize case/spacing, ignore feedback, count submissions across statuses', () => {
  const rows = [
    { ...game, game_name: ' New   Game ', status: 'pending' },
    { ...game, game_name: 'new game', status: 'added' },
    { ...game, game_name: 'Other Game' }, { ...feedback, game_name: 'New Game' },
  ];
  assert.deepEqual(plain(helpers.repeatedGameRequests(rows).map(g => [g.key, g.count])), [['new game', 2], ['other game', 1]]);
});

test('status update writes only a valid status, checks expected state and rejects zero-row saves', async () => {
  const writes = [], filters = [];
  const client = { from(table) { assert.equal(table, 'customer_requests'); return {
    update(payload) { writes.push(payload); return this; }, eq(k, v) { filters.push([k, v]); return this; }, select() { return this; },
    maybeSingle: async () => ({ data: { id, status: 'reviewed' }, error: null }),
  }; } };
  await helpers.updateRequestStatus(client, id, 'reviewed', 'pending');
  assert.deepEqual(plain(writes), [{ status: 'reviewed' }]); assert.deepEqual(filters, [['id', id], ['status', 'pending']]);
  await assert.rejects(helpers.updateRequestStatus(client, id, 'arbitrary', 'pending'), /Invalid/);
  await assert.rejects(helpers.updateRequestStatus(client, 'bad', 'reviewed', 'pending'), /Invalid/);
  const unavailable = { from: () => ({ update() { return this; }, eq() { return this; }, select() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }) };
  await assert.rejects(helpers.updateRequestStatus(unavailable, id, 'reviewed', 'pending'), /not confirmed/);
});

test('prepared SQL restricts direct anonymous access, admin updates to status, and changes only the new table', () => {
  const sql = fs.readFileSync(new URL('../sql/phase-3-customer-requests.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.customer_requests from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant update \(status\) on table public\.customer_requests to authenticated/i);
  assert.match(sql, /with check \(exists \(select 1 from public\.admin_users/i);
  assert.doesNotMatch(sql, /grant.*to anon|create function|alter table public\.(products|orders|payments)/i);
  assert.equal((sql.match(/create table /gi) ?? []).length, 1);
});

function nodes(e) { return !e || typeof e !== 'object' ? [] : Array.isArray(e) ? e.flatMap(nodes) : [e, ...nodes(e.props?.children)]; }
function hooks() {
  const slots = [], effects = []; let cursor = 0, first = true;
  return { effects, reset() { cursor = 0; }, finish() { first = false; }, react: {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn) { return fn; }, useEffect(fn) { if (first) effects.push(fn); },
  } };
}

test('public form retries the same draft key, preserves failed text, and shows a clean success state', async () => {
  const h = hooks(), calls = []; let attempt = 0;
  const Component = load('src/app/requests/page.tsx', { react: h.react, 'react/jsx-runtime': jsx,
    'next/link': { default: 'a' }, '../StoreBrand': { default: 'brand' }, '@/lib/customer-requests': helpers, './requests.css': {},
  }, { crypto: { randomUUID: () => key }, fetch: async (_url, init) => {
    calls.push(init); if (attempt++ === 0) throw new Error('lost response'); return Response.json({ success: true });
  } }).default;
  const render = () => { h.reset(); const tree = nodes(Component()); h.finish(); return tree; };
  const change = (id, value) => render().find(n => n.props?.id === id).props.onChange({ target: { value } });
  change('request-game_name', 'New Game'); change('request-message', 'Keep my message');
  const submit = () => render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await submit(); assert.equal(render().find(n => n.props?.id === 'request-message').props.value, 'Keep my message');
  await submit(); assert.equal(calls.length, 2); assert.equal(JSON.parse(calls[0].body).submission_key, JSON.parse(calls[1].body).submission_key);
  assert.equal(render().some(n => n.type === 'form'), false); assert.ok(render().some(n => n.props?.role === 'status'));
  assert.equal('Authorization' in calls[0].headers, false);
});

test('Admin Requests redirects anonymous/non-admin users without reading requests; admins can change status', async () => {
  for (const access of ['anonymous', 'non-admin', 'admin']) {
    const h = hooks(), reads = [], writes = [], redirects = [];
    const row = { id, ...helpers.validateCustomerRequest(game).data, status: 'pending', created_at: '2026-11-20T08:00:00Z' };
    const db = { auth: { getUser: async () => ({ data: { user: access === 'anonymous' ? null : { id: 'admin-id' } } }), signOut: async () => {} },
      from(table) { reads.push(table); let payload; return {
        select() { return this; }, eq() { return this; }, order() { return this; }, range() { return this; },
        update(value) { payload = value; writes.push(value); return this; },
        maybeSingle: async () => ({ data: table === 'admin_users' ? access === 'admin' ? { user_id: 'admin-id' } : null : { id, ...payload } }),
        then(resolve, reject) { return Promise.resolve({ data: [row], error: null }).then(resolve, reject); },
      }; } };
    const Component = load('src/app/admin/requests/page.tsx', { react: h.react, 'react/jsx-runtime': jsx,
      'next/link': { default: 'a' }, 'next/navigation': { useRouter: () => ({ replace: url => redirects.push(url) }) },
      '@/lib/supabase': { supabase: db }, '@/lib/customer-requests': helpers,
    }).default;
    const render = () => { h.reset(); const tree = nodes(Component()); h.finish(); return tree; };
    render(); h.effects.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve));
    if (access !== 'admin') { assert.deepEqual(redirects, ['/admin/login']); assert.equal(reads.includes('customer_requests'), false); }
    else {
      assert.equal(redirects.length, 0); assert.ok(render().some(n => n.type === 'article'));
      render().find(n => n.props?.['aria-label'] === `Status for request ${id}`).props.onChange({ target: { value: 'reviewed' } });
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(plain(writes), [{ status: 'reviewed' }]);
      assert.equal(render().find(n => n.props?.['aria-label'] === `Status for request ${id}`).props.value, 'reviewed');
    }
  }
});
