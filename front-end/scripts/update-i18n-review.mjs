import { readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../messages/am.json", import.meta.url), "utf8"));
const strings = [];
function visit(value, prefix = "") {
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") strings.push([name, child]);
    else visit(child, name);
  }
}
visit(catalog);
const backend = [
  ["auth.password_too_short", "የይለፍ ቃሉ ቢያንስ 12 ቁምፊዎች ሊኖሩት ይገባል።"],
  ["auth.password_too_long", "የይለፍ ቃሉ ከ72 ባይት መብለጥ የለበትም።"],
  ["auth.password_too_common", "ይህ የይለፍ ቃል በጣም በብዛት የሚጠቀሙት ስለሆነ ሌላ ይምረጡ።"],
  ["auth.password_contains_identity", "የይለፍ ቃሉ ስምዎን ወይም ኢሜይልዎን መያዝ የለበትም።"],
  ["auth.password_policy_invalid", "የይለፍ ቃሉ የይለፍ ቃል መስፈርቱን አያሟላም።"],
  ["common.locale_invalid", "ቋንቋው en ወይም am መሆን አለበት"],
  ["contact.name_valid_email_and_a_message_are_required", "ስም እና መልእክት ያስፈልጋል"],
  ["posts.translations_are_required_and_must_be_valid", "ቢያንስ አንድ ትክክለኛ የግጽፍ ትርጉም ያስፈልጋል"],
  ["e2e.smoke_post_title", "የሙከራ ጽሑፍ {suffix}"],
  ["e2e.smoke_post_body", "የአማርኛ ይዘት {suffix}"],
  ["e2e.smoke_event_title", "የሙከራ ዝግጅት {suffix}"],
  ["e2e.smoke_event_description", "የአማርኛ ዝግጅት {suffix}"],
  ["e2e.smoke_event_location", "የሙከራ ቦታ"],
  ["e2e.smoke_contact_message", "የሙከራ መልእክት"],
];
const rows = [...backend, ...strings]
  .map(([key, value]) => `| \`${key}\` | ${value.replaceAll("|", "\\|")} |`)
  .join("\n");
const markdown = `# Amharic catalog review\n\nEvery Amharic string below was drafted for this change and **needs native review**. This file is generated from the backend and front-end catalogs; review the wording before publication.\n\n| Message key | Draft |\n|---|---|\n${rows}\n`;
await writeFile(new URL("../../docs/i18n-review.md", import.meta.url), markdown, "utf8");
