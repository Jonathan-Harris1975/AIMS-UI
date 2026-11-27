import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("outreach console exposes audited controlled-test controls and presents unavailable measurements honestly", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  const client = await readFile(new URL("../packages/api-client/index.js", import.meta.url), "utf8");
  const gateway = await readFile(new URL("../workers/gateway/index.js", import.meta.url), "utf8");
  assert.match(app, /\["outreach", "Outreach"/);
  assert.match(app, /Authenticated controls and evidence for Guest Article and Book Feature campaigns/);
  assert.match(app, /Configure controlled test/);
  assert.match(app, /Suspend now/);
  assert.match(app, /Process one authorised outbox item/);
  assert.match(app, /Unknown delivery/);
  assert.match(app, /Recent Book Feature delivery evidence/);
  assert.match(app, /reconcileBookFeatureDelivery/);
  assert.match(app, /Unavailable values are not presented as zero/);
  assert.match(app, /Promise\.allSettled\(\[\s*client\.outreachAutomationStatus\(\), client\.bookFeatureStatus\(\), client\.bookFeatureOverview\(\)/);
  assert.match(client, /outreachAutomationStatus\(\).*cache: "no-store"/);
  assert.match(client, /bookFeatureStatus\(\).*cache: "no-store"/);
  assert.match(client, /bookFeatureOverview\(\).*cache: "no-store"/);
  assert.match(client, /configureBookFeatureControlledTest/);
  assert.match(client, /runBookFeatureDispatchOnce/);
  assert.match(client, /reconcileBookFeatureDelivery/);
  assert.match(gateway, /outreachMutation/);
  assert.match(gateway, /identity\.role !== "admin"/);
});
