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
  vm.runInNewContext(outputText, { exports, URL, crypto: { randomUUID: () => 'uuid' },
    require: name => { assert.ok(name in imports, name); return imports[name]; }, ...globals });
  return exports;
}
const fields = load('src/lib/game-fields.ts', {});
const methods = load('src/lib/whatsapp-order.ts', { './game-fields': fields });
const types = [{ id: 't', category_id: 'g', name: 'Diamonds', is_active: true }];
const products = ['a', 'b', 'c'].map(id => ({ id, name: `Product ${id}`, category_id: 'g', product_type_id: 't',
  metadata: { campaign: id, nested: { keep: true }, order_method: 'normal_checkout', fresh_key: 'latest' },
  image_url: 'https://example.com/old.png', description: `Original ${id}`, price: 2, sort_order: 1, stock_quantity: 10 }));
const file = { name: 'diamonds.png', type: 'image/png', size: 1024 };
const plain = v => JSON.parse(JSON.stringify(v));

function service(options = {}) {
  const writes = [], uploads = [], reads = [], removals = [], progress = [];
  const current = plain(options.products ?? products);
  const database = {
    storage: { from: bucket => ({
      upload: async (path, file, options) => { uploads.push({ bucket, path, file, options }); return { error: optionsUploadError() }; },
      getPublicUrl: path => ({ data: { publicUrl: 'https://example.com/' + path } }),
      remove: paths => { removals.push(paths); throw new Error('Must never delete images'); },
    }) },
    from(table) {
      assert.equal(table, 'products'); let id, ids, payload;
      const q = {
        select: () => q, in: (_column, values) => { ids = values; return q; },
        eq: (column, value) => { assert.equal(column, 'id'); id = value; return q; },
        update: value => { payload = value; return q; },
        async maybeSingle() {
          if (payload) {
            writes.push({ id, payload });
            if (id === options.failId) return { data: null, error: { message: 'save failed' } };
            if (id === options.zeroRowsId) return { data: null, error: null };
            if (id === options.throwId) throw new Error('network response lost');
            return { data: { id }, error: null };
          }
          reads.push(id);
          return id === options.readFailId ? { data: null, error: { message: 'metadata unavailable' } } : { data: current.find(p => p.id === id), error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: current.filter(p => ids.includes(p.id)), error: options.preflightError ? { message: 'preflight failed' } : null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  function optionsUploadError() { return options.uploadError ? { message: 'upload failed' } : null; }
  const helper = load('src/lib/admin-product-bulk-edit.ts', { './supabase': { supabase: database }, './whatsapp-order': methods });
  const apply = (changes = {}, sharedFile = null, ids = ['a', 'b', 'c']) => helper.applyBulkEdit(ids, { ...helper.emptyBulkEdit, ...changes }, sharedFile, types, n => progress.push(n));
  return { helper, apply, writes, uploads, reads, removals, progress };
}

test('payload allowlist omits untouched fields and blank/opted-out descriptions', () => {
  const { helper } = service();
  assert.deepEqual(plain(helper.bulkEditPayload(helper.emptyBulkEdit, products[0].metadata)), {});
  for (const changes of [{ description: 'Typed but not opted in' }, { replace_description: true, description: '   ' }]) {
    const payload = helper.bulkEditPayload({ ...helper.emptyBulkEdit, status: 'inactive', ...changes }, products[0].metadata);
    assert.deepEqual(plain(payload), { is_active: false });
  }
  assert.deepEqual(plain(helper.bulkEditPayload({ ...helper.emptyBulkEdit, replace_description: true, description: ' New text ' }, null)), { description: 'New text' });
});

test('one uploaded image URL is reused for every target; old storage objects are never deleted', async () => {
  const h = service(); const result = await h.apply({ status: 'inactive' }, file);
  assert.equal(result.error, null); assert.equal(h.uploads.length, 1); assert.equal(h.writes.length, 3);
  assert.equal(h.uploads[0].bucket, 'product-images'); assert.equal(h.uploads[0].options.upsert, false);
  assert.deepEqual([...new Set(h.writes.map(w => w.payload.image_url))], ['https://example.com/uuid/uuid.png']);
  assert.equal(h.removals.length, 0); assert.deepEqual(h.progress, [1, 2, 3]);
  assert.ok(h.writes.every(w => Object.keys(w.payload).sort().join() === 'image_url,is_active'));
});

test('selecting an existing image uploads nothing and updates only selected filtered IDs', async () => {
  const h = service(); const result = await h.apply({ image_url: 'https://example.com/existing.png' }, null, ['b']);
  assert.equal(result.error, null); assert.equal(h.uploads.length, 0);
  assert.deepEqual(plain(h.writes), [{ id: 'b', payload: { image_url: 'https://example.com/existing.png' } }]);
});

test('order method merges each fresh metadata object and preserves all unrelated keys', async () => {
  for (const order_method of ['whatsapp', 'normal_checkout']) {
    const h = service(); const result = await h.apply({ order_method });
    assert.equal(result.error, null); assert.deepEqual(h.reads, ['a', 'b', 'c']);
    for (const { id, payload } of h.writes) {
      assert.deepEqual(plain(payload.metadata), { ...products.find(p => p.id === id).metadata, order_method });
      assert.deepEqual(Object.keys(payload), ['metadata']);
    }
  }
  const h = service(); await h.apply({ status: 'active' });
  assert.deepEqual(h.reads, []); assert.ok(h.writes.every(w => !('metadata' in w.payload)));
});

test('missing products, invalid activation and upload failure prevent all writes', async () => {
  const missing = service(); const absent = await missing.apply({ status: 'inactive' }, file, ['a', 'missing']);
  assert.match(absent.error, /unavailable/); assert.equal(missing.uploads.length, 0); assert.equal(missing.writes.length, 0);
  const invalid = service({ products: [{ ...products[0], product_type_id: null }] });
  assert.match((await invalid.apply({ status: 'active' }, file, ['a'])).error, /matching Product Type/);
  assert.equal(invalid.uploads.length, 0); assert.equal(invalid.writes.length, 0);
  const upload = service({ uploadError: true }); assert.match((await upload.apply({}, file)).error, /upload was not confirmed/);
  assert.equal(upload.writes.length, 0);
});

test('empty/oversized/duplicate target sets and no-op changes cannot write or upload', async () => {
  for (const ids of [[], ['a', 'a'], Array.from({ length: 101 }, (_, i) => String(i))]) {
    const h = service(); assert.ok((await h.apply({ status: 'inactive' }, file, ids)).error);
    assert.equal(h.uploads.length, 0); assert.equal(h.writes.length, 0);
  }
  const h = service(); assert.match((await h.apply()).error, /at least one/); assert.equal(h.writes.length, 0);
});

test('a partial failure stops subsequent rows and reports confirmed versus unconfirmed saves', async () => {
  for (const options of [{ failId: 'b' }, { zeroRowsId: 'b' }, { throwId: 'b' }]) {
    const h = service(options); const result = await h.apply({ order_method: 'whatsapp' }, file);
    assert.deepEqual(plain(result.completed), ['a']); assert.equal(result.failedId, 'b'); assert.ok(result.error);
    assert.deepEqual(h.writes.map(w => w.id), ['a', 'b']); assert.deepEqual(h.reads, ['a', 'b']);
    assert.equal(h.uploads.length, 1); assert.equal(h.removals.length, 0); assert.equal(result.writeAttempted, true);
  }
});

test('fresh metadata read failure stops before overwriting that product', async () => {
  const h = service({ readFailId: 'b' }); const result = await h.apply({ order_method: 'whatsapp', replace_description: true, description: 'New' });
  assert.deepEqual(plain(result.completed), ['a']); assert.equal(result.failedId, 'b');
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].payload.description, 'New');
});

function nodes(e) { return !e || typeof e !== 'object' ? [] : Array.isArray(e) ? e.flatMap(nodes) : [e, ...nodes(e.props?.children)]; }
function ui() {
  const slots = [], calls = [], refreshes = []; let cursor = 0, targets = products.slice(0, 2);
  const helper = service().helper;
  const Component = load('src/app/admin/products/BulkEditProducts.tsx', {
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
      useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    },
    'react/jsx-runtime': jsx,
    '@/lib/admin-product-bulk-edit': { ...helper, applyBulkEdit: async (...args) => {
      calls.push(args); await new Promise(resolve => setImmediate(resolve));
      return { completed: args[0], failedId: null, error: null, imageUrl: args[1].image_url, writeAttempted: true };
    } },
  }).default;
  const render = () => { cursor = 0; return nodes(Component({ targets, products, types, disabled: false, onUpdated: async () => refreshes.push(true) })); };
  const buttonText = n => Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children;
  const button = prefix => render().find(n => n.type === 'button' && String(buttonText(n)).startsWith(prefix));
  const change = (label, value) => {
    const l = render().find(n => n.type === 'label' && n.props.children?.[0] === label);
    nodes(l).find(n => ['input', 'select', 'textarea'].includes(n.type)).props.onChange({ target: { value, checked: value } });
  };
  button('Bulk Edit').props.onClick();
  return { render, calls, refreshes, button, change, setTargets: value => { targets = value; },
    review: () => render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }),
    confirm: () => button('Confirm and apply').props.onClick(),
  };
}

