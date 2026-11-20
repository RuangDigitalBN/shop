import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, imports, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, URL, require: name => { assert.ok(name in imports, name); return imports[name]; }, ...globals });
  return exports;
}
const fields = load('src/lib/game-fields.ts', {});
const methods = load('src/lib/whatsapp-order.ts', { './game-fields': fields });
const helpers = load('src/lib/admin-products.ts', { './whatsapp-order': methods });
const games = [{ id: 'g', name: 'MLBB', is_active: true }, { id: 'g2', name: 'Roblox', is_active: true }];
const types = [{ id: 't', category_id: 'g', name: 'Diamonds', is_active: true }, { id: 't2', category_id: 'g2', name: 'Robux', is_active: true }];
const product = { id: 'p', name: '86 Diamonds', slug: '86-diamonds', sku: 'SKU', category_id: 'g', product_type_id: 't',
  image_url: 'https://example.com/shared.jpg', description: 'Text, with "quotes"\nand lines', price: 2, compare_at_price: 3,
  stock_quantity: 20, track_stock: true, is_active: true, sort_order: 4, metadata: { order_method: 'whatsapp', campaign: { label: 'keep' } } };
const filters = { game: '', type: '', status: '', search: '', sort: 'order' };
const settings = { category_id: 'g', product_type_id: 't', description: 'Shared text', image_url: product.image_url,
  order_method: 'whatsapp', track_stock: true, is_active: true, sort_order: '10' };
const row = { name: '172 Diamonds', price: '4', compare_at_price: '5', stock_quantity: '30', status: 'shared' };
const plain = v => JSON.parse(JSON.stringify(v));

test('grouping composes game, type, search and derived stock/status filters', () => {
  const products = [product, { ...product, id: 'p2', category_id: 'g2', product_type_id: 't2', name: 'Robux', is_active: false },
    { ...product, id: 'p3', stock_quantity: 0 }];
  const groups = helpers.groupProducts(products, games, types, { ...filters, game: 'g', type: 't', search: 'sku', status: 'sold_out' });
  assert.equal(groups.length, 1); assert.equal(groups[0].game, 'MLBB'); assert.equal(groups[0].type, 'Diamonds');
  assert.deepEqual(plain(groups[0].products.map(p => p.id)), ['p3']);
  assert.equal(helpers.groupProducts(products, games, types, { ...filters, game: 'g2', type: 't' }).length, 0);
  assert.equal(helpers.groupProducts(products, games, types, { ...filters, search: 'nothing' }).length, 0);
});

test('ordering is deterministic within types, supports price viewing, and never mutates the catalog', () => {
  const products = [product, { ...product, id: 'p2', sort_order: 1, price: 9 }, { ...product, id: 'p3', sort_order: null, price: 1 }];
  const ids = sort => plain(helpers.groupProducts(products, games, types, { ...filters, sort })[0].products.map(p => p.id));
  assert.deepEqual(ids('order'), ['p2', 'p', 'p3']); assert.deepEqual(ids('price_asc'), ['p3', 'p', 'p2']);
  assert.deepEqual(ids('price_desc'), ['p2', 'p', 'p3']); assert.equal(products[0].id, 'p');
});

test('duplicate allowlist clears identity/name/slug/SKU and keeps settings, metadata and shared image', () => {
  const copy = helpers.duplicateProduct({ ...product, created_at: 'never copy', immutable: 'never copy' });
  for (const key of ['id', 'created_at', 'immutable']) assert.equal(key in copy, false);
  assert.equal(copy.name, ''); assert.equal(copy.slug, ''); assert.equal(copy.sku, null);
  for (const key of ['image_url', 'description', 'price', 'compare_at_price', 'stock_quantity', 'track_stock', 'is_active', 'sort_order']) assert.deepEqual(copy[key], product[key]);
  assert.deepEqual(plain(copy.metadata), product.metadata);
  assert.ok(helpers.validateDraft(copy, games, types).length);
  assert.equal(helpers.duplicateProduct({ ...product, metadata: { other: true } }).metadata.order_method, 'normal_checkout');
});

