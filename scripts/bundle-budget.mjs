import { readFile } from "node:fs/promises";

const requiredPositiveIntegers = [
  "maxTotalBytes",
  "warnJavaScriptGzipBytes",
  "maxJavaScriptGzipBytes",
  "maxCssGzipBytes",
  "maxSingleAssetBytes",
];

export function validateBundleBudget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Bundle budget configuration must be a JSON object.");
  }
  for (const key of requiredPositiveIntegers) {
    if (!Number.isInteger(value[key]) || value[key] <= 0) {
      throw new Error(`Bundle budget ${key} must be a positive integer.`);
    }
  }
  if (value.warnJavaScriptGzipBytes >= value.maxJavaScriptGzipBytes) {
    throw new Error("Bundle budget warnJavaScriptGzipBytes must be lower than maxJavaScriptGzipBytes.");
  }
  return value;
}

export async function loadBundleBudget(path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read bundle budget configuration: ${path}`, { cause: error });
  }

  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`Bundle budget configuration is not valid JSON: ${path}`, { cause: error });
  }
  return validateBundleBudget(value);
}

export function javascriptBudgetStatus(actual, budget) {
  const hardLimit = budget.maxJavaScriptGzipBytes;
  const warningLimit = budget.warnJavaScriptGzipBytes;
  const remainingBytes = hardLimit - actual;
  const percentageConsumed = Number(((actual / hardLimit) * 100).toFixed(2));
  const state = actual > hardLimit ? "hard-limit" : actual >= warningLimit ? "warning" : "below-warning";
  return { actualGzipBytes: actual, warningLimit, hardLimit, remainingBytes, percentageConsumed, state };
}

export function bundleBudgetFailures(measurements, budget) {
  const checks = [
    ["total bundle bytes", measurements.totalBytes, budget.maxTotalBytes],
    ["gzipped JavaScript bytes", measurements.javascriptGzipBytes, budget.maxJavaScriptGzipBytes],
    ["gzipped CSS bytes", measurements.cssGzipBytes, budget.maxCssGzipBytes],
    ["largest single asset bytes", measurements.largestAssetBytes, budget.maxSingleAssetBytes],
  ];
  return checks.filter(([, actual, maximum]) => actual > maximum);
}
