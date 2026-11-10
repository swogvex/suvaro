import { describe, expect, it } from 'vitest';
import type { Movement } from '../../src/lib/movements/model';
import { csvCell, movementsCsv, type CsvLabels } from '../../src/lib/stats/csv';

const movements: Movement[] = [
  {
    id: '02',
    type: 'expense',
    amountCents: 123_456,
    categoryId: 'food',
    date: '2026-11-05',
    note: 'Café; "bio"',
    recurring: false,
  },
  {
    id: '01',
    type: 'income',
    amountCents: 185_000,
    categoryId: null,
    date: '2026-11-01',
    note: 'Nómina',
    recurring: true,
  },
  {
    id: '03',
    type: 'expense',
    amountCents: 5,
    categoryId: null,
    date: '2026-11-05',
    note: '=HYPERLINK("x")',
    recurring: false,
  },
];

const labels = (headers: CsvLabels['headers'], income: string, expense: string): CsvLabels => ({
  headers,
  income,
  expense,
  category: (m) => (m.type === 'income' ? income : m.categoryId === 'food' ? 'Comida' : 'Sin categoría'),
});

describe('CSV export', () => {
  it('writes Spanish CSV with BOM, semicolons and decimal commas, oldest first', () => {
    const csv = movementsCsv(
      movements,
      'es',
      labels(['Fecha', 'Tipo', 'Categoría', 'Importe', 'Nota'], 'Ingreso', 'Gasto'),
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Fecha;Tipo;Categoría;Importe;Nota',
      '2026-11-01;Ingreso;Ingreso;1850,00;Nómina',
      '2026-11-05;Gasto;Comida;1234,56;"Café; ""bio"""',
      `2026-11-05;Gasto;Sin categoría;0,05;"'=HYPERLINK(""x"")"`,
      '',
    ]);
  });

  it('writes English CSV with commas and decimal points', () => {
    const csv = movementsCsv(
      movements.slice(0, 1),
      'en',
      labels(['Date', 'Type', 'Category', 'Amount', 'Note'], 'Income', 'Expense'),
    );
    expect(csv.slice(1).split('\r\n')[1]).toBe('2026-11-05,Expense,Comida,1234.56,"Café; ""bio"""');
  });

  it('quotes only when needed and neutralises formulas', () => {
    expect(csvCell('plain', ',')).toBe('plain');
    expect(csvCell('a,b', ',')).toBe('"a,b"');
    expect(csvCell('a,b', ';')).toBe('a,b');
    expect(csvCell('line\nbreak', ';')).toBe('"line\nbreak"');
    expect(csvCell('+34 600', ';')).toBe(`"'+34 600"`);
    expect(csvCell('-5', ';')).toBe(`"'-5"`);
    expect(csvCell('@sum', ';')).toBe(`"'@sum"`);
  });
});