test('ten bulk rows share one image and existing order-method metadata convention', () => {
  const result = helpers.prepareBulk(settings, Array.from({ length: 10 }, (_, i) => ({ ...row, name: `${i + 1} Diamonds` })), [product], games, types);
  assert.deepEqual(plain(result.errors), []); assert.equal(result.products.length, 10);
  assert.equal(new Set(result.products.map(p => p.image_url)).size, 1);
  for (const p of result.products) { assert.equal(p.image_url, product.image_url); assert.equal(p.metadata.order_method, 'whatsapp'); assert.equal('id' in p, false); }
  assert.equal(result.products[9].sort_order, 19);
});

test('bulk validation rejects duplicates, malformed money/stock/order and mismatched types before any writes', () => {
  for (const [change, shared] of [[{ name: product.name }, {}], [{ price: '' }, {}], [{ stock_quantity: '1.5' }, {}],
    [{ compare_at_price: '-1' }, {}], [{}, { product_type_id: 't2' }], [{}, { sort_order: '-1' }]]) {
    assert.ok(helpers.prepareBulk({ ...settings, ...shared }, [{ ...row, ...change }], [product], games, types).errors.length);
  }
  assert.ok(helpers.prepareBulk(settings, [row, row], [], games, types).errors.length);
  const hidden = helpers.prepareBulk({ ...settings, order_method: 'normal_checkout' }, [{ ...row, status: 'hidden' }], [], games, types);
  assert.equal(hidden.products[0].is_active, false); assert.equal(hidden.products[0].metadata.order_method, 'normal_checkout');
});

test('CSV round-trips exact v1 columns, metadata, quoted lines, Unicode and formula-safe text', () => {
  for (const name of ['Diamonds, "special"\n新', '=HYPERLINK("bad")', '  +SUM(1)', "'literal", '\t=1']) {
    const p = { ...product, name };
    const csv = helpers.exportProductsCsv([p]); assert.ok(csv.startsWith('\uFEFFid,category_id,'));
    const parsed = helpers.previewProductsCsv(csv, [p], games, types);
    assert.deepEqual(plain(parsed[0].errors), []); assert.equal(parsed[0].name, name);
    assert.deepEqual(plain(parsed[0].draft.metadata), product.metadata);
    assert.equal(parsed[0].draft.description, product.description);
  }
  assert.match(helpers.exportProductsCsv([{ ...product, name: '=1+1' }]), /"'=1\+1"/);
});

test('CSV rejects malformed quoting/headers/count and reports required, numeric, boolean and relationship errors', () => {
  assert.throws(() => helpers.parseCsv('"unclosed'));
  assert.throws(() => helpers.parseCsv('"closed"oops'));
  assert.throws(() => helpers.previewProductsCsv('name,price\nx,1', [], games, types));
  const csv = helpers.exportProductsCsv([{ ...product, id: '', name: '', price: -2, category_id: 'missing', stock_quantity: 1.1 }]);
  const result = helpers.previewProductsCsv(csv.replace('"true"', '"TRUE"'), [], games, types);
  assert.ok(result[0].errors.length >= 4);
  const short = helpers.CSV_COLUMNS.join(',') + '\nonly-one-cell';
  assert.ok(helpers.previewProductsCsv(short, [], games, types)[0].errors.includes('Incorrect column count.'));
});

test('CSV flags duplicate slugs/SKUs, unknown/repeated IDs, unsafe URLs and invalid metadata', () => {
  const csv = helpers.exportProductsCsv([product, product]);
  assert.ok(helpers.previewProductsCsv(csv, [product], games, types)[1].errors.length >= 3);
  const bad = helpers.exportProductsCsv([{ ...product, id: 'unknown', image_url: 'javascript:alert(1)', metadata: [] }]);
  assert.ok(helpers.previewProductsCsv(bad, [product], games, types)[0].errors.length >= 3);
});

