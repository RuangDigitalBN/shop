import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const directory = path.dirname(fileURLToPath(import.meta.url));
function load(file, imports, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, '..', file), 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
    ...globals,
  });
  return exports;
}
const fields = load('src/lib/game-fields.ts', {});
const whatsapp = load('src/lib/whatsapp-order.ts', { './game-fields': fields });
const adminProducts = load('src/lib/admin-products.ts', { './whatsapp-order': whatsapp }, { URL });

function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}

// Render the real page with local hooks and database/browser doubles; no external actions.
async function page({ category = 'Roblox', type = 'robux', soldOut = false, metadata = { order_method: 'whatsapp' } } = {}) {
  const states = [], effects = [], added = [], opened = [];
  let cursor = 0, firstRender = true;
  const product = {
    id: 'product-id', slug: 'roblox-500-robux', name: '500 Robux', price: '8.00',
    description: null, image_url: null, compare_at_price: null,
    category_id: 'category-id', product_type_id: 'type-id',
    track_stock: soldOut, stock_quantity: soldOut ? 0 : null,
    metadata,
  };
  const Component = load('src/app/products/[slug]/page.tsx', {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useEffect(effect) { if (firstRender) effects.push(effect); },
    },
    'react/jsx-runtime': jsx,
    'next/link': { default: 'a' },
    'next/navigation': { useParams: () => ({ slug: product.slug }) },
    '@/lib/supabase': { supabase: {
      from(table) {
        const query = {
          select: () => query, eq: () => query,
          maybeSingle: async () => ({ data: table === 'products' ? product : table === 'categories' ? { name: category } : { id: 'type-id', slug: type } }),
        };
        return query;
      },
    } },
    '../../CartContext': { useCart: () => ({ addItem: item => { added.push(item); return { success: true }; } }) },
    '../../StoreHeader': { default: () => null },
    '../../ProductArtwork': { default: 'product-artwork' },
    '@/lib/game-fields': fields,
    '@/lib/whatsapp-order': whatsapp,
  }, { window: { open: (...args) => opened.push(args) } }).default;
  const render = () => { cursor = 0; const tree = Component(); firstRender = false; return nodes(tree); };
  render();
  effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  const input = (key, value) => render().find(n => n.props?.id === `account-${key}`).props.onChange({ target: { value } });
  const button = () => render().find(n => n.type === 'button' && n.props.type === 'submit');
  const submit = () => render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  return { render, input, button, submit, added, opened, product };
}

test('only an explicit per-product setting opts into WhatsApp; legacy products use normal checkout', () => {
  assert.equal(whatsapp.getOrderMethod({ order_method: 'whatsapp' }), 'whatsapp');
  for (const metadata of [undefined, null, {}, [], 'whatsapp', { order_method: 'normal_checkout' }, { order_method: 'typo' }]) {
    assert.equal(whatsapp.getOrderMethod(metadata), 'normal_checkout');
  }
});

test('changing the order method preserves unrelated product metadata', () => {
  const original = { campaign: { name: 'Launch' }, order_method: 'normal_checkout' };
  const updated = whatsapp.withOrderMethod(original, 'whatsapp');
  assert.equal(JSON.stringify(updated), JSON.stringify({ campaign: { name: 'Launch' }, order_method: 'whatsapp' }));
  assert.equal(original.order_method, 'normal_checkout');
  assert.equal(whatsapp.withOrderMethod(updated, 'normal_checkout').order_method, 'normal_checkout');
});

test('WhatsApp is blocked until the existing username validation passes', async () => {
  const p = await page();
  assert.equal(p.button().props.children, 'Order via WhatsApp');
  for (const username of ['', '   ', 'x'.repeat(65), 'bad\nname']) {
    p.input('playerId', username);
    assert.equal(p.button().props.disabled, true);
    p.submit();
  }
  assert.equal(p.opened.length, 0);
  assert.equal(p.added.length, 0);
});

