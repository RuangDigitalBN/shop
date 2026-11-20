import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, AbortSignal, require(name) { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; }, ...globals });
  return exports;
}
const shop = load('src/lib/shop-status.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function database(result, writes = []) {
  return { from(table) {
    assert.equal(table, 'shop_settings');
    const q = { select: () => q, eq: (...args) => { writes.push(['eq', ...args]); return q; },
      update: value => { writes.push(['update', { ...value }]); return q; },
      maybeSingle: async () => { if (result instanceof Error) throw result; return result; },
    }; return q;
  } };
}
function nodes(e) { return !e || typeof e !== 'object' ? [] : Array.isArray(e) ? e.flatMap(nodes) : [e, ...nodes(e.props?.children)]; }
function text(e) { return typeof e === 'string' ? e : Array.isArray(e) ? e.map(text).join(' ') : e && typeof e === 'object' ? text(e.props?.children) : ''; }
function hooks() {
  const slots = [], effects = []; let cursor = 0, first = true;
  return { reset() { cursor = 0; }, commit() { first = false; return effects.map(fn => fn()); }, react: {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn) { if (first) effects.push(fn); }, useCallback: fn => fn, useMemo: fn => fn(),
  } };
}

test('status reads are strict: explicit true opens, false closes, missing/error/malformed fails safely', async () => {
  for (const [result, expected] of [[{ data: { is_open: true } }, 'open'], [{ data: { is_open: false } }, 'closed'],
    [{ data: null }, 'unavailable'], [{ data: { is_open: 'true' } }, 'unavailable'],
    [{ data: { is_open: true }, error: {} }, 'unavailable'], [new Error('offline'), 'unavailable']]) {
    assert.equal(await shop.readShopState(database(result)), expected);
  }
});

test('public GET exposes only status, never caches and returns 503 when settings cannot be read', async () => {
  for (const state of ['open', 'closed', 'unavailable']) {
    const route = load('src/app/api/shop-status/route.ts', {
      'next/server': { NextResponse: Response }, '@/lib/supabase-admin': { supabaseAdmin: {} },
      '@/lib/shop-status': { readShopState: async () => state },
    });
    assert.equal(route.dynamic, 'force-dynamic');
    const response = await route.GET(); assert.deepEqual(await response.json(), { status: state });
    assert.equal(response.status, state === 'unavailable' ? 503 : 200);
    for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) assert.match(response.headers.get(header), /no-store/);
  }
});

test('browser fetch uses uncached status with a timeout and fails closed on HTTP/JSON/network errors', async () => {
  for (const response of [{ ok: true, json: async () => ({ status: 'open' }) }, { ok: true, json: async () => ({ status: 'closed' }) },
    { ok: false }, { ok: true, json: async () => ({ status: true }) }, { ok: true, json: async () => { throw Error('json'); } }, new Error('offline')]) {
    const helper = load('src/lib/shop-status.ts', {}, { fetch: async (url, init) => {
      assert.equal(url, '/api/shop-status'); assert.equal(init.cache, 'no-store'); assert.ok(init.signal instanceof AbortSignal);
      if (response instanceof Error) throw response; return response;
    } });
    const expected = response.ok && ['open', 'closed'].includes((await response.json().catch(() => ({}))).status) ? (await response.json()).status : 'unavailable';
    assert.equal(await helper.fetchShopState(), expected);
  }
});

test('admin writes only the singleton is_open column and rejects conflicting or unconfirmed saves', async () => {
  const writes = [];
  await shop.updateShopState(database({ data: { id: true, is_open: false } }, writes), false, true);
  assert.deepEqual(writes, [['update', { is_open: false }], ['eq', 'id', true], ['eq', 'is_open', true]]);
  for (const result of [{ data: null }, { data: { id: true, is_open: true } }, { error: {} }]) {
    await assert.rejects(shop.updateShopState(database(result), false, true), /Refresh and try again/);
  }
  await assert.rejects(shop.updateShopState(database({}), 'closed', true), /valid shop status/);
});

