import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const item = { cartItemId: 'cart-a', productId: 'product-a', slug: '86-diamonds', name: '86 Diamonds', categoryName: 'Mobile Legends (Global)', imageUrl: '/diamonds.jpg', unitPrice: 2, quantity: 2, playerId: '123456', zoneId: '1234', trackStock: true, stockQuantity: 2 };
function load(file, imports, globals = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; }, ...globals });
  return exports;
}
const fields = load('src/lib/game-fields.ts', {});
function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (typeof element.type === 'function') return nodes(element.type(element.props));
  return [element, ...nodes(element.props?.children)];
}
function content(element) {
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(content).join(' ');
  if (element && typeof element === 'object') return content(element.props?.children);
  return '';
}
const common = {
  'react/jsx-runtime': jsx,
  '@/lib/game-fields': fields,
  '../StoreHeader': { default: () => null },
  '../StoreBrand': { default: () => null },
  '../StoreIcons': { default: () => null },
  '../ProductArtwork': { default: ({ src }) => jsx.jsx('img', { src }) },
  'next/image': { default: 'img' },
  'next/link': { default: 'a' },
};

test('cart keeps images, account details, totals and the existing quantity/remove actions', () => {
  const actions = [];
  const page = load('src/app/cart/page.tsx', { ...common, '../CartContext': { useCart: () => ({ cart: [item], itemCount: 2, subtotal: 4, isLoaded: true, updateQuantity: (...args) => actions.push(['quantity', ...args]), removeItem: (id) => actions.push(['remove', id]), clearCart: () => actions.push(['clear']) }) } }).default;
  const tree = page(), all = nodes(tree);
  assert.ok(all.some(n => n.type === 'img' && n.props.src === item.imageUrl));
  assert.match(content(tree), /User ID\s*:\s*123456/);
  assert.match(content(tree), /Server ID\s*:\s*1234/);
  assert.match(content(tree), /BND\s+4.00/);
  all.find(n => n.props['aria-label'] === `Decrease quantity for ${item.name}`).props.onClick();
  assert.equal(all.find(n => n.props['aria-label'] === `Increase quantity for ${item.name}`).props.disabled, true);
  assert.ok(all.some(n => n.props['aria-label'] === `Remove ${item.name} from cart`));
  all.find(n => n.type === 'button' && content(n) === 'Remove').props.onClick();
  all.find(n => n.type === 'button' && content(n) === 'Clear cart').props.onClick();
  assert.deepEqual(actions, [['quantity', 'cart-a', 1], ['remove', 'cart-a'], ['clear']]);
  assert.equal(all.filter(n => n.type === 'a' && n.props.href === '/checkout').length, 1);
});

async function checkout({ bankEnabled = true, uploadFails = false } = {}) {
  const states = [], refs = [], effects = [], requests = [], storage = new Map();
  let cursor = 0, refCursor = 0, mounted = false, cleared = 0;
  const settings = { bank_transfer_enabled: bankEnabled, bank_name: 'Preview Bank', account_name: 'Preview Store', account_number: '123456', payment_qr_url: '/qr.png' };
  const page = load('src/app/checkout/page.tsx', {
    ...common,
    react: {
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
      useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
      useEffect(fn) { if (!mounted) effects.push(fn); },
    },
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '../CartContext': { useCart: () => ({ cart: [item], subtotal: 4, isLoaded: true, clearCart() { cleared++; } }) },
    '@/lib/supabase': { supabase: { from: () => { const q = { select() { return q; }, eq() { return q; }, single: async () => ({ data: settings, error: null }) }; return q; } } },
  }, {
    URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} },
    window: { scrollTo() {}, setTimeout() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    crypto: { randomUUID: () => 'test-order-key' },
    FormData, File,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url === '/api/orders') return { ok: true, json: async () => ({ success: true, orderId: 'order-a', orderNumber: 'RD-TEST', paymentStatus: 'pending', hasReceipt: false }) };
      return { ok: !uploadFails, json: async () => uploadFails ? ({ success: false, error: 'Upload failed' }) : ({ success: true, code: 'ATTACHED', orderNumber: 'RD-TEST' }) };
    },
  }).default;
  let tree;
  function render() { cursor = 0; refCursor = 0; tree = page(); return nodes(tree); }
  function find(predicate) { return render().find(predicate); }
  render(); mounted = true; effects.forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  function fill(id, value) { find(n => n.props.id === id).props.onChange({ target: { value } }); }
  function button(label) { return find(n => n.type === 'button' && content(n).trim() === label); }
  function continueToPayment() { fill('customer-name', 'Preview Customer'); fill('customer-whatsapp', '+6738123456'); button('Continue to Payment →').props.onClick(); }
  function receipt(file) { find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [file], value: file.name } }); }
  return { render, find, fill, button, continueToPayment, receipt, requests, storage, text: () => { render(); return content(tree); }, cleared: () => cleared };
}

