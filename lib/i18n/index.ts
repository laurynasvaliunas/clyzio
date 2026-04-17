import { getLocales } from 'expo-localization';
import { en } from './en';

/**
 * Minimal i18n scaffold.
 *
 * Designed so a real locale file (es, fr, lt …) drops in as a single
 * `./xx.ts` export with the same shape and gets picked up automatically.
 * Uses typed keys so the compiler catches missing / misspelled strings.
 */
export type StringKey = keyof typeof en;
type Catalog = Record<StringKey, string>;

const catalogs: Record<string, Catalog> = { en };

export function resolveLocale(): string {
  try {
    return getLocales()[0]?.languageCode ?? 'en';
  } catch {
    return 'en';
  }
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const locale = resolveLocale();
  const catalog = catalogs[locale] ?? catalogs.en;
  let out = catalog[key] ?? en[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return out;
}

export function registerCatalog(locale: string, catalog: Catalog) {
  catalogs[locale] = catalog;
}