test('prepared SQL limits reads/updates to admins, never allows anonymous writes, and touches only shop_settings', () => {
  const sql = fs.readFileSync(new URL('../sql/phase-4-1-shop-status.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i); assert.match(sql, /check \(id = true\)/);
  assert.match(sql, /grant update \(is_open\).*to authenticated/i);
  assert.match(sql, /for select to authenticated[\s\S]*admin_users/);
  assert.match(sql, /for update to authenticated[\s\S]*with check[\s\S]*auth.uid/);
  assert.doesNotMatch(sql, /to anon|create function|create trigger|cron\./i);
  const targets = [...sql.matchAll(/(?:create table|alter table|on table|on) public\.(\w+)/gi)].map(m => m[1]);
  assert.ok(targets.length > 4); assert.ok(targets.every(t => t === 'shop_settings'));
});

test('provider keeps requests/admin children accessible, skips admin polling, and shares/deduplicates public reads', async () => {
  for (const path of ['/admin', '/admin/login', '/admin/requests', '/requests']) {
    const h = hooks(); let reads = 0, resolve, intervalCount = 0;
    const pending = new Promise(r => { resolve = r; });
    const children = { page: path };
    const mod = load('src/app/ShopStatus.tsx', {
      react: { ...h.react, createContext: () => ({ Provider: 'provider' }), useContext: () => null },
      'react/jsx-runtime': jsx, 'next/navigation': { usePathname: () => path },
      '@/lib/shop-status': { ...shop, fetchShopState: () => { reads++; return pending; } },
    }, { window: { addEventListener() {}, removeEventListener() {}, setInterval: () => { intervalCount++; return 1; }, clearInterval() {} },
      document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } });
    const render = () => { h.reset(); return mod.ShopStatusProvider({ children }); };
    const initial = render(); assert.equal(initial.props.children, children); assert.equal(initial.props.value.canOrder, false);
    const cleanups = h.commit();
    if (path.startsWith('/admin')) { assert.equal(reads, 0); assert.equal(intervalCount, 0); }
    else {
      const a = initial.props.value.refresh(), b = initial.props.value.refresh(); assert.equal(a, b); assert.equal(reads, 1);
      resolve('closed'); await a;
      const closed = render(); assert.equal(closed.props.value.status, 'closed'); assert.equal(closed.props.value.canOrder, false); assert.equal(closed.props.children, children);
    }
    cleanups.forEach(fn => fn?.());
  }
});

test('banner appears for closed/unavailable states only and supports a safe retry', async () => {
  let state = 'open', retries = 0;
  const mod = load('src/app/ShopStatus.tsx', {
    react: { createContext: () => ({}), useContext: () => ({ status: state, checking: false, refresh: async () => { retries++; } }) },
    'react/jsx-runtime': jsx, 'next/navigation': {}, '@/lib/shop-status': shop,
  });
  assert.equal(mod.ShopStatusBanner(), null); state = 'loading'; assert.equal(mod.ShopStatusBanner(), null);
  state = 'closed'; const banner = mod.ShopStatusBanner(); assert.match(text(banner), /temporarily closed/); assert.equal(banner.props.role, 'status');
  state = 'unavailable'; nodes(mod.ShopStatusBanner()).find(n => n.type === 'button').props.onClick(); await tick(); assert.equal(retries, 1);
});

test('admin widget shows current status and changes it only on explicit Save, preserving retry after failure', async () => {
  const h = hooks(), saved = [], published = []; let reject = false;
  const Widget = load('src/app/admin/ShopStatusControl.tsx', {
    react: h.react, 'react/jsx-runtime': jsx, '@/lib/supabase': { supabase: {} },
    '../ShopStatus': { useShopStatus: () => ({ publish: state => published.push(state) }) },
    '@/lib/shop-status': { readShopState: async () => 'open', updateShopState: async (_db, next, expected) => { if (reject) throw Error('Refresh and try again.'); saved.push([next, expected]); } },
  }).default;
  const render = () => { h.reset(); return Widget(); };
  render(); h.commit(); await tick(); assert.match(text(render()), /Current status:\s+Open/);
  nodes(render()).find(n => n.type === 'select').props.onChange({ target: { value: 'closed' } }); assert.equal(saved.length, 0);
  reject = true; await nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(published.length, 0); assert.match(text(render()), /Could not save shop status/);
  reject = false; await nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(saved, [[false, true]]); assert.deepEqual(published, ['closed']); assert.match(text(render()), /Current status:\s+Temporarily Closed/);
  assert.equal(nodes(render()).find(n => n.type === 'button' && n.props.type === 'submit').props.disabled, true);
  nodes(render()).find(n => n.type === 'select').props.onChange({ target: { value: 'open' } });
  await nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(saved, [[false, true], [true, false]]); assert.deepEqual(published, ['closed', 'open']);
});

test('dashboard still requires admin authentication before exposing the control; closed status never gates admin', async () => {
  for (const role of ['anonymous', 'customer', 'admin']) {
    const h = hooks(), redirects = [], reads = [], router = { replace: url => redirects.push(url) };
    const Dashboard = load('src/app/admin/page.tsx', {
      react: h.react, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' },
      'next/navigation': { useRouter: () => router }, './ShopStatusControl': { default: 'shop-control' },
      '@/lib/supabase': { supabase: {
        auth: { getUser: async () => ({ data: { user: role === 'anonymous' ? null : { id: role, email: 'test@example.com' } } }), signOut: async () => {} },
        from(table) { reads.push(table); assert.equal(table, 'admin_users'); const q = {
          select: () => q, eq: () => q, maybeSingle: async () => ({ data: role === 'admin' ? { user_id: role } : null }),
        }; return q; },
      } },
    }).default;
    const render = () => { h.reset(); return nodes(Dashboard()); };
    assert.equal(render().some(n => n.type === 'shop-control'), false); h.commit(); await tick();
    assert.equal(render().some(n => n.type === 'shop-control'), role === 'admin');
    assert.equal(redirects.length, role === 'admin' ? 0 : 1); assert.ok(reads.every(t => t === 'admin_users'));
  }
});