test('catalog loading fetches beyond API page limits and discards incomplete reads on errors', async () => {
  const calls = [];
  const result = await helpers.readAllProducts(async (from, to) => { calls.push([from, to]); return { data: Array.from({ length: from === 0 ? 500 : 2 }, () => product), error: null }; });
  assert.equal(result.data.length, 502); assert.deepEqual(calls, [[0, 499], [500, 999]]);
  const failure = await helpers.readAllProducts(async from => from ? { data: null, error: { message: 'offline' } } : { data: Array(500).fill(product), error: null });
  assert.equal(failure.data, null); assert.equal(failure.error.message, 'offline');
});

function nodes(e) { return !e || typeof e !== 'object' ? [] : Array.isArray(e) ? e.flatMap(nodes) : [e, ...nodes(e.props?.children)]; }
function bulkHarness({ uploadError = false, insertError = false } = {}) {
  const states = [], uploads = [], inserts = []; let cursor = 0;
  const Component = load('src/app/admin/products/BulkProducts.tsx', {
    react: { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; } },
    'react/jsx-runtime': jsx, '@/lib/admin-products': helpers,
    '@/lib/supabase': { supabase: {
      storage: { from: bucket => ({ upload: async (path, file) => { uploads.push({ bucket, path, file }); return { error: uploadError ? { message: 'failed' } : null }; },
        getPublicUrl: path => ({ data: { publicUrl: 'https://example.com/' + path } }) }) },
      from: table => ({ insert: async payload => { inserts.push({ table, payload }); return { error: insertError ? { message: 'rejected' } : null }; } }),
    } },
  }, { crypto: { randomUUID: () => 'uuid' } }).default;
  const render = () => { cursor = 0; return nodes(Component({ products: [], games, types, onCreated: async () => {} })); };
  const click = text => render().find(n => n.type === 'button' && n.props.children === text).props.onClick();
  const change = (label, value) => {
    const l = render().find(n => n.type === 'label' && (n.props.children === label || n.props.children?.[0] === label));
    const input = nodes(l).find(n => ['input', 'select'].includes(n.type)); input.props.onChange({ target: { value, files: value ? [value] : [] } });
  };
  click('Bulk Add Products'); change('Game', 'g'); change('Product Type', 't');
  return { render, change, uploads, inserts,
    fill() {
      click('Add 10 rows');
      const names = render().filter(n => n.type === 'label' && n.props.children?.[0] === 'Name');
      names.forEach((n, i) => nodes(n).find(n => n.type === 'input').props.onChange({ target: { value: `${i + 1} Diamonds` } }));
      render().filter(n => n.type === 'label' && n.props.children?.[0] === 'Price (BND)').forEach(n => nodes(n).find(n => n.type === 'input').props.onChange({ target: { value: '2' } }));
    },
    submit: () => render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }),
  };
}

test('real bulk form uploads once, inserts once with the same URL, then blocks repeat submission', async () => {
  const h = bulkHarness(); h.fill(); h.change('Order method', 'whatsapp');
  h.change('Or upload one shared image', { name: 'diamonds.png', type: 'image/png', size: 1024 });
  await h.submit();
  assert.equal(h.uploads.length, 1); assert.equal(h.inserts.length, 1); assert.equal(h.inserts[0].payload.length, 11);
  assert.equal(new Set(h.inserts[0].payload.map(p => p.image_url)).size, 1);
  assert.ok(h.inserts[0].payload.every(p => p.metadata.order_method === 'whatsapp'));
  await h.submit(); assert.equal(h.inserts.length, 1);
});

test('real bulk form validates before upload, does not insert after upload failure, blocks ambiguous retry', async () => {
  const invalid = bulkHarness(); await invalid.submit(); assert.equal(invalid.inserts.length, 0); assert.equal(invalid.uploads.length, 0);
  const failed = bulkHarness({ uploadError: true }); failed.fill(); failed.change('Or upload one shared image', { name: 'x.png', type: 'image/png', size: 1 });
  await failed.submit(); assert.equal(failed.inserts.length, 0);
  const rejected = bulkHarness({ insertError: true }); rejected.fill(); await rejected.submit(); await rejected.submit();
  assert.equal(rejected.inserts.length, 1);
});
