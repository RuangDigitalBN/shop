# Admin Products — Phase 2

The existing single-product Add/Edit form remains available. Duplicate opens that
form with the source settings and image, but blank name, slug and SKU. Enter a
unique name; the slug is generated and remains editable. IDs and timestamps are
never copied. Existing edits still read fresh metadata before applying the selected
order method, preserving unrelated keys.

## Browsing and order

Products are grouped by Game, then Product Type. Unassigned legacy products remain
visible. Game, Product Type, status and search filters compose. Search covers name,
slug, SKU, game name and type name. Active means active and not sold out; Sold Out
means active with tracked stock at zero; Hidden means the product is inactive.
Game/type visibility continues to control customer visibility independently.

The single form exposes the existing non-negative integer `sort_order`. Lower
values appear first within a game/type. Admin ties use name, then ID; null values
appear last. Price sorting is a viewing option within each group and writes nothing.
No drag and drop or schema changes are needed. Catalog reads use 500-row pages so
the usual API row cap does not silently truncate the product export/filter list.

## Bulk Add

The separate collapsible form supports 1–100 new products per batch. Shared fields
are Game, Product Type, description, image, order method, stock tracking and default
active status. Rows supply name, price, optional original price, stock quantity and
optional status override. Starting sort order increases by one for each row.
Names/slugs are checked against the loaded catalog and batch before saving; the
existing database constraints remain the final authority for concurrent edits.

Select an existing product image or upload one PNG/JPEG/WebP up to 5 MB using the
existing `product-images` bucket, public URL and UUID-folder pattern. An upload is
performed once, then every row receives the identical URL. Ten products sharing
one 1 MB file use one 1 MB stored object, plus small database URL references.
No copies of existing files are uploaded. Order methods are stored using the
existing `metadata.order_method` helper: `normal_checkout` or `whatsapp`.

All rows are validated before any upload or insert. Creation uses one multi-row
insert (not a loop), so database constraint or policy errors reject that statement
as a whole. After any insert attempt, the form is locked until a page reload. This
prevents blind retries after an uncertain network response; check the catalog
before creating another batch. Upload failures can be retried before insertion.
If upload succeeds but insert fails, the object remains in storage and its URL is
retained in the current form. An unused object may require later cleanup.

Image replacement no longer deletes old storage objects automatically. Another
product or concurrent admin operation may still reference the old URL. Safe
garbage collection is deferred; expect unused images to remain after replacement.

## CSV v1

Export always includes **all loaded products**, independent of filters, using these
exact columns in this order:

```text
id,category_id,product_type_id,name,slug,sku,description,image_url,price,compare_at_price,stock_quantity,track_stock,is_active,sort_order,order_method,metadata
```

- Encoding: UTF-8 with BOM; comma delimiter; CRLF record endings; quoted/escaped
  cells support commas, quotes, Unicode and embedded newlines. In Excel use
  **CSV UTF-8 (Comma delimited)**. IDs/SKUs should remain text in Excel to avoid its
  automatic numeric conversions. Category/type columns use stored IDs, not names.
- Booleans are exactly `true` / `false`; numbers use a decimal point with no currency
  symbols or thousands separators. Blank nullable fields mean null. Price is required.
- `metadata` is a JSON object; null legacy metadata exports as `{}`. The separate
  `order_method` column is authoritative in preview and preserves other metadata keys.
- Formula-like cells (including whitespace-prefixed `=`, `+`, `-`, `@`, leading control
  whitespace and literal apostrophes) get a protective leading apostrophe on export.
  The preview reverses that escape. CSV is intended for this documented export/preview
  pair, not as an exact general-purpose database backup.
- Preview accepts 1–500 rows, up to 2 MB, with the exact header order. It reports every
  row's errors and whether the row identifies an existing product or a new one.
  Export supports larger catalogs; split files for preview when needed.
- Preview checks names/slugs, required fields, numeric values, stock/order integers,
  strict booleans/order methods, HTTP(S) image URLs, game/type relationships, JSON
  metadata, duplicate slugs/SKUs/IDs and unknown IDs. Existing products must keep their
  ID so their own slug/SKU is not mistaken for a conflict. New rows leave ID blank.
- Preview never uploads, inserts, updates or deletes anything. It does not contact
  image URLs or verify those remote files. It uses the loaded catalog snapshot;
  reload after concurrent catalog changes. Direct CSV writes are deliberately deferred.

No new dependencies, migrations, policies or other database configuration changes
are part of Phase 2. Storefront, cart, checkout and notification code are unchanged.
