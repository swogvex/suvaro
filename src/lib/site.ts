/** Site-wide facts used in structured data. */
export const siteName = 'Suvaro';

/**
 * Holder of the site (a private individual), used as `author` in structured data.
 * Stays null until the owner fills `[HOLDER NAME]` in the legal texts; then set it here too.
 */
export const holderName: string | null = null;

/** Sample month used in designs and on the landing (see docs: concepts). Integer cents. */
export const sampleMonth = {
  incomeCents: 185_000,
  expensesCents: 121_240,
  setAsideCents: 15_000,
  availableCents: 48_760,
  daysLeft: 21,
  foodSpentCents: 24_600,
  foodLimitCents: 30_000,
} as const;