test('valid Robux order opens an encoded concise message and never adds to cart', async () => {
  const p = await page();
  p.input('playerId', '  Player & Friend  ');
  assert.equal(p.button().props.disabled, false);
  p.submit();
  assert.equal(p.added.length, 0);
  assert.equal(p.opened.length, 1);
  const [href, target, features] = p.opened[0];
  const url = new URL(href);
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/6737420706');
  assert.equal(url.searchParams.get('text'), '500 Robux\nPrice: BND 8.00\nRoblox username: Player & Friend');
  assert.doesNotMatch(url.searchParams.get('text'), /password|credential|login/i);
  assert.equal(target, '_blank');
  assert.equal(features, 'noopener,noreferrer');
});

test('multiple quantities include the unit price and correct total', async () => {
  const p = await page();
  p.input('playerId', 'Player');
  p.render().find(n => n.props?.['aria-label'] === 'Increase quantity').props.onClick();
  p.submit();
  assert.match(new URL(p.opened[0][0]).searchParams.get('text'), /Price: BND 8\.00\nQuantity: 2 · Total: BND 16\.00/);
});

test('sold-out Robux orders cannot open WhatsApp or enter the cart', async () => {
  const p = await page({ soldOut: true });
  p.input('playerId', 'Player');
  assert.equal(p.button().props.disabled, true);
  assert.equal(p.button().props.children, 'Sold Out');
  p.submit();
  assert.equal(p.opened.length, 0);
  assert.equal(p.added.length, 0);
});

for (const [category, type, playerId, zoneId] of [
  ['Mobile Legends (Global)', 'diamonds', '12345', '6789'],
  ['PUBG Mobile (Global)', 'unknown-cash', '12345', ''],
  ['Hotlink', 'prepaid-top-up', '+60123456789', ''],
  ['Digi', 'prepaid-top-up', '+60123456789', ''],
  ['Roblox', 'steal-an-egg', 'Player', ''],
]) {
  test(`${category}/${type} retains the normal cart action`, async () => {
    const p = await page({ category, type, metadata: {} });
    assert.equal(p.button().props.children, 'Add to Cart');
    p.input('playerId', playerId);
    if (zoneId) p.input('zoneId', zoneId);
    p.submit();
    assert.equal(p.opened.length, 0);
    assert.equal(p.added.length, 1);
    assert.equal(p.added[0].productId, p.product.id);
    assert.equal(p.added[0].playerId, playerId);
    assert.equal(p.added[0].zoneId, zoneId);
    assert.equal(p.added[0].categoryName, category);
    assert.equal(p.added[0].unitPrice, 8);
  });
}

for (const [category, primary, zone, labels] of [
  ['Mobile Legends (Global)', '12345', '6789', ['User ID: 12345', 'Server ID: 6789']],
  ['PUBG Mobile (Global)', '12345', '', ['User ID: 12345']],
  ['Hotlink', '+60123456789', '', ['Phone number: +60123456789']],
  ['Digi', '+60123456789', '', ['Phone number: +60123456789']],
]) {
  test(`WhatsApp setting also works for ${category} using its existing fields`, async () => {
    const p = await page({ category });
    p.input('playerId', primary);
    if (zone) {
      assert.equal(p.button().props.disabled, true);
      p.submit();
      assert.equal(p.opened.length, 0);
      p.input('zoneId', zone);
    }
    assert.equal(p.button().props.disabled, false);
    p.submit();
    assert.equal(p.added.length, 0);
    const message = new URL(p.opened[0][0]).searchParams.get('text');
    for (const label of labels) assert.ok(message.includes(label));
    assert.doesNotMatch(message, /password|credential|Roblox username/i);
  });
}

test('invalid phone numbers and unknown game fields fail closed', async () => {
  const phone = await page({ category: 'Hotlink' });
  phone.input('playerId', 'not-a-number');
  phone.submit();
  assert.equal(phone.button().props.disabled, true);
  assert.equal(phone.opened.length, 0);
  const unknown = await page({ category: 'Unknown game' });
  assert.equal(unknown.button().props.disabled, true);
  unknown.submit();
  assert.equal(unknown.opened.length, 0);
});

