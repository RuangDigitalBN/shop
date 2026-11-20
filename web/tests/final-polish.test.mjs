import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, imports) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, URLSearchParams, require: name => { assert.ok(name in imports, name); return imports[name]; } });
  return exports;
}
function nodes(e) { return !e || typeof e !== 'object' ? [] : Array.isArray(e) ? e.flatMap(nodes) : [e, ...nodes(e.props?.children)]; }
function text(e) { return typeof e === 'string' || typeof e === 'number' ? String(e) : Array.isArray(e) ? e.map(text).join(' ') : e && typeof e === 'object' ? text(e.props?.children) : ''; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function hooks() {
  const slots = [], effects = [], pending = []; let cursor = 0, effectCursor = 0;
  return { reset() { cursor = 0; effectCursor = 0; }, commit() {
    for (const { i, fn, deps } of pending.splice(0)) { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }
  }, react: {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useEffect(fn, deps) { const i = effectCursor++; if (!effects[i] || deps.some((d, j) => d !== effects[i].deps[j])) pending.push({ i, fn, deps }); },
  } };
}

test('product artwork handles missing/broken URLs, restores changed URLs, and controls loading priority', () => {
  const h = hooks();
  const Artwork = load('src/app/ProductArtwork.tsx', { react: h.react, 'react/jsx-runtime': jsx }).default;
  const render = props => { h.reset(); return nodes(Artwork(props)); };
  const empty = render({ src: null, name: 'Hotlink' });
  assert.equal(empty[0].props['aria-hidden'], 'true'); assert.match(text(empty[0]), /H/);
  assert.equal(empty.some(n => n.type === 'img'), false);
  const image = render({ src: '/old.png', name: '86 Diamonds' }).find(n => n.type === 'img');
  assert.equal(image.props.loading, 'lazy'); assert.equal(image.props.alt, ''); image.props.onError();
  assert.equal(render({ src: '/old.png', name: '86 Diamonds' }).some(n => n.type === 'img'), false);
  assert.match(text(render({ src: '/old.png', name: '86 Diamonds' })[0]), /8D/);
  const replacement = render({ src: '/new.png', name: '86 Diamonds', loading: 'eager' }).find(n => n.type === 'img');
  assert.equal(replacement.props.src, '/new.png'); assert.equal(replacement.props.loading, 'eager');
  assert.match(text(render({ name: '   ' })[0]), /RD/);
});

test('thrown catalog network failures leave loading and show a retry state for games and products', async () => {
  for (const component of ['GamesSection', 'PopularProductsSection']) {
    const h = hooks();
    const sections = load('src/app/StoreSections.tsx', {
      react: h.react, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' },
      'next/navigation': { useSearchParams: () => new URLSearchParams() },
      './StoreUI': { SectionHeading: 'heading', StoreStatus: 'store-status' }, './StoreIcons': { default: 'icon' },
      './ShopStatus': { useShopStatus: () => ({ status: 'open', canOrder: true, checking: false, refresh: async () => 'open' }) },
      './ProductArtwork': { default: 'artwork' }, '@/lib/game-fields': { getGameFields: () => [] },
      '@/lib/supabase': { supabase: { from() { return { select() { return this; }, eq() { return this; }, order() { return this; },
        then(resolve, reject) { return Promise.reject(new Error('offline')).then(resolve, reject); },
      }; } } },
    });
    const render = () => { h.reset(); return nodes(sections[component]()); };
    render(); h.commit(); await tick();
    const tree = render();
    assert.ok(tree.some(n => n.type === 'store-status' && n.props.error));
    assert.ok(tree.some(n => n.type === 'button' && text(n).includes('Try again')));
    assert.doesNotMatch(text(tree), /Loading products|Loading games/);
  }
});

const fields = load('src/lib/game-fields.ts', {});
const methods = load('src/lib/whatsapp-order.ts', { './game-fields': fields });
const product = slug => ({ id: slug, slug, name: slug === 'old' ? 'Old product' : 'New product', price: 2,
  category_id: `${slug}-game`, product_type_id: `${slug}-type`, image_url: null, metadata: {},
  description: null, compare_at_price: null, track_stock: false, stock_quantity: 0 });

function productPage(query) {
  const h = hooks(); let slug = 'old';
  const Component = load('src/app/products/[slug]/page.tsx', {
    react: h.react, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' }, 'next/navigation': { useParams: () => ({ slug }) },
    '../../ShopStatus': { useShopStatus: () => ({ status: 'open', canOrder: true, checking: false, refresh: async () => 'open' }) },
    '@/lib/shop-status': { shopStatusMessage: state => state === 'closed' ? 'We’re temporarily closed. Orders will reopen soon.' : 'Ordering is temporarily unavailable. Please try again.' },
    '../../StoreHeader': { default: 'header' }, '../../ProductArtwork': { default: 'artwork' },
    '../../CartContext': { useCart: () => ({ addItem: () => ({ success: true }) }) },
    '@/lib/game-fields': fields, '@/lib/whatsapp-order': methods,
    '@/lib/supabase': { supabase: { from(table) { const filters = {}; return {
      select() { return this; }, eq(key, value) { filters[key] = value; return this; }, maybeSingle: () => query(table, filters),
    }; } } },
  }).default;
  const render = () => { h.reset(); return nodes(Component()); };
  return { render, commit: () => h.commit(), navigate(value) { slug = value; render(); h.commit(); } };
}

test('product network rejection shows unavailable/recovery links instead of an endless spinner', async () => {
  const h = productPage(async () => { throw new Error('offline'); });
  h.render(); h.commit(); await tick(); const tree = h.render();
  assert.ok(tree.some(n => n.props?.role === 'alert'));
  assert.ok(tree.some(n => n.type === 'button' && text(n) === 'Try again'));
  assert.ok(tree.some(n => n.type === 'a' && n.props.href === '/#games'));
  assert.equal(tree.some(n => n.type === 'form'), false);
});

test('late product/category responses cannot replace the currently selected product route', async () => {
  for (const hold of ['products', 'categories']) {
    let resolveOld;
    const old = new Promise(resolve => { resolveOld = resolve; });
    const h = productPage(async (table, filter) => {
      if (table === hold && (filter.slug === 'old' || filter.id === 'old-game')) return old;
      return { data: table === 'products' ? product(filter.slug) : table === 'categories' ? { name: 'Mobile Legends (Global)' } : { id: filter.id }, error: null };
    });
    h.render(); h.commit(); await tick(); h.navigate('new'); await tick();
    assert.equal(text(h.render().find(n => n.type === 'h1')), 'New product');
    resolveOld({ data: hold === 'products' ? product('old') : { name: 'Roblox' }, error: null }); await tick();
    assert.equal(text(h.render().find(n => n.type === 'h1')), 'New product');
  }
});

test('product navigation resets quantity and previous cart feedback without changing add-to-cart behavior', async () => {
  const h = productPage(async (table, filter) => ({ data: table === 'products' ? product(filter.slug) : table === 'categories' ? { name: 'Mobile Legends (Global)' } : { id: filter.id }, error: null }));
  h.render(); h.commit(); await tick();
  h.render().find(n => n.props?.['aria-label'] === 'Increase quantity').props.onClick();
  assert.equal(h.render().find(n => n.type === 'span' && n.props.className === 'min-w-10 text-center font-black').props.children, 2);
  h.navigate('new'); await tick();
  assert.equal(h.render().find(n => n.type === 'span' && n.props.className === 'min-w-10 text-center font-black').props.children, 1);
});

test('dashboard errors are announced and do not present failed statistics as zero sales/products', async () => {
  const h = hooks(), router = { replace() {} };
  const Component = load('src/app/admin/page.tsx', {
    './ShopStatusControl': { default: 'shop-status-control' },
    react: h.react, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' }, 'next/navigation': { useRouter: () => router },
    '@/lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'admin', email: 'test@example.com' } } }) },
      from(table) { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { user_id: 'admin' }, error: null }),
        then(resolve, reject) { assert.notEqual(table, 'admin_users'); return Promise.resolve({ data: null, error: { message: 'offline' } }).then(resolve, reject); },
      }; },
    } },
  }).default;
  const render = () => { h.reset(); return nodes(Component()); };
  render(); h.commit(); await tick(); render(); h.commit(); await tick(); const tree = render();
  assert.ok(tree.some(n => n.props?.role === 'alert'));
  assert.ok(tree.some(n => n.type === 'shop-status-control'));
  assert.equal(tree.filter(n => n.type === 'p' && n.props.children === '—').length, 4);
});
