import { describe, expect, it } from 'vitest';
import { serviceWorkerSource } from '../../src/pages/sw.js';

describe('service worker source', () => {
  const pages = { en: '/offline', es: '/es/sin-conexion' };
  const source = serviceWorkerSource('abc', pages);

  it('is valid JavaScript', () => {
    expect(() => new Function(source)).not.toThrow();
  });

  it('versions its cache with the build stamp and lists both offline pages', () => {
    expect(source).toContain("const CACHE = 'suvaro-offline-abc'");
    expect(source).toContain(JSON.stringify(pages));
  });

  it('only answers navigations and offline-page assets', () => {
    expect(source).toContain("request.mode === 'navigate'");
    expect(source).not.toMatch(/\/api\//);
  });
});
