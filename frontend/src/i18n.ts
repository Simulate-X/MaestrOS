/* MaestrOS — i18n setup. Turkish default + English.
   Locale lives in React state + URL query (?lng=), never localStorage.
   RULE: localize CHROME only. Backend identifiers — statuses, roles, verdicts,
   providers, models, phase names, proper nouns — stay English in every locale. */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import tr from "./locales/tr.json";

export const SUPPORTED = ["tr", "en"] as const;
export type Lng = (typeof SUPPORTED)[number];

function initialLng(): Lng {
  const q = new URLSearchParams(window.location.search).get("lng");
  return q === "en" || q === "tr" ? q : "tr"; // Turkish default
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, tr: { translation: tr } },
  lng: initialLng(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Switch language and reflect it in the URL query (no storage). */
export function setLng(lng: Lng) {
  i18n.changeLanguage(lng);
  const url = new URL(window.location.href);
  url.searchParams.set("lng", lng);
  window.history.replaceState({}, "", url);
}

export default i18n;
