import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the Chinese inventory application shell", async () => {
  const [layout, page, app] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);

  assert.match(layout, /lang="zh-CN"/);
  assert.match(layout, /批次进销存/);
  assert.match(page, /<InventoryApp \/>/);
  assert.match(app, /正在打开经营管理台/);
  assert.match(app, /FIFO/);
  assert.doesNotMatch(app, /Your site is taking shape/);
});

test("keeps real-data routes and role rules in source", async () => {
  const [app, hosting, packageJson, schema, exportRoute, importRoute] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/import/master/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(app, /库存操作员可以查看全部销售和利润信息/);
  assert.match(app, /\/api\/inbounds/);
  assert.match(app, /\/api\/outbounds/);
  assert.match(app, /\/api\/transfers/);
  assert.match(app, /\/api\/sales/);
  assert.match(app, /\/api\/export\?mode=template/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(schema, /fifoAllocations/);
  assert.match(schema, /inventoryLedger/);
  assert.match(exportRoute, /出库FIFO分配/);
  assert.match(app, /先预览去重，再确认写入/);
  assert.match(importRoute, /库存数量仍为0/);
  assert.match(importRoute, /import_run_items/);
  assert.match(importRoute, /rollbackPackage/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
