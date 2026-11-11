/**
 * Categories as Settings › Categories edits them (shared by server and island; no Zod here).
 * Names are the user's own text; colors are `--cat-1…8`; icons come from the own set.
 */
import type { IconName } from '../icons';

export const CATEGORY_MAX = 50;
export const CATEGORY_NAME_MAX = 30;

/** The icon grid of the editor (~40), grouped loosely: home, food, transport, fun, health, work, other. */
export const categoryIcons = [
  'house',
  'sofa',
  'bed',
  'zap',
  'droplet',
  'wifi',
  'phone',
  'utensils',
  'shopping-cart',
  'coffee',
  'wine',
  'bus',
  'car',
  'fuel',
  'train',
  'bike',
  'plane',
  'ticket',
  'film',
  'music',
  'gamepad',
  'camera',
  'heart-pulse',
  'pill',
  'dumbbell',
  'sparkles',
  'scissors',
  'shirt',
  'shopping-bag',
  'book',
  'graduation-cap',
  'briefcase',
  'laptop',
  'repeat',
  'receipt',
  'landmark',
  'umbrella',
  'wrench',
  'gift',
  'baby',
  'paw',
  'sprout',
  'dots',
] as const satisfies readonly IconName[];

export type CategoryIcon = (typeof categoryIcons)[number];
export type ColorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** One row of the list: the category and how many movements use it (this cycle and in total). */
export interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  color: ColorIndex;
  thisMonth: number;
  total: number;
}

export interface CategoryFields {
  name: string;
  icon: CategoryIcon;
  color: ColorIndex;
}