test('messages include only configured fields, never extra account credentials', () => {
  const order = whatsapp.whatsappOrderUrl({ name: 'Top up', price: 2 }, 'PUBG Mobile (Global)', {
    playerId: ' 12345 ', zoneId: 'ignored', password: 'do-not-send',
  }, 1);
  assert.equal(new URL(order.url).searchParams.get('text'), 'Top up\nPrice: BND 2.00\nUser ID: 12345');
});

async function admin(metadata) {
  const states = [], effects = [], writes = [], uploads = [], removals = [];
  let cursor = 0, first = true;
  const product = {
    id: 'product-id', category_id: 'game-id', product_type_id: 'type-id',
    name: 'Test product', slug: 'test-product', sku: null, description: null,
    image_url: 'https://example.com/shared.png', price: 8, compare_at_price: null, stock_quantity: null,
    track_stock: false, is_active: true, metadata,
  };
  const database = {
    storage: { from: () => ({
      upload: async (path, file) => { uploads.push({ path, file }); return {}; },
      getPublicUrl: path => ({ data: { publicUrl: 'https://example.com/' + path } }),
      remove: async paths => { removals.push(paths); return {}; },
    }) },
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    from(table) {
      let operation;
      const query = {
        select: () => query, eq: () => query, order: () => query, range: () => query,
        update(payload) { operation = { kind: 'update', payload }; return query; },
        insert(payload) { operation = { kind: 'insert', payload }; return query; },
        maybeSingle: async () => ({ data: table === 'admin_users' ? { user_id: 'admin' } : {
          ...product, metadata: { ...metadata, fresh_key: 'keep this too' },
        } }),
        single: async () => { writes.push(operation); return { data: { id: 'new-product' } }; },
        then(resolve, reject) {
          if (operation) { writes.push(operation); return Promise.resolve({}).then(resolve, reject); }
          return Promise.resolve({ data: table === 'products' ? [product] : table === 'categories'
            ? [{ id: 'game-id', name: 'Roblox', is_active: true }]
            : [{ id: 'type-id', category_id: 'game-id', name: 'Robux', is_active: true }] }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const Component = load('src/app/admin/products/page.tsx', {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
      },
      useEffect(effect) { if (first) effects.push(effect); },
    },
    'react/jsx-runtime': jsx,
    'next/navigation': { useRouter: () => ({ replace() {} }) },
    'next/image': { default: 'img' },
    '../CatalogNav': { default: () => null },
    './BulkProducts': { default: () => null },
    './BulkEditProducts': { default: 'bulk-edit-tools' },
    '@/lib/admin-products': adminProducts,
    '@/lib/supabase': { supabase: database },
    '@/lib/whatsapp-order': whatsapp,
  }, { window: { scrollTo() {} }, crypto: { randomUUID: () => 'new-image' }, URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} } }).default;
  const render = () => { cursor = 0; const tree = nodes(Component()); first = false; return tree; };
  render();
  effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  return {
    render, writes, uploads, removals,
    image() { render().find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [{ name: 'new.png', type: 'image/png', size: 1024 }] } }); },
    duplicate: () => render().find(n => n.type === 'button' && n.props.children === 'Duplicate').props.onClick(),
    name(value) { render().find(n => n.type === 'input' && n.props.placeholder === 'e.g. Mobile Legends 86 Diamonds').props.onChange({ target: { value } }); },
    method: () => render().find(n => n.props?.id === 'order-method'),
    edit: () => render().find(n => n.type === 'button' && n.props.children === 'Edit').props.onClick(),
    save: () => render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }),
  };
}

