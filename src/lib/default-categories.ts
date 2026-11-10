/** The 12 categories offered at onboarding. Names come from i18n (`category.<key>`); colors are `c1`…`c8`. */
import type { IconName } from './icons';

export type CategoryColor = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8';

export const defaultCategories = [
  { key: 'housing', icon: 'house', color: 'c7' },
  { key: 'food', icon: 'utensils', color: 'c1' },
  { key: 'transport', icon: 'bus', color: 'c5' },
  { key: 'leisure', icon: 'ticket', color: 'c2' },
  { key: 'health', icon: 'heart-pulse', color: 'c6' },
  { key: 'subscriptions', icon: 'repeat', color: 'c4' },
  { key: 'clothing', icon: 'shirt', color: 'c3' },
  { key: 'education', icon: 'book', color: 'c8' },
  { key: 'gifts', icon: 'gift', color: 'c6' },
  { key: 'travel', icon: 'plane', color: 'c5' },
  { key: 'pets', icon: 'paw', color: 'c3' },
  { key: 'other', icon: 'dots', color: 'c7' },
] as const satisfies readonly { key: string; icon: IconName; color: CategoryColor }[];

export type DefaultCategoryKey = (typeof defaultCategories)[number]['key'];

export const defaultCategoryKeys: readonly DefaultCategoryKey[] = defaultCategories.map(({ key }) => key);

export function isDefaultCategoryKey(value: string): value is DefaultCategoryKey {
  return (defaultCategoryKeys as readonly string[]).includes(value);
}

/** `c3` → 3, for `CategoryTile`'s `color` prop. */
export function colorIndex(color: CategoryColor): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  return Number(color.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}
