import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("console groups DMs and comments as Unified inbox child queues while excluded mailboxes stay absent", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  const primary = app.match(/const navItems = \[[\s\S]*?\n\];/)?.[0] || "";
  const children = app.match(/const inboxSubItems = \[[\s\S]*?\n\];/)?.[0] || "";

  assert.doesNotMatch(primary, /\["dms", "DMs"/);
  assert.doesNotMatch(primary, /\["comments", "Comments"/);
  assert.match(children, /\["dms", "DMs", icons\.dm\]/);
  assert.match(children, /\["comments", "Comments", icons\.comment\]/);
  assert.doesNotMatch(children, /admin-email|newsletter-email|Admin email|Newsletter email/);
  assert.doesNotMatch(app, /function emailGroupView|function adminEmailView|function newsletterEmailView/);
  assert.match(app, /socialInteractionType\(row\)/);
  assert.match(app, /queueRows\(\{ interactionType: type, socialOnly: true \}\)/);
  assert.match(app, /client\.socialAction\(state\.selectedConversationId, "reply"/);
  assert.match(app, /reconcileSocialWebhooks/);
  assert.match(app, /executeApprovedSocialModeration/);
  assert.match(app, /data-social-approved-id/);
});

test("embedded and sidebar navigation expose specialist social queues beneath Unified inbox", async () => {
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

test("Admin and Newsletter inboxes remain outside the AIMS-UI automation surface", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /admin-email|newsletter-email|manual replies only/);
  assert.doesNotMatch(app, /queueRows\(\{ emailAccountKey:/);
  assert.match(app, /else if \(conversation\.channel === "email"\)/);
  assert.match(app, /client\.sendEmail\(state\.selectedConversationId/);
});
