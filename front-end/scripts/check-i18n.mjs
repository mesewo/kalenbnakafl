import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const catalogs = await Promise.all(
  ["en", "am"].map(async (locale) => [
    locale,
    JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")),
  ]),
);
const review = await readFile(new URL("../../docs/i18n-review.md", import.meta.url), "utf8");
const flatten = (value, prefix = "", out = new Map()) => {
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") out.set(name, child);
    else if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, name, out);
    else throw new Error(`Invalid catalog value at ${name}`);
  }
  return out;
};
const en = flatten(catalogs[0][1]);
const am = flatten(catalogs[1][1]);
const keys = [...new Set([...en.keys(), ...am.keys()])];
const errors = [];
for (const key of keys) {
  const a = en.get(key);
  const b = am.get(key);
  if (!a || !b || !a.trim() || !b.trim()) errors.push(`Missing or empty translation: ${key}`);
  if (b && !review.includes(b.replaceAll("|", "\\|")))
    errors.push(`Missing Amharic native-review entry: ${key}`);
  const placeholders = (value) =>
    [...value.matchAll(/\{([\w.]+)(?:,[^{}]+)?\}/g)].map((match) => match[1]).sort();
  if (a && b && JSON.stringify(placeholders(a)) !== JSON.stringify(placeholders(b)))
    errors.push(`ICU placeholders differ: ${key}`);
}
async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}
const sourceRoots = ["app", "components", "context", "lib"];
const missingReferences = [];
for (const root of sourceRoots) {
  for (const file of await sourceFiles(fileURLToPath(new URL(`../${root}`, import.meta.url)))) {
    const source = await readFile(file, "utf8");
    const bindings = new Map();
    for (const match of source.matchAll(
      /(?:const|let)\s+(\w+)\s*=\s*(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']\s*\)/g,
    )) {
      bindings.set(match[1], match[2]);
    }
    const displayedPath = relative(fileURLToPath(new URL("..", import.meta.url)), file)
      .split(sep)
      .join("/");
    for (const [binding, namespace] of bindings) {
      const call = new RegExp(`\\b${binding}\\(\\s*["']([^"']+)["']`, "g");
      for (const match of source.matchAll(call)) {
        const key = `${namespace}.${match[1]}`;
        if (!en.has(key) || !am.has(key)) missingReferences.push(`${displayedPath}: ${key}`);
      }
    }
  }
}
if (missingReferences.length)
  errors.push(`Catalog keys used in code but missing from en/am:\n${missingReferences.join("\n")}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Validated ${keys.length} bilingual messages.`);