test('contact validation remains before payment, with associated accessible errors', async () => {
  const h = await checkout();
  h.button('Continue to Payment →').props.onClick();
  const name = h.find(n => n.props.id === 'customer-name');
  assert.equal(name.props['aria-invalid'], true);
  assert.equal(name.props['aria-describedby'], 'customer-name-error');
  assert.match(h.text(), /Please enter your name/);
  assert.equal(h.button('Place Order'), undefined);
  assert.equal(h.requests.length, 0);
  h.fill('customer-name', 'Preview Customer'); h.fill('customer-whatsapp', '8123456'); h.fill('customer-email', 'invalid');
  h.button('Continue to Payment →').props.onClick();
  assert.match(h.text(), /Please enter a valid email address/);
});

test('payment still shows bank/QR settings and requires a valid receipt before submission', async () => {
  const h = await checkout(); h.continueToPayment();
  assert.match(h.text(), /Preview Bank/);
  assert.ok(h.find(n => n.type === 'img' && n.props.src === '/qr.png'));
  assert.equal(h.button('Place Order').props.disabled, true);
  h.receipt(new File(['invalid'], 'receipt.txt', { type: 'text/plain' }));
  assert.match(h.text(), /Please upload a JPG, PNG, WEBP or PDF file/);
  assert.equal(h.button('Place Order').props.disabled, true);
  h.receipt(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
  assert.match(h.text(), /File size must not exceed 5MB/);
  h.receipt(new File(['preview'], 'receipt.png', { type: 'image/png' }));
  assert.equal(h.button('Place Order').props.disabled, false);
  assert.ok(h.find(n => n.type === 'img' && n.props.src === 'blob:preview'));
});

test('disabled payment settings continue to prevent order submission', async () => {
  const h = await checkout({ bankEnabled: false }); h.continueToPayment();
  assert.match(h.text(), /Bank transfer is currently unavailable/);
  assert.equal(h.button('Place Order').props.disabled, true);
  assert.equal(h.find(n => n.type === 'input' && n.props.type === 'file'), undefined);
});

test('Place Order preserves the order payload, receipt upload and success cleanup', async () => {
  const h = await checkout(); h.continueToPayment(); h.receipt(new File(['preview'], 'receipt.pdf', { type: 'application/pdf' }));
  await h.button('Place Order').props.onClick();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].url, '/api/orders');
  assert.deepEqual(JSON.parse(h.requests[0].options.body), { idempotencyKey: 'test-order-key', customer: { name: 'Preview Customer', whatsapp: '+6738123456', email: '' }, items: [{ productId: 'product-a', quantity: 2, playerId: '123456', zoneId: '1234' }] });
  assert.equal(h.requests[1].url, '/api/orders/order-a/payment-proof');
  assert.equal(h.requests[1].options.body.get('file').name, 'receipt.pdf');
  assert.equal(h.requests[1].options.body.get('idempotencyKey'), 'test-order-key');
  assert.equal(h.cleared(), 1);
  assert.equal(h.storage.size, 0);
  assert.match(h.text(), /Order submitted!/);
});

test('failed receipt upload retains the cart and retry key', async () => {
  const h = await checkout({ uploadFails: true }); h.continueToPayment(); h.receipt(new File(['preview'], 'receipt.pdf', { type: 'application/pdf' }));
  await h.button('Place Order').props.onClick();
  assert.equal(h.cleared(), 0);
  assert.ok(h.storage.has('ruang-checkout-session'));
  assert.match(h.text(), /Unable to complete checkout/);
  assert.match(h.text(), /Upload failed/);
});
