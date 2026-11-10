/** Translator for islands: works on the subset of strings the page passed in (see `pickMessages`). */
import type { UiKey } from './en';
import { interpolate } from './interpolate';

export type Messages = Partial<Record<UiKey, string>>;
export type Translate = (key: UiKey, vars?: Record<string, string | number>) => string;

export function translator(messages: Messages): Translate {
  return (key, vars) => {
    const text = messages[key] ?? key;
    return vars ? interpolate(text, vars) : text;
  };
}
