/** Rough device label for the sessions list ("Chrome on Windows"). Pure; unit-tested. */
export interface DeviceInfo {
  browser: string | null;
  os: string | null;
  mobile: boolean;
}

const browsers: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const systems: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

export function describeUserAgent(userAgent: string | null | undefined): DeviceInfo {
  const ua = userAgent ?? '';
  const browser = browsers.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const os = systems.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  return { browser, os, mobile: /Mobile|Android|iPhone|iPad/.test(ua) };
}
