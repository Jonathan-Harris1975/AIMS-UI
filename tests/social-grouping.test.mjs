import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("console groups social DMs and comments using backend interaction_type", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  assert.match(app, /\["dms", "DMs", icons\.dm\]/);
  assert.match(app, /\["comments", "Comments", icons\.comment\]/);
  assert.match(app, /socialInteractionType\(row\)/);
  assert.match(app, /queueRows\(\{ interactionType: type, socialOnly: true \}\)/);
  assert.match(app, /client\.socialAction\(state\.selectedConversationId, "reply"/);
  assert.match(app, /reconcileSocialWebhooks/);
  assert.match(app, /executeApprovedSocialModeration/);
  assert.match(app, /data-social-approved-id/);
});
