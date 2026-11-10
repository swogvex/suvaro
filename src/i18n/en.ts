/** English UI strings. Source of the key set: every other locale must have exactly these keys. */
export const en = {
  'meta.siteName': 'Suvaro',
  'meta.ogImageAlt': 'Suvaro — a calm expense tracker. Left this month: €487.60.',

  'a11y.skipToContent': 'Skip to content',

  'nav.label': 'Main',
  'nav.how': 'How it works',
  'nav.data': 'Your data',
  'nav.faq': 'FAQ',
  'nav.signIn': 'Sign in',
  'nav.homeLabel': 'Suvaro, homepage',

  'lang.name': 'English',
  'lang.switchLabel': 'Language',
  'lang.noticeText': 'This page is also available in English.',
  'lang.noticeLink': 'View in English',
  'lang.noticeDismiss': 'Close',

  'theme.label': 'Theme',
  'theme.system': 'Auto',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  'footer.legalLabel': 'Legal',
  'footer.disclaimer': 'Suvaro is not a financial service and gives no financial advice.',
  'footer.notice': 'Legal notice',
  'footer.privacy': 'Privacy',
  'footer.cookies': 'Cookies',
  'footer.terms': 'Terms',
  'footer.credits': 'Credits',

  'landing.howTitle': 'How it works',
  'landing.faqTitle': 'Questions',
  'landing.sampleLabel': 'Example of the app with sample numbers',
  'landing.sampleBadge': 'Example',

  'sample.available': 'Left this month',
  'sample.spent': 'Spent',
  'sample.setAside': 'Set aside',
  'sample.free': 'Left',
  'sample.perDay': 'About {amount} a day · {days} days left',
  'sample.budgetTitle': 'Food budget',
  'sample.budgetOf': '{spent} of {limit}',
  'sample.budgetAtRisk': 'At risk',
  'sample.budgetPct': '{pct} % used',

  'legal.updated': 'Last updated {date}',
  'legal.back': 'Back to the homepage',

  'notFound.sceneLabel':
    'A wooden boardwalk that stops in a forest clearing, with a signpost pointing back home',
  'notFound.sign': 'Home',

  'category.food': 'Food',
} as const;

export type UiKey = keyof typeof en;
