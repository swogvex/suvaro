import { describe, expect, it } from 'vitest';
import { accentFor, parseAccent, parseMode, resolveMode, themeInitScript } from '../../src/lib/theme';
import { profilePatchInput } from '../../src/lib/settings/schema';

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

  it('signed in, the script uses the profile choice from <html> and ignores localStorage', () => {
    const run = new Function('document', 'localStorage', 'matchMedia', themeInitScript);
    const stored = { getItem: () => 'dark' };
    const page = (pref: string) => ({
      dataset: { pref, day: 'red', night: 'green' } as Record<string, string>,
    });

    const light = page('light');
    run({ documentElement: light }, stored, () => ({ matches: true }));
    expect(light.dataset).toMatchObject({ mode: 'light', accent: 'red' });

    const systemDark = page('system');
    run({ documentElement: systemDark }, stored, () => ({ matches: true }));
    expect(systemDark.dataset).toMatchObject({ mode: 'dark', accent: 'green' });

    const systemLight = page('system');
    run({ documentElement: systemLight }, stored, () => ({ matches: false }));
    expect(systemLight.dataset).toMatchObject({ mode: 'light', accent: 'red' });
  });

  it('parses accents and defaults to blue', () => {
    expect(parseAccent('green')).toBe('green');
    expect(parseAccent('purple')).toBe('blue');
    expect(parseAccent(undefined)).toBe('blue');
  });
});

describe('profile patch', () => {
  it('accepts any subset of the theme fields', () => {
    expect(profilePatchInput.safeParse({ mode: 'dark' }).success).toBe(true);
    expect(profilePatchInput.safeParse({ themeDay: 'red', themeNight: 'green' }).success).toBe(true);
  });

  it('refuses empty bodies, unknown keys and values outside the lists', () => {
    expect(profilePatchInput.safeParse({}).success).toBe(false);
    expect(profilePatchInput.safeParse({ mode: 'dark', userId: 'x' }).success).toBe(false);
    expect(profilePatchInput.safeParse({ mode: 'sepia' }).success).toBe(false);
    expect(profilePatchInput.safeParse({ themeNight: 'purple' }).success).toBe(false);
  });
});
