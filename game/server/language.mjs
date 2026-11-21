// Supported application languages. Never silently route another language through an Uzbek voice.
import { ApiError } from "./runtime.mjs";
export function languageCode(value = "uz") {
  if (!["uz", "ru", "en"].includes(value))
    throw new ApiError(400, "Unsupported language. Choose uz, ru or en.");
  return value;
}
export function requestLanguage(req, body) {
  const url = new URL(req.url, "http://localhost");
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("hb_language="))
    ?.slice(12);
  return languageCode(
    body?.language ||
      url.searchParams.get("language") ||
      (["uz", "ru", "en"].includes(cookie) ? cookie : "uz"),
  );
}
export const languageNames = {
  uz: "Uzbek (revised Latin alphabet)",
  ru: "Russian (Cyrillic)",
  en: "English",
};
