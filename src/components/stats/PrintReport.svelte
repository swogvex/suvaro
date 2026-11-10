<!--
  Print-only report (PDF export through the browser's print dialog): logo, period, totals, the category
  table and every movement of the period. Hidden on screen; `@media print` shows it on A4 instead of the
  dashboard. Colours come from the system (`CanvasText` on `Canvas`), so dark mode still prints dark on white.
  Props:
    data          The period shown.
    period        Its label.
    previousLabel Heading of the previous-period column.
    categoryName  Category id → name.
    today, locale, currency, t
-->
<script lang="ts">
  import type { Locale } from '../../i18n';
  import type { Translate } from '../../i18n/client';
  import { formatMoney } from '../../lib/money';
  import { shortDate } from '../../lib/movements/format';
  import type { StatsData } from '../../lib/stats/model';

  interface Props {
    data: StatsData;
    period: string;
    /** Heading of the previous-period column ("Previous, to the same day" while the period runs). */
    previousLabel: string;
    categoryName: (id: string | null) => string;
    today: string;
    locale: Locale;
    currency: string;
    t: Translate;
  }

  let { data, period, previousLabel, categoryName, today, locale, currency, t }: Props = $props();

  const money = (cents: number) => formatMoney(cents, locale, { currency });
  const signed = (cents: number) => formatMoney(cents, locale, { currency, sign: true });
  const ordered = $derived(
    [...data.movements].sort((a, b) =>
      a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
    ),
  );
</script>

<article class="print-report">
  <header class="print-report__head">
    <img src="/brand/symbol.svg" alt="" width="28" height="28" />
    <div>
      <p class="print-report__brand">Suvaro · {t('app.stats')}</p>
      <h1>{period}</h1>
      <p class="print-report__date">{t('stats.printDate', { date: shortDate(today, locale) })}</p>
    </div>
  </header>

  <dl class="print-report__totals">
    <div>
      <dt>{t('stats.income')}</dt>
      <dd>{money(data.totals.incomeCents)}</dd>
    </div>
    <div>
      <dt>{t('stats.expenses')}</dt>
      <dd>{money(data.totals.expenseCents)}</dd>
    </div>
    <div>
      <dt>{t('stats.savings')}</dt>
      <dd>{money(data.totals.savingsCents)}</dd>
    </div>
  </dl>

  {#if data.categories.length > 0}
    <h2>{t('stats.categoryTitle')}</h2>
    <table>
      <thead>
        <tr>
          <th scope="col">{t('stats.colCategory')}</th>
          <th scope="col">{t('stats.thisPeriod')}</th>
          <th scope="col">{previousLabel}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.categories as row (row.categoryId ?? 'none')}
          <tr>
            <th scope="row">{categoryName(row.categoryId)}</th>
            <td>{money(row.currentCents)}</td>
            <td>{money(row.previousCents)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <h2>{t('stats.printMovements')}</h2>
  {#if ordered.length > 0}
    <table>
      <thead>
        <tr>
          <th scope="col" class="w-date">{t('stats.colDate')}</th>
          <th scope="col" class="print-report__text">{t('stats.colCategory')}</th>
          <th scope="col" class="print-report__text">{t('stats.colNote')}</th>
          <th scope="col">{t('stats.colAmount')}</th>
        </tr>
      </thead>
      <tbody>
        {#each ordered as movement (movement.id)}
          <tr>
            <th scope="row">{shortDate(movement.date, locale)}</th>
            <td class="print-report__text"
              >{movement.type === 'income' ? t('stats.income') : categoryName(movement.categoryId)}</td
            >
            <td class="print-report__text">{movement.note}</td>
            <td>{signed(movement.type === 'income' ? movement.amountCents : -movement.amountCents)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p>{t('stats.printEmpty')}</p>
  {/if}
</article>

<style>
  .print-report {
    display: none;
  }

  @media print {
    .print-report {
      display: grid;
      gap: 5mm;
      color: CanvasText;
      background: Canvas;
      font-size: 10pt;
    }

    .print-report__head {
      display: flex;
      gap: 4mm;
      align-items: center;
    }

    .print-report h1 {
      font-size: 16pt;
    }

    .print-report h2 {
      margin-block-start: 3mm;
      font-size: 12pt;
      break-after: avoid;
    }

    .print-report__brand,
    .print-report__date {
      font-size: 9pt;
    }

    .print-report__totals {
      display: flex;
      gap: 10mm;
      margin: 0;
    }

    .print-report__totals dd {
      margin: 0;
      font-size: 12pt;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    thead {
      display: table-header-group;
    }

    tr {
      break-inside: avoid;
    }

    th,
    td {
      padding: 1.2mm 2mm;
      border-block-end: 0.2mm solid color-mix(in srgb, CanvasText 25%, transparent);
      text-align: end;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }

    th:first-child,
    .print-report__text {
      text-align: start;
    }

    .w-date {
      width: 24mm;
    }

    thead th {
      font-weight: 600;
    }

    tbody th {
      font-weight: 400;
      white-space: nowrap;
    }
  }
</style>
