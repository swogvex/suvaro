import { describe, expect, it } from 'vitest';
import { accentFor, parseMode, resolveMode, themeInitScript } from '../../src/lib/theme';

describe('theme', () => {
  it('parses stored modes and defaults to system', () => {
    expect(parseMode('light')).toBe('light');
    expect(parseMode('dark')).toBe('dark');
    expect(parseMode('system')).toBe('system');
    expect(parseMode(null)).toBe('system');
    expect(parseMode('purple')).toBe('system');
  });

  it('resolves system from the OS preference', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('uses the day accent in light and the night accent in dark', () => {
    expect(accentFor('light', 'red', 'green')).toBe('red');
    expect(accentFor('dark', 'red', 'green')).toBe('green');
  });

  it('the inline script sets mode and accent before paint', () => {
    const root = { dataset: {} as Record<string, string> };
    const run = new Function('document', 'localStorage', 'matchMedia', themeInitScript);
    run({ documentElement: root }, { getItem: () => null }, () => ({ matches: true }));
    expect(root.dataset).toEqual({ mode: 'dark', accent: 'blue' });

    run({ documentElement: root }, { getItem: () => 'light' }, () => ({ matches: true }));
    expect(root.dataset['mode']).toBe('light');

    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    run({ documentElement: root }, blocked, () => ({ matches: false }));
    expect(root.dataset['mode']).toBe('light');
  });
});
