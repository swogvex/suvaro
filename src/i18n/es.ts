import type { UiKey } from './en';

/** Spanish UI strings. `satisfies` makes a missing or extra key a type error. */
export const es = {
  'meta.siteName': 'Suvaro',
  'meta.ogImageAlt': 'Suvaro — control de gastos con calma. Te queda este mes: 487,60 €.',

  'a11y.skipToContent': 'Saltar al contenido',

  'nav.label': 'Principal',
  'nav.how': 'Cómo funciona',
  'nav.data': 'Tus datos',
  'nav.faq': 'Preguntas',
  'nav.signIn': 'Entrar',
  'nav.homeLabel': 'Suvaro, portada',

  'lang.name': 'Español',
  'lang.switchLabel': 'Idioma',
  'lang.noticeText': 'Esta página también está en español.',
  'lang.noticeLink': 'Ver en español',
  'lang.noticeDismiss': 'Cerrar',

  'theme.label': 'Tema',
  'theme.system': 'Auto',
  'theme.light': 'Claro',
  'theme.dark': 'Oscuro',

  'footer.legalLabel': 'Legal',
  'footer.disclaimer': 'Suvaro no es un servicio financiero y no da asesoramiento financiero.',
  'footer.notice': 'Aviso legal',
  'footer.privacy': 'Privacidad',
  'footer.cookies': 'Cookies',
  'footer.terms': 'Términos',
  'footer.credits': 'Créditos',

  'landing.howTitle': 'Cómo funciona',
  'landing.faqTitle': 'Preguntas',
  'landing.sampleLabel': 'Ejemplo de la app con números de muestra',
  'landing.sampleBadge': 'Ejemplo',

  'sample.available': 'Te queda este mes',
  'sample.spent': 'Gastado',
  'sample.setAside': 'Apartado',
  'sample.free': 'Libre',
  'sample.perDay': 'Unos {amount} al día · quedan {days} días',
  'sample.budgetTitle': 'Presupuesto de comida',
  'sample.budgetOf': '{spent} de {limit}',
  'sample.budgetAtRisk': 'En riesgo',
  'sample.budgetPct': '{pct} % usado',

  'legal.updated': 'Última actualización: {date}',
  'legal.back': 'Volver a la portada',

  'notFound.sceneLabel':
    'Una pasarela de madera que se corta en un claro del bosque, con un poste que señala el camino de vuelta',
  'notFound.sign': 'Inicio',

  'category.food': 'Comida',
} as const satisfies Record<UiKey, string>;
