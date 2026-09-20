import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  bundleBudgetFailures,
  javascriptBudgetStatus,
  loadBundleBudget,
  validateBundleBudget,
} from "../scripts/bundle-budget.mjs";

const validBudget = {
  maxTotalBytes: 400000,
  warnJavaScriptGzipBytes: 42750,
  maxJavaScriptGzipBytes: 45000,
  maxCssGzipBytes: 13000,
  maxSingleAssetBytes: 160000,
};

test("bundle budget reports JavaScript below the warning band", () => {
  assert.deepEqual(javascriptBudgetStatus(40000, validBudget), {
    actualGzipBytes: 40000,
    warningLimit: 42750,
    hardLimit: 45000,
    remainingBytes: 5000,
    percentageConsumed: 88.89,
    state: "below-warning",
  });
});

test("bundle budget reports warning-band entry without a hard failure", () => {
  assert.deepEqual(javascriptBudgetStatus(44000, validBudget), {
    actualGzipBytes: 44000,
    warningLimit: 42750,
    hardLimit: 45000,
    remainingBytes: 1000,
    percentageConsumed: 97.78,
    state: "warning",
  });
});

test("bundle budget reports and fails a hard-limit breach", () => {
  assert.deepEqual(javascriptBudgetStatus(45001, validBudget), {
    actualGzipBytes: 45001,
    warningLimit: 42750,
    hardLimit: 45000,
    remainingBytes: -1,
    percentageConsumed: 100,
    state: "hard-limit",
  });
  assert.deepEqual(bundleBudgetFailures({
    totalBytes: 300000,
    javascriptGzipBytes: 45001,
    cssGzipBytes: 11000,
    largestAssetBytes: 90000,
  }, validBudget), [["gzipped JavaScript bytes", 45001, 45000]]);
});

test("bundle budget rejects missing, malformed and inconsistent configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aims-ui-budget-"));
  try {
    await assert.rejects(() => loadBundleBudget(join(directory, "missing.json")), /Unable to read bundle budget configuration/);
    const malformed = join(directory, "malformed.json");
    await writeFile(malformed, "{not-json\n");
    await assert.rejects(() => loadBundleBudget(malformed), /not valid JSON/);
    assert.throws(
      () => validateBundleBudget({ ...validBudget, warnJavaScriptGzipBytes: 45000 }),
      /must be lower than maxJavaScriptGzipBytes/,
    );
    assert.throws(
      () => validateBundleBudget({ ...validBudget, maxCssGzipBytes: 0 }),
      /maxCssGzipBytes must be a positive integer/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
