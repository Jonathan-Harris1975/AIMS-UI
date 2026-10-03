import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { readCommsMetrics, escapeHtml, formatDateTime, titleCase } from "../packages/shared/format.js";

// This is the AIMS CommsOperationsRepository.metrics response contract, with
// deliberately non-zero values so a stale schema cannot pass by showing zeroes.
function envelope() {
  return { ok: true, metrics: {
    period: { from: "2026-10-01T00:00:00Z", to: "2026-10-03T00:00:00Z" },
    volume: { conversations: 8, messages: 12 },
    responseTime: { average_seconds: 120, measured: 4 },
    resolutionTime: { average_seconds: 900, resolved: 3 },
    failures: [{ failure_class: "recoverable", count: 2 }],
    channels: [{ channel: "email", conversations: 5 }, { channel: "form", conversations: 3 }],
    autonomyOutcomes: [
      { channel: "email", outcome: "auto_sent", reason: null, count: 3 },
      { channel: "form", outcome: "held_for_review", reason: "attachment_review", count: 2 },
    ],
    newsletterConfirmations: [{ outcome: "sent", count: 2 }, { outcome: "consent_confirmed", count: 1 }],
    newsletterRequestSignals: { accepted_pending: 2, provider_unknown: 0 },
  }, workerHealth: {
    overall: "stale", checkedAt: "2026-10-03T00:00:00Z",
    workers: [{ category: "inbound_email", key: "info", enabled: true, status: "stale" }],
  } };
}

test("AIMS metrics retain real counts, mean response time and separate subscriber outcomes", () => {
  const model = readCommsMetrics(envelope());
  assert.equal(model.conversations, 8);
  assert.equal(model.averageMinutes, 2);
  assert.equal(model.measured, 4);
  assert.equal(model.resolved, 3);
  assert.equal(model.failureCount, 2);
  assert.deepEqual(model.channels.map((row) => row.count), [5, 3]);
  assert.equal(model.autoSent, 3);
  assert.equal(model.held, 2);
  assert.equal(model.newsletter[1].outcome, "consent_confirmed");
  assert.equal(model.workerHealth.overall, "stale");
});

test("empty actual metrics are valid; absent or malformed schemas cannot masquerade as zero", () => {
  const payload = envelope();
  payload.metrics.volume.conversations = 0;
  payload.metrics.responseTime = { average_seconds: null, measured: 0 };
  payload.metrics.channels = [];
  payload.metrics.autonomyOutcomes = [];
  assert.equal(readCommsMetrics(payload).averageMinutes, null);
  assert.equal(readCommsMetrics(payload).autoSent, 0);
  for (const bad of [null, { ok: true }, { ok: true, metrics: { volume: { total: 8 } } }, { ...payload, ok: false }]) {
    assert.throws(() => readCommsMetrics(bad), /invalid metrics/);
  }
  payload.metrics.volume.conversations = -1;
  assert.throws(() => readCommsMetrics(payload), /invalid metrics/);
  const older = envelope();
  delete older.metrics.autonomyOutcomes;
  assert.equal(readCommsMetrics(older).autoSent, null);
});

async function analyticsHarness(client) {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  const view = app.slice(app.indexOf("function analyticsView()"), app.indexOf("function manualMailView()"));
  const load = app.slice(app.indexOf("async function loadMetrics()"), app.indexOf("async function updateWorkspaceStatus("));
  const state = { metrics: null, metricsLoading: false, metricsError: null, metricsLoadedAt: null };
  const screen = { html: "" };
  const context = {
    state, client, readCommsMetrics, escapeHtml, formatDateTime, titleCase,
    shell: (html) => html,
    pageHeader: (title, subtitle, button) => `<h1>${title}</h1><p>${subtitle}</p>${button}`,
    summaryCard: (label, value, subtitle) => `<p>${label}: ${value} · ${subtitle}</p>`,
    channelLabel: titleCase,
    render() { screen.html = context.analyticsView(); },
  };
  vm.createContext(context);
  vm.runInContext(view + load, context);
  return { context, state, screen };
}

test("real analytics view renders AIMS data and shows loading, stale refresh and initial errors truthfully", async () => {
  let resolve;
  const harness = await analyticsHarness({ metrics: () => new Promise((done) => { resolve = done; }) });
  const pending = harness.context.loadMetrics();
  assert.match(harness.screen.html, /Loading metrics/);
  assert.doesNotMatch(harness.screen.html, /Conversation volume: 0/);
  resolve(envelope());
  await pending;
  assert.match(harness.screen.html, /Conversation volume: 8/);
  assert.match(harness.screen.html, /Average first response: 2.0m/);
  assert.match(harness.screen.html, /Sent autonomously: 3/);
  assert.match(harness.screen.html, /Attachment Review/);
  assert.match(harness.screen.html, /Consent Confirmed/);
  assert.match(harness.screen.html, /Stale/);
  assert.doesNotMatch(harness.screen.html, /Median response|Failure rate/);
  harness.context.client.metrics = async () => { throw new Error("Network unavailable"); };
  await harness.context.loadMetrics();
  assert.match(harness.screen.html, /role="alert"/);
  assert.match(harness.screen.html, /Previous results are shown/);
  assert.match(harness.screen.html, /Conversation volume: 8/);
  const initial = await analyticsHarness(harness.context.client);
  await initial.context.loadMetrics();
  assert.match(initial.screen.html, /Refresh metrics to retry/);
  assert.doesNotMatch(initial.screen.html, /Conversation volume:/);
});