test('Admin defaults to Normal Checkout, loads a saved WhatsApp setting, and preserves fresh metadata on save', async () => {
  const a = await admin({ order_method: 'whatsapp', campaign: 'keep me' });
  assert.equal(a.method().props.value, 'normal_checkout');
  assert.equal(JSON.stringify(nodes(a.method()).filter(n => n.type === 'option').map(n => n.props.children)),
    JSON.stringify(['Normal Checkout', 'WhatsApp Order']));
  a.edit();
  assert.equal(a.method().props.value, 'whatsapp');
  a.method().props.onChange({ target: { value: 'normal_checkout' } });
  await a.save();
  assert.equal(a.writes.length, 1);
  assert.equal(a.writes[0].kind, 'update');
  assert.equal(JSON.stringify(a.writes[0].payload.metadata), JSON.stringify({
    order_method: 'normal_checkout', campaign: 'keep me', fresh_key: 'keep this too',
  }));
  assert.equal(a.method().props.value, 'normal_checkout');
});

test('Admin can opt an existing legacy product into WhatsApp without a schema change', async () => {
  const a = await admin({ campaign: 'keep me' });
  a.edit();
  assert.equal(a.method().props.value, 'normal_checkout');
  a.method().props.onChange({ target: { value: 'whatsapp' } });
  await a.save();
  assert.equal(a.writes.length, 1);
  assert.equal(a.writes[0].payload.metadata.order_method, 'whatsapp');
  assert.equal(a.writes[0].payload.metadata.campaign, 'keep me');
});

test('Admin Duplicate prefills settings, requires a new name, and inserts a new identity with preserved metadata', async () => {
  const a = await admin({ order_method: 'whatsapp', campaign: 'keep me' });
  a.duplicate();
  assert.equal(a.method().props.value, 'whatsapp');
  await a.save(); assert.equal(a.writes.length, 0);
  a.name('Test product'); await a.save(); assert.equal(a.writes.length, 0);
  a.name('New denomination'); await a.save();
  assert.equal(a.writes.length, 1); assert.equal(a.writes[0].kind, 'insert');
  const payload = a.writes[0].payload;
  assert.equal(payload.name, 'New denomination'); assert.equal(payload.slug, 'new-denomination');
  assert.equal(payload.sku, null); assert.equal('id' in payload, false);
  assert.equal(payload.price, 8); assert.equal(payload.metadata.order_method, 'whatsapp');
  assert.equal(payload.metadata.campaign, 'keep me');
  assert.equal(payload.image_url, 'https://example.com/shared.png');
});

test('replacing an image saves its new URL and retains the old shared storage file', async () => {
  const a = await admin({ order_method: 'whatsapp', campaign: 'keep me' });
  a.edit(); a.image(); await a.save();
  assert.equal(a.uploads.length, 1); assert.equal(a.writes.length, 2);
  assert.equal(a.writes[1].payload.image_url, 'https://example.com/product-id/new-image.png');
  assert.equal(a.removals.length, 0);
});

test('Admin passes only its currently filtered products to Bulk Edit', async () => {
  const a = await admin({ campaign: 'keep me' });
  const targets = () => a.render().find(n => n.type === 'bulk-edit-tools').props.targets;
  assert.equal(targets().length, 1);
  const search = a.render().find(n => n.type === 'input' && n.props.type === 'search');
  search.props.onChange({ target: { value: 'no matching denomination' } });
  assert.equal(targets().length, 0);
  search.props.onChange({ target: { value: 'Test product' } });
  assert.equal(targets().length, 1); assert.equal(targets()[0].id, 'product-id');
});

test('single-product editor associates visible labels with its controls and announces validation errors', async () => {
  const a = await admin({});
  for (const id of ['product-image', 'product-name', 'product-slug', 'product-game', 'product-sku', 'product-price', 'product-compare-price', 'product-description', 'product-stock']) {
    const tree = a.render();
    assert.equal(tree.filter(n => n.props?.id === id).length, 1);
    assert.ok(tree.some(n => n.type === 'label' && n.props.htmlFor === id));
  }
  await a.save(); assert.ok(a.render().some(n => n.props?.role === 'alert'));
});