test('real UI keeps every field unchanged by default and requires review plus explicit confirmation', async () => {
  const h = ui(); h.review(); assert.equal(h.button('Confirm and apply'), undefined); assert.equal(h.calls.length, 0);
  h.change('Active status', 'inactive'); h.review();
  assert.equal(h.calls.length, 0); assert.equal(h.button('Confirm and apply').props.children.join(''), 'Confirm and apply to 2 products');
  const confirm = h.button('Confirm and apply').props.onClick;
  confirm(); confirm(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 1); assert.deepEqual(plain(h.calls[0][0]), ['a', 'b']); assert.equal(h.refreshes.length, 1);
  assert.equal(h.button('Review changes').props.disabled, false); // Parent fieldset stays disabled after the attempt.
  assert.ok(h.render().some(n => n.type === 'fieldset' && n.props.disabled));
});

test('changing filtered targets invalidates review; later confirmation uses only the new set', async () => {
  const h = ui(); h.change('Order method', 'whatsapp'); h.review();
  h.setTargets([products[2]]); assert.equal(h.button('Confirm and apply').props.disabled, true);
  h.confirm(); assert.equal(h.calls.length, 0);
  h.review(); h.confirm(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(plain(h.calls[0][0]), ['c']);
});

test('editing inputs cancels review and description replacement remains opt-in', () => {
  const h = ui(); h.change('Active status', 'active'); h.review();
  h.change('Replacement description', 'Typed but not opted in'); assert.equal(h.button('Confirm and apply'), undefined);
  h.review(); const lists = h.render().filter(n => n.type === 'li').map(n => n.props.children);
  assert.ok(!lists.includes('Replace description'));
  const checkbox = h.render().find(n => n.type === 'input' && n.props.type === 'checkbox');
  checkbox.props.onChange({ target: { checked: true } }); h.review();
  assert.ok(h.render().some(n => n.type === 'li' && n.props.children === 'Replace description'));
});
