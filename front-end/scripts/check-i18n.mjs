import { readFile } from "node:fs/promises";

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
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Validated ${keys.length} bilingual messages.`);
