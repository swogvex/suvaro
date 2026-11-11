/**
 * The nine own avatars (art direction: line icon in `--cat-ink` on a category color, radius 8, no uploads).
 * Drawings live in `icons.ts` as `avatar-<name>`; each avatar has a fixed category color (`--cat-1…8`).
 */
import type { IconName } from './icons';

export const avatars = [
  'leaf',
  'stone',
  'fern',
  'mushroom',
  'wave',
  'mountain',
  'feather',
  'pinecone',
  'moon',
] as const;

export type Avatar = (typeof avatars)[number];

export const avatarColor: Record<Avatar, number> = {
  leaf: 3,
  stone: 7,
  fern: 8,
  mushroom: 1,
  wave: 5,
  mountain: 2,
  feather: 6,
  pinecone: 4,
  moon: 2,
};

export const avatarIcon = (avatar: Avatar): IconName => `avatar-${avatar}`;

export function isAvatar(value: unknown): value is Avatar {
  return typeof value === 'string' && (avatars as readonly string[]).includes(value);
}
