/**
 * CSV export of the movements shown in Stats (`10-spec-stats.md`): UTF-8 with BOM (Excel needs it to read
 * accents), `;` separator and decimal comma for Spanish, `,` and decimal point for English, CRLF lines.
 * Columns: date, type, category, amount (positive; the type says which way), note. Oldest first.
 */
import type { Locale } from '../../i18n';
import { centsToInput } from '../money';
import type { Movement } from '../movements/model';

export const CSV_BOM = '\uFEFF';
export const csvSeparator: Record<Locale, string> = { en: ',', es: ';' };

export interface CsvLabels {
  headers: readonly [date: string, type: string, category: string, amount: string, note: string];
  income: string;
  expense: string;
  /** The category name for a movement (income and deleted categories included). */
  category: (movement: Movement) => string;
}

/** Quotes a cell when needed; cells that a spreadsheet would run as a formula get a leading apostrophe. */
export function csvCell(value: string, separator: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return safe.includes(separator) || /["\r\n]/.test(safe) || safe !== value
    ? `"${safe.replaceAll('"', '""')}"`
    : safe;
}

export function movementsCsv(movements: readonly Movement[], locale: Locale, labels: CsvLabels): string {
  const separator = csvSeparator[locale];
  const line = (cells: readonly string[]) => cells.map((cell) => csvCell(cell, separator)).join(separator);
  const sorted = [...movements].sort((a, b) =>
    a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
  const rows = sorted.map((movement) =>
    line([
      movement.date,
      movement.type === 'income' ? labels.income : labels.expense,
      labels.category(movement),
      centsToInput(movement.amountCents, locale),
      movement.note,
    ]),
  );
  return `${CSV_BOM}${[line(labels.headers), ...rows].join('\r\n')}\r\n`;
}
