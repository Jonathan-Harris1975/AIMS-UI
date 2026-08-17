import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("console groups DMs, comments, admin email and newsletter email as Unified inbox child queues", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  const primary = app.match(/const navItems = \[[\s\S]*?\n\];/)?.[0] || "";
  const children = app.match(/const inboxSubItems = \[[\s\S]*?\n\];/)?.[0] || "";

  assert.doesNotMatch(primary, /\["dms", "DMs"/);
  assert.doesNotMatch(primary, /\["comments", "Comments"/);
  assert.match(children, /\["dms", "DMs", icons\.dm\]/);
  assert.match(children, /\["comments", "Comments", icons\.comment\]/);
  assert.match(children, /\["admin-email", "Admin email", icons\.email\]/);
  assert.match(children, /\["newsletter-email", "Newsletter email", icons\.email\]/);
  assert.match(app, /socialInteractionType\(row\)/);
  assert.match(app, /queueRows\(\{ interactionType: type, socialOnly: true \}\)/);
  assert.match(app, /client\.socialAction\(state\.selectedConversationId, "reply"/);
  assert.match(app, /reconcileSocialWebhooks/);
  assert.match(app, /executeApprovedSocialModeration/);
  assert.match(app, /data-social-approved-id/);
});

test("embedded and sidebar navigation expose all specialist queues beneath Unified inbox", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../apps/console/styles.css", import.meta.url), "utf8");

  assert.match(app, /class="nav-submenu" aria-label="Unified inbox sections"/);
  assert.match(app, /class="embedded-inbox-subnav" aria-label="Unified inbox sections"/);
  assert.match(app, /inboxSubItems\.slice\(1\)/);
  assert.match(app, /inboxSubItems\.map/);
  assert.match(app, /isInboxFamilyView\(\)/);
  assert.match(styles, /\.nav-submenu/);
  assert.match(styles, /\.embedded-inbox-subnav/);
});

test("DM and comment queues cannot inherit incompatible Email channel filters", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  assert.match(app, /if \(view === "dms"\) return \["facebook", "instagram"\]/);
  assert.match(app, /if \(view === "comments"\) return \["facebook", "instagram", "youtube"\]/);
  assert.match(app, /normaliseFiltersForView\(\);/);
  assert.match(app, /filterBar\(false, allowedChannels\)/);
});


test("admin and newsletter inbox views filter the email account and retain manual reply routing", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  assert.match(app, /function emailGroupView\(accountKey\)/);
  assert.match(app, /queueRows\(\{ emailAccountKey: accountKey \}\)/);
  assert.match(app, /row\.email_account_key/);
  assert.match(app, /manual replies only/);
  assert.match(app, /workspaceInboxView\(\) === "admin-email"/);
  assert.match(app, /workspaceInboxView\(\) === "newsletter-email"/);
  assert.match(app, /client\.sendEmail\(state\.selectedConversationId/);
});
