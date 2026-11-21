import { readFileSync } from "node:fs";
import { languageCode } from "./language.mjs";
const packs = new Map();
export function lessonFeedback(text, language = "uz") {
  languageCode(language);
  if (language === "uz") return text;
  if (!packs.has(language))
    packs.set(
      language,
      JSON.parse(
        readFileSync(
          new URL("./content/locales/" + language + ".json", import.meta.url),
          "utf8",
        ),
      ),
    );
  return packs.get(language)[text] || text;
}
