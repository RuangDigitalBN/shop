import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

// Exercise the actual route/helper without real database writes or Telegram sends.
function loadSource(file, imports, globals = {}) {
  const source = fs.readFileSync(path.join(testDirectory, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, Request, Response, AbortSignal,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
    ...globals,
  }, { filename: file });
  return exports;
}

const key = '12345678-1234-4234-8234-123456789abc';
const productId = '22345678-1234-4234-8234-123456789abc';
const body = {
  idempotencyKey: key,
  customer: { name: 'Test Customer', whatsapp: '12345678', email: 'private@example.com' },
  items: [{ productId, quantity: 2, playerId: 'private-player', zoneId: 'private-zone' }],
};
const fields = loadSource('src/lib/game-fields.ts', {});

function harness(options = {}) {
  const requests = [];
  const logs = [];
  const jobs = [];
  let saved;
  let rpcCount = 0;
  let savedItems;
  const snapshot = (number) => ({
    id: 'internal-order-id', order_number: number, customer_contact: body.customer.whatsapp,
    payment_status: 'pending', order_status: 'pending',
    payment_proof_path: 'private-proof-path', cancellation_reason: null,
    created_at: '2026-11-16T01:00:00.000Z',
  });
  const helper = loadSource('src/lib/telegram-orders.ts', { 'server-only': {} }, {
    process: { env: options.missingConfig ? {} : {
      TELEGRAM_BOT_TOKEN: 'secret-test-token', TELEGRAM_CHAT_ID: 'secret-test-chat',
    } },
    console: { error: (...args) => logs.push(args) },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (options.fetchError) throw new Error(`secret-test-token ${url}`);
      if (options.invalidJson) return new Response('private-response', { status: 200 });
      return Response.json({ ok: !options.apiError, description: 'private-response' }, {
        status: options.httpError ? 500 : 200,
      });
    },
  });
  const database = {
    from(table) {
      const filters = {};
      const query = {
        select() { return query; },
        eq(field, value) { filters[field] = value; return query; },
        in() { return query; },
        maybeSingle: async () => ({ data: saved ?? (options.existing ? snapshot('RD-EXISTING') : null) }),
        single: async () => table === 'payment_settings'
          ? { data: { bank_transfer_enabled: true } }
          : options.confirmationError ? { error: {} } : { data: saved },
        then(resolve, reject) {
          if (table === 'categories') return Promise.resolve({ data: options.missingCategory ? [] : [{ id: 'category-id', name: options.categoryName ?? 'Mobile Legends (Global)', slug: 'game' }] }).then(resolve, reject);
          return Promise.resolve({ data: [{
            id: productId, name: 'Diamonds', slug: 'diamonds', sku: 'SKU',
            category_id: 'category-id',
            price: 3.5, is_active: true, track_stock: false,
          }] }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(_name, args) {
      rpcCount++;
      savedItems = args.p_items;
      if (options.rpcFailure) return { error: { message: 'Database unavailable' } };
      saved = snapshot(options.concurrent || options.rpcReuse ? 'RD-OTHER-REQUEST' : args.p_order_number);
      return options.concurrent
        ? { error: { message: 'Duplicate key' } }
        : { data: saved.id };
    },
  };
  const route = loadSource('src/app/api/orders/route.ts', {
    'node:crypto': crypto,
    'next/server': {
      NextResponse: Response,
      after(job) {
        if (options.scheduleError) throw new Error('Scheduling unavailable');
        jobs.push(job);
      },
    },
    '@/lib/supabase-admin': { supabaseAdmin: database },
    '@/lib/telegram-orders': helper,
    '@/lib/game-fields': fields,
  }, { console: { error: (...args) => logs.push(args) } });
  return {
    requests, logs, jobs, helper,
    get rpcCount() { return rpcCount; },
    get savedItems() { return savedItems; },
    async post(submitted = body) {
      return route.POST(new Request('https://example.com/api/orders', {
        method: 'POST', body: JSON.stringify(submitted),
      }));
    },
    async finish() { while (jobs.length) await jobs.shift()(); },
  };
}

test('new order sends once after response; a retry does not send again', async () => {
  const h = harness();
  const response = await h.post();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.reusedOrder, false);
  assert.equal(h.requests.length, 0);
  assert.equal(h.jobs.length, 1);
  await h.finish();
  assert.equal(h.requests.length, 1);
  const { init } = h.requests[0];
  const payload = JSON.parse(init.body);
  assert.equal(init.method, 'POST');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.redirect, 'manual');
  for (const text of [result.orderNumber, 'Test Customer', 'BND 7.00', 'pending',
    '2 x Diamonds', '2026-11-16T01:00:00.000Z', 'Check Admin Orders']) {
    assert.ok(payload.text.includes(text), text);
  }
  for (const text of ['12345678', 'private', 'internal-order-id', productId, 'secret-test-token']) {
    assert.ok(!payload.text.includes(text), text);
  }
  assert.equal((await (await h.post()).json()).reusedOrder, true);
  await h.finish();
  assert.equal(h.requests.length, 1);
  assert.equal(h.rpcCount, 1);
});

for (const option of ['existing', 'concurrent', 'rpcReuse']) {
  test(`${option}: existing order never schedules Telegram`, async () => {
    const h = harness({ [option]: true });
    assert.equal((await h.post()).status, 200);
    assert.equal(h.jobs.length, 0);
    await h.finish();
    assert.equal(h.requests.length, 0);
  });
}

for (const option of ['fetchError', 'httpError', 'apiError', 'invalidJson', 'missingConfig', 'scheduleError']) {
  test(`${option}: Telegram failure preserves successful order and logs safely`, async () => {
    const h = harness({ [option]: true });
    const response = await h.post();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    await h.finish();
    assert.ok(h.logs.length > 0);
    assert.doesNotMatch(JSON.stringify(h.logs), /secret-test|private-response|api\.telegram\.org|internal-order-id/);
    assert.equal((await (await h.post()).json()).reusedOrder, true);
    await h.finish();
    assert.ok(h.requests.length <= 1);
    assert.equal(h.rpcCount, 1);
  });
}

for (const option of ['rpcFailure', 'confirmationError']) {
  test(`${option}: unconfirmed creation never sends Telegram`, async () => {
    const h = harness({ [option]: true });
    assert.ok((await h.post()).status >= 500);
    assert.equal(h.jobs.length, 0);
    assert.equal(h.requests.length, 0);
  });
}

test('large cart text is bounded and user text cannot inject new lines', async () => {
  const h = harness();
  await h.helper.notifyNewOrder({
    orderNumber: 'RD-TEST', customerName: 'Name\nInjected', total: 7,
    paymentStatus: null, createdAt: null,
    items: Array.from({ length: 50 }, () => ({ name: 'x'.repeat(500), quantity: 100 })),
  });
  const { text } = JSON.parse(h.requests[0].init.body);
  assert.ok(text.length < 4096);
  assert.ok(text.includes('Name Injected'));
  assert.ok(text.includes('35 more cart entries'));
});

const games = [
  ['Mobile Legends (Global)', ['User ID', 'Server ID'], '12345678', '1234', ['player_id', 'server_id']],
  ['PUBG Mobile (Global)', ['User ID'], '12345678', '', ['player_id']],
  ['Roblox', ['Roblox username'], 'Test_User', '', ['roblox_username']],
  ['Hotlink', ['Phone number'], '+60 123456789', '', ['phone_number']],
  ['Digi', ['Phone number'], '0123456789', '', ['phone_number']],
];

for (const [game, labels, primary, server, keys] of games) {
  test(`${game}: product form, merge identity, and admin labels`, () => {
    const product = { id: productId, name: 'Test', price: 2, compare_at_price: null, track_stock: false, category_id: 'category-id', product_type_id: 'type-id' };
    let cursor = 0;
    const state = [product, game, false, '', '', '', 1, '', ''];
    const page = loadSource('src/app/products/[slug]/page.tsx', {
      'react/jsx-runtime': jsx,
      react: { useState: () => [state[cursor++], () => {}], useEffect() {} },
      'next/navigation': { useParams: () => ({ slug: 'test' }) },
      'next/link': { default: 'a' },
      '@/lib/supabase': {},
      '../../CartContext': { useCart: () => ({ addItem() {} }) },
      '../../StoreHeader': { default: () => null },
      '@/lib/game-fields': fields,
    });
    const tree = page.default();
    const walk = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
    const inputs = walk(tree).filter(node => node.type === 'input');
    assert.equal(inputs.length, labels.length);
    for (const label of labels) assert.ok(walk(tree).some(node => node.type === 'label' && node.props.children === label));
    assert.ok(inputs.every(node => node.props.required));
    const item = { productId, categoryName: game, playerId: primary, zoneId: server };
    assert.equal(fields.cartAccountKey(item), fields.cartAccountKey({ ...item, playerId: ` ${primary} ` }));
    assert.notEqual(fields.cartAccountKey(item), fields.cartAccountKey({ ...item, playerId: `${primary}2` }));
    if (!server) assert.equal(fields.cartAccountKey(item), fields.cartAccountKey({ ...item, zoneId: 'ignored' }));
    else assert.notEqual(fields.cartAccountKey(item), fields.cartAccountKey({ ...item, zoneId: 'other' }));
    const details = Object.fromEntries(keys.map((key, index) => [key, index ? server : primary]));
    assert.equal(JSON.stringify(fields.orderAccountEntries(details).map(entry => entry.label)), JSON.stringify(labels));
  });

  test(`${game}: API uses trusted category and saves only required JSON details`, async () => {
    const h = harness({ categoryName: game });
    const item = { productId, quantity: 2, playerId: ` ${primary} `, ...(server ? { zoneId: ` ${server} ` } : {}), categoryName: 'Mobile Legends (Global)', product_details: { password: 'discard-me' } };
    const response = await h.post({ ...body, items: [item] });
    assert.equal(response.status, 200, await response.text());
    const details = h.savedItems[0].product_details;
    assert.equal(details.category_name, game);
    assert.equal(details[keys[0]], primary);
    if (server) assert.equal(details.server_id, server);
    else assert.equal(details.server_id, undefined);
    assert.equal(details.password, undefined);
    assert.ok(!JSON.stringify(details).includes('discard-me'));
  });

  test(`${game}: API rejects missing required fields before saving`, async () => {
    const h = harness({ categoryName: game });
    assert.equal((await h.post({ ...body, items: [{ productId, quantity: 1, playerId: '', zoneId: server }] })).status, 400);
    assert.equal(h.rpcCount, 0);
  });
}

test('MLBB still requires Server ID; unknown/inactive categories fail closed', async () => {
  for (const options of [{}, { categoryName: 'Unconfigured Game' }, { missingCategory: true }]) {
    const h = harness(options);
    assert.equal((await h.post({ ...body, items: [{ productId, quantity: 1, playerId: '1234' }] })).status, 400);
    assert.equal(h.rpcCount, 0);
  }
});

test('unsafe or malformed account values are rejected; legacy MLBB details still display', () => {
  assert.equal(fields.getGameFields('constructor'), null);
  for (const value of [{}, null, 'x\nsecret', 'x'.repeat(65)]) assert.ok(fields.validateGameFields('PUBG Mobile (Global)', { playerId: value }).error);
  for (const game of ['Hotlink', 'Digi']) assert.ok(fields.validateGameFields(game, { playerId: 'not a phone' }).error);
  assert.equal(JSON.stringify(fields.orderAccountEntries({ playerId: 'old', zoneId: 'zone' })), JSON.stringify([{ label: 'User ID', value: 'old' }, { label: 'Server ID', value: 'zone' }]));
});

test('cart provider merges matching accounts and separates different accounts for all five games', () => {
  const storage = new Map();
  const context = loadSource('src/app/CartContext.tsx', {
    'react/jsx-runtime': jsx,
    react: {
      createContext: () => ({ Provider: 'provider' }), useContext() {},
      useMemo: fn => fn(), useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    },
    '@/lib/game-fields': fields,
  }, {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    crypto,
  });
  const cart = () => context.CartProvider({ children: null }).props.value;
  for (const [categoryName, , playerId, zoneId] of games) {
    cart().clearCart();
    const item = { productId, categoryName, playerId, zoneId, quantity: 1, unitPrice: 2, trackStock: false };
    assert.ok(cart().addItem(item).success);
    assert.ok(cart().addItem({ ...item, playerId: ` ${playerId} ` }).success);
    assert.equal(cart().cart.length, 1);
    assert.equal(cart().cart[0].quantity, 2);
    assert.ok(cart().addItem({ ...item, playerId: `${playerId}2` }).success);
    assert.equal(cart().cart.length, 2);
    if (zoneId) {
      assert.ok(cart().addItem({ ...item, zoneId: 'other' }).success);
      assert.equal(cart().cart.length, 3);
    }
    cart().updateQuantity(cart().cart[0].cartItemId, 3);
    assert.equal(cart().cart[0].quantity, 3);
  }
});
