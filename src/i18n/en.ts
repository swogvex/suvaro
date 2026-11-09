/** English UI strings. Source of the key set: every other locale must have exactly these keys. */
export const en = {
  'meta.siteName': 'Suvaro',
  'meta.hello.title': 'Suvaro — a calm way to track your expenses',
  'meta.hello.description':
    'Suvaro is a simple, private expense tracker. Type your income and expenses by hand and see where your money goes.',
  'a11y.skipToContent': 'Skip to content',
  'hello.heading': 'Hello from Suvaro',
  'hello.body': 'A calm, simple way to track your expenses by hand. We are building it right now.',
  'hello.switchLanguage': 'Ver en español',
} as const;

export type UiKey = keyof typeof en;
