import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const categories = [
  { id: 'ml', slug: 'mobile-legends-global', name: 'Mobile Legends (Global)', image_url: '/ml.jpg' },
  { id: 'new', slug: 'future-game', name: 'Future Game', image_url: null },
];
const types = [
  { id: 'diamonds', category_id: 'ml', slug: 'diamonds', name: 'Diamonds' },
  { id: 'pass', category_id: 'ml', slug: 'weekly-pass', name: 'Weekly Pass' },
  { id: 'new-type', category_id: 'new', slug: 'credits', name: 'Credits' },
];
const products = [
  { id: 'a', slug: '86-diamonds', name: '86 Diamonds', category_id: 'ml', product_type_id: 'diamonds', price: 2, compare_at_price: null },
  { id: 'b', slug: 'weekly-pass', name: 'Weekly Pass', category_id: 'ml', product_type_id: 'pass', price: 3, track_stock: true, stock_quantity: 0, compare_at_price: null },
  { id: 'c', slug: 'future-credits', name: 'Future Credits', category_id: 'new', product_type_id: 'new-type', price: 5, compare_at_price: null },
  { id: 'orphan', slug: 'orphan', category_id: 'ml', product_type_id: 'inactive', price: 1 },
];
function flatten(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(flatten);
  if (typeof element.type === 'function') return flatten(element.type(element.props));
  return [element, ...flatten(element.props?.children)];
}
function text(nodes) { return nodes.flatMap(n => [n.props?.children].flat(Infinity)).filter(n => typeof n === 'string').join(' '); }

async function render({ slug, query = '', component = 'PopularProductsSection', error = false } = {}) {
  const states = [], effects = [], reads = [];
  let cursor = 0, mounted = false;
  const imports = {
    'react/jsx-runtime': jsx,
    'next/link': { default: (props) => { const rest = { ...props }; delete rest.key; return jsx.jsx('a', rest); } },
    'next/navigation': { useSearchParams: () => new URLSearchParams(query) },
    './StoreUI': {
      SectionHeading: ({ children, action }) => jsx.jsxs('header', { children: [children, action] }),
      StoreStatus: ({ children, error }) => jsx.jsx('p', { role: error ? 'alert' : 'status', children }),
    },
    './StoreIcons': { default: () => null },
    './ProductArtwork': { default: ({ src }) => src ? jsx.jsx('img', { src }) : null },
    '@/lib/game-fields': { getGameFields: () => [{ label: 'User ID' }, { label: 'Server ID' }] },
    '@/lib/supabase': { supabase: { from(table) {
      reads.push(table);
      const chain = { select() { return chain; }, eq() { return chain; }, order() { return chain; }, then(resolve) {
        return Promise.resolve({ data: { categories, product_types: types, products }[table], error: error ? { message: 'offline' } : null }).then(resolve);
      } };
      return chain;
    } } },
    react: {
      useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (v) => { states[index] = v; }]; },
      useEffect(fn) { if (!mounted) effects.push(fn); },
    },
  };
  const source = fs.readFileSync(new URL('../src/app/StoreSections.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, URLSearchParams, require(name) { assert.ok(name in imports, name); return imports[name]; } });
  function run() { cursor = 0; return flatten(exports[component]({ gameSlug: slug })); }
  const loading = run();
  mounted = true;
  effects.forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  return { nodes: run(), loading, reads };
}

test('every catalog category links to its dynamic route, including future games', async () => {
  const { nodes } = await render({ component: 'GamesSection' });
  for (const game of categories) assert.ok(nodes.some(n => n.type === 'a' && n.props.href === `/games/${game.slug}`));
  assert.ok(nodes.some(n => n.type === 'img' && n.props.src === '/ml.jpg'));
  assert.ok(nodes.some(n => n.props.className === 'store-game-monogram'));
});

test('game route isolates products, preserves product detail links, and builds type chips', async () => {
  const { nodes, loading, reads } = await render({ slug: 'mobile-legends-global' });
  assert.ok(loading.some(n => n.props.role === 'status'));
  assert.deepEqual(reads.sort(), ['categories', 'product_types', 'products']);
  const links = nodes.filter(n => n.type === 'a').map(n => n.props.href);
  assert.ok(links.includes('/products/86-diamonds'));
  assert.ok(links.includes('/products/weekly-pass'));
  assert.ok(links.includes('/games/mobile-legends-global?type=diamonds#popular'));
  assert.ok(!links.includes('/products/future-credits'));
  assert.ok(!links.includes('/products/orphan'));
  assert.match(text(nodes), /Sold out/);
  assert.match(text(nodes), /User ID and Server ID/);
});

test('type chips and search compose within the game, and clear search stays on the game', async () => {
  const { nodes } = await render({ slug: 'mobile-legends-global', query: 'type=weekly-pass&q=weekly' });
  const links = nodes.filter(n => n.type === 'a').map(n => n.props.href);
  assert.ok(links.includes('/products/weekly-pass'));
  assert.ok(!links.includes('/products/86-diamonds'));
  assert.ok(links.includes('/games/mobile-legends-global'));
  assert.ok(links.includes('/games/mobile-legends-global?q=weekly#popular'));
});

test('unknown games never display other catalog products', async () => {
  const { nodes } = await render({ slug: 'missing' });
  assert.match(text(nodes), /Game unavailable/);
  assert.equal(nodes.filter(n => n.type === 'a' && n.props.href.startsWith('/products/')).length, 0);
});

test('invalid type and no search matches produce an empty list', async () => {
  for (const query of ['type=credits', 'q=nothing-matches']) {
    const { nodes } = await render({ slug: 'mobile-legends-global', query });
    assert.equal(nodes.filter(n => n.type === 'a' && n.props.href.startsWith('/products/')).length, 0);
  }
});

test('catalog failures show feedback and a retry action', async () => {
  const { nodes } = await render({ slug: 'future-game', error: true });
  assert.ok(nodes.some(n => n.props.role === 'alert'));
  assert.ok(nodes.some(n => n.type === 'button' && n.props.children === 'Try again →'));
});
