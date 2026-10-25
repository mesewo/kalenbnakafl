import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const catalog = JSON.parse(await readFile(new URL("../messages/en.json", import.meta.url), "utf8"));
const sourceRoots = ["app", "components", "context", "lib"];
const sources = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.[jt]sx?$/.test(entry.name)) sources.push(await readFile(path, "utf8"));
  }
}
for (const root of sourceRoots)
  await collect(fileURLToPath(new URL(`../${root}`, import.meta.url)));
const used = new Set();
for (const source of sources) {
  for (const match of source.matchAll(
    /(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']\s*\)/g,
  )) {
    const namespace = match[1];
    const rest = source.slice(match.index);
    for (const key of rest.matchAll(/\bt\(\s*["']([^"']+)["']/g))
      used.add(`${namespace}.${key[1]}`);
    for (const key of rest.matchAll(/\b(?:common|dashboardT|t)\(\s*["']([^"']+)["']/g))
      used.add(`${namespace}.${key[1]}`);
  }
}
const keys = [];
function flatten(value, prefix = "") {
  for (const [name, child] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof child === "string") keys.push(key);
    else flatten(child, key);
  }
}
flatten(catalog);
const unused = keys.filter((key) => !used.has(key));
console.log(`Potentially unused English catalog keys (${unused.length}; report only):`);
for (const key of unused) console.log(`- ${key}`);
