import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

async function copyFile(source, target) {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const consoleDir = join(dist, "console");
await cp(join(root, "apps", "console"), consoleDir, { recursive: true });
await mkdir(join(consoleDir, "lib"), { recursive: true });
await copyFile(join(root, "packages", "api-client", "index.js"), join(consoleDir, "lib", "api-client.js"));
await copyFile(join(root, "packages", "shared", "format.js"), join(consoleDir, "lib", "format.js"));
await copyFile(join(root, "packages", "shared", "contracts.js"), join(consoleDir, "lib", "contracts.js"));
await copyFile(join(root, "packages", "theme", "tokens.css"), join(consoleDir, "lib", "tokens.css"));

const consoleIndexPath = join(consoleDir, "index.html");
let consoleIndex = await readFile(consoleIndexPath, "utf8");
consoleIndex = consoleIndex
  .replace('href="../../packages/theme/tokens.css"', 'href="./lib/tokens.css"')
  .replace('"@aims/api": "/packages/api-client/index.js"', '"@aims/api": "./lib/api-client.js"')
  .replace('"@aims/shared": "/packages/shared/format.js"', '"@aims/shared": "./lib/format.js"')
  .replace('"@aims/contracts": "/packages/shared/contracts.js"', '"@aims/contracts": "./lib/contracts.js"');
await writeFile(consoleIndexPath, consoleIndex);

const consoleStylesPath = join(consoleDir, "styles.css");
let consoleStyles = await readFile(consoleStylesPath, "utf8");
consoleStyles = consoleStyles.replace(/^@import url\("\.\.\/\.\.\/packages\/theme\/tokens\.css"\);\s*/u, "");
await writeFile(consoleStylesPath, consoleStyles);

// Keep the deployment root useful even when Cloudflare Pages is configured with
// `dist` as its output directory. The communications console itself intentionally
// lives at /console/ so its same-origin API remains /console/api. Preserve the
// HIVE handoff fragment during the redirect because URL fragments never reach
// the server.
const rootIndex = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <meta http-equiv="cache-control" content="no-store">
  <title>AIMS Communications Interface</title>
  <script>
    (() => {
      const target = new URL('/console/', location.origin);
      target.search = location.search;
      target.hash = location.hash;
      location.replace(target.toString());
    })();
  </script>
</head>
<body></body>
</html>
`;
await writeFile(join(dist, "index.html"), rootIndex);

await cp(join(root, "apps", "widget"), join(dist, "widget"), { recursive: true });
await cp(join(root, "workers", "gateway"), join(dist, "gateway"), { recursive: true });
await copyFile(join(root, "README.md"), join(dist, "README.md"));
await copyFile(join(root, "THIRD_PARTY_NOTICES.md"), join(dist, "THIRD_PARTY_NOTICES.md"));

const manifest = {
  name: "AIMS UI",
  version: JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
  builtAt: new Date().toISOString(),
  applications: {
    console: "console/index.html",
    widget: "widget/cognipal-widget.js",
    gateway: "gateway/index.js",
  },
};
await writeFile(join(dist, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log("Built AIMS UI: dist/console, dist/widget and dist/gateway");
