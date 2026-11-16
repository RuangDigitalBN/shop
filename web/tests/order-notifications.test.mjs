import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

// Exercise the actual route/helper without real database writes or Telegram sends.
function loadSource(file, imports, globals = {}) {
  const source = fs.readFileSync(path.join(testDirectory, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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

function harness(options = {}) {
  const requests = [];
  const logs = [];
  const jobs = [];
  let saved;
  let rpcCount = 0;
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
          return Promise.resolve({ data: [{
            id: productId, name: 'Diamonds', slug: 'diamonds', sku: 'SKU',
            price: 3.5, is_active: true, track_stock: false,
          }] }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(_name, args) {
      rpcCount++;
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
  }, { console: { error: (...args) => logs.push(args) } });
  return {
    requests, logs, jobs, helper,
    get rpcCount() { return rpcCount; },
    async post() {
      return route.POST(new Request('https://example.com/api/orders', {
        method: 'POST', body: JSON.stringify(body),
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
  assert.equal(init.redirect, 'error');
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
