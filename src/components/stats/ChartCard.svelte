<!--
  A Stats card: title, text summary, the chart and a "View as table" toggle that renders the same numbers
  as a real <table> inside a focusable scroll box.
  Props:
    id          Base for element ids.
    title       Card title (h2).
    summary     One-sentence summary under the title.
    caption     Optional line under the chart (e.g. which months went over).
    showTable   False hides the chart and toggle (nothing to show).
    t           Translator.
    chart, table  Snippets.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Translate } from '../../i18n/client';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    id: string;
    title: string;
    summary: string;
    caption?: string;
    showTable?: boolean;
    t: Translate;
    chart: Snippet;
    table: Snippet;
    legend?: Snippet;
  }

  let { id, title, summary, caption, showTable: hasData = true, t, chart, table, legend }: Props = $props();

  let open = $state(false);
</script>

<section class="card chart-card" aria-labelledby="{id}-title" data-testid={id}>
  <h2 id="{id}-title">{title}</h2>
  <p class="chart-card__summary">{summary}</p>
  {#if hasData}
    {@render legend?.()}
    {@render chart()}
    {#if caption}<p class="chart-card__caption">{caption}</p>{/if}
    <button
      class="btn btn--ghost chart-card__toggle"
      type="button"
      aria-expanded={open}
      aria-controls="{id}-table"
      onclick={() => (open = !open)}
    >
      <Icon name="list" />
      {open ? t('stats.tableHide') : t('stats.tableShow')}
    </button>
    <!-- Scrollable, so it takes keyboard focus (arrow keys scroll it). -->
    <div
      id="{id}-table"
      class="chart-card__table"
      hidden={!open}
      tabindex={open ? 0 : -1}
      role="region"
      aria-label={t('stats.tableLabel', { title })}
    >
      {#if open}{@render table()}{/if}
    </div>
  {/if}
</section>

<style>
  .chart-card {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    min-width: 0;
  }

  .chart-card__summary {
    color: var(--ink-2);
  }

  .chart-card__caption {
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .chart-card__toggle {
    justify-self: start;
  }

  .chart-card__table {
    max-height: 20rem;
    overflow: auto;
  }

  .chart-card__table :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .chart-card__table :global(th),
  .chart-card__table :global(td) {
    padding: var(--space-1) var(--space-2);
    border-block-end: 1px solid var(--line);
    text-align: end;
    white-space: nowrap;
  }

  .chart-card__table :global(th:first-child) {
    text-align: start;
  }

  .chart-card__table :global(thead th) {
    position: sticky;
    inset-block-start: 0;
    background: var(--surface);
    color: var(--ink-2);
  }
</style>
