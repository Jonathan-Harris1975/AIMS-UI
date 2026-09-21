const CONSOLE_IMPORTS = [
  'import { AimsCommsClient, AimsApiError } from "../../packages/api-client/index.js";',
  'import { escapeHtml, formatDateTime, formatRelativeTime, secondsToAge, titleCase } from "../../packages/shared/format.js";',
  'import { roleAllows } from "../../packages/shared/contracts.js";',
];

function stripExports(source) {
  return source
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+function\s+/gm, "function ")
    .replace(/^export\s+class\s+/gm, "class ")
    .replace(/^export\s+const\s+/gm, "const ");
}

export function createConsoleBundle({ apiClient, format, contracts, app }) {
  let bundledApp = app;
  for (const statement of CONSOLE_IMPORTS) {
    if (!bundledApp.includes(statement)) {
      throw new Error(`Console bundle import contract changed: ${statement}`);
    }
    bundledApp = bundledApp.replace(`${statement}\n`, "");
  }

  if (/^\s*import\s/m.test(bundledApp)) {
    throw new Error("Console app contains an unexpected import; update the production bundler deliberately.");
  }

  return [contracts, format, apiClient].map(stripExports).concat(bundledApp).join("\n");
}
