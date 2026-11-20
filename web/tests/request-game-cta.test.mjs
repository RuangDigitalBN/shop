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
  vm.runInNewContext(outputText, { exports, require: name => { assert.ok(name in imports, name); return imports[name]; } });
  return exports;
}
const Cta = load('src/app/RequestGameCta.tsx', { 'react/jsx-runtime': jsx, 'next/link': { default: 'a' }, './StoreIcons': { default: 'icon' } }).default;
function nodes(e) { return !e || typeof e !== 'object' ? [] : Array.isArray(e) ? e.flatMap(nodes) : [e, ...nodes(e.props?.children)]; }
function text(e) { return typeof e === 'string' ? e : Array.isArray(e) ? e.map(text).join('') : e && typeof e === 'object' ? text(e.props?.children) : ''; }

test('both CTA variants have a named section and a single accessible link to the existing request form', () => {
  for (const compact of [false, true]) {
    const tree = Cta({ compact }), all = nodes(tree);
    const heading = all.find(n => n.type === 'h2');
    assert.equal(tree.props['aria-labelledby'], heading.props.id);
    assert.equal(text(heading), compact ? 'Can’t find another game?' : 'Can’t find your game?');
    const links = all.filter(n => n.type === 'a');
    assert.equal(links.length, 1); assert.equal(links[0].props.href, '/requests');
    assert.equal(text(links[0]).trim(), 'Request a Game');
    assert.equal(links[0].props.target, undefined);
    assert.equal(all.some(n => n.type === 'button' || n.type === 'form'), false);
  }
});

test('homepage places CTA immediately after Games and before products, preserving the combined footer link', () => {
  const Home = load('src/app/page.tsx', {
    react: { Suspense: 'suspense' }, 'react/jsx-runtime': jsx,
    './StoreIcons': { default: 'icon' }, './StoreBottomNav': { default: 'bottom-nav' },
    './StoreSections': { GamesSection: 'games', PopularProductsSection: 'products' },
    './StoreHeader': { default: 'header' }, './StoreBrand': { default: 'brand' }, './StoreUI': { StoreStatus: 'status' },
    './RequestGameCta': { default: Cta },
  }).default;
  const tree = Home(), children = tree.props.children;
  const gamesIndex = children.findIndex(n => n.type === 'games');
  assert.equal(children[gamesIndex + 1].type, Cta);
  assert.equal(children[gamesIndex + 1].props.compact, undefined);
  assert.equal(children[gamesIndex + 2].type, 'suspense');
  assert.ok(nodes(children[gamesIndex + 2]).some(n => n.type === 'products'));
  const footer = nodes(tree).find(n => n.type === 'footer');
  const links = nodes(footer).filter(n => n.type === 'a' && n.props.href === '/requests');
  assert.equal(links.length, 1); assert.equal(text(links[0]), 'Request a game / Feedback');
});

test('game route places compact CTA after product content and before existing navigation', async () => {
  const Page = load('src/app/games/[slug]/page.tsx', {
    react: { Suspense: 'suspense' }, 'react/jsx-runtime': jsx,
    '../../StoreHeader': { default: 'header' }, '../../StoreBottomNav': { default: 'bottom-nav' },
    '../../StoreSections': { PopularProductsSection: 'products' }, '../../StoreUI': { StoreStatus: 'status' },
    '../../RequestGameCta': { default: Cta },
  }).default;
  const tree = await Page({ params: Promise.resolve({ slug: 'future-game' }) }), children = tree.props.children;
  assert.equal(children[1].type, 'suspense');
  assert.equal(nodes(children[1]).find(n => n.type === 'products').props.gameSlug, 'future-game');
  assert.equal(children[2].type, Cta); assert.equal(children[2].props.compact, true);
  assert.equal(children[3].type, 'bottom-nav');
});
