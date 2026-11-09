import type { UiKey } from './en';

/** Spanish UI strings. `satisfies` makes a missing or extra key a type error. */
export const es = {
  'meta.siteName': 'Suvaro',
  'meta.hello.title': 'Suvaro — una forma tranquila de controlar tus gastos',
  'meta.hello.description':
    'Suvaro es una app sencilla y privada para el control de gastos. Apunta a mano tus ingresos y gastos y mira a dónde va tu dinero.',
  'a11y.skipToContent': 'Saltar al contenido',
  'hello.heading': 'Hola desde Suvaro',
  'hello.body':
    'Una forma tranquila y sencilla de controlar tus gastos a mano. La estamos construyendo ahora mismo.',
  'hello.switchLanguage': 'View in English',
} as const satisfies Record<UiKey, string>;
