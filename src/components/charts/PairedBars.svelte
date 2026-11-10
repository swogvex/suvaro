<!--
  Paired horizontal bars (own SVG): this period (accent, 10 px) over the previous one (`--ink-3` at 45 %,
  6 px), one row per item with its name and both values on the right. The viewBox follows the real width,
  so bars keep round ends at any size. The caller passes the full summary in `label` (role="img") and
  offers the same numbers as a table.
  Props:
    rows      `{ id, name, icon, color, current, previous }[]`, already sorted.
    label     Accessible summary of the whole chart.
    format    Cents → money text.
-->
<script lang="ts">
  import type { IconName } from '../../lib/icons';
  import Icon from '../ui/Icon.svelte';

  interface Row {
    id: string;
    name: string;
    icon: IconName;
    color: number;
    current: number;
    previous: number;
  }

  interface Props {
    rows: readonly Row[];
    label: string;
    format: (cents: number) => string;
  }

  let { rows, label, format }: Props = $props();

  let width = $state(0);
  const W = $derived(width > 0 ? width : 320);
  const top = $derived(Math.max(...rows.map((row) => Math.max(row.current, row.previous)), 1));
  /** At least a dot for any value above zero. */
  const size = (cents: number) => (cents <= 0 ? 0 : Math.max((cents / top) * W, 6));
</script>

<div class="paired" role="img" aria-label={label} bind:clientWidth={width}>
  {#each rows as row (row.id)}
    <div class="paired__row">
      <span class="paired__name">
        <span class="cat-tile cat-tile--sm" data-color={row.color}><Icon name={row.icon} /></span>
        <span class="paired__text">{row.name}</span>
      </span>
      <span class="paired__values num">
        <strong>{format(row.current)}</strong>
        <span>{format(row.previous)}</span>
      </span>
      <svg
        class="paired__bars"
        viewBox="0 0 {W} 18"
        width={W}
        height="18"
        aria-hidden="true"
        focusable="false"
      >
        <rect class="paired__track" x="0" y="0" width={W} height="10" rx="5" />
        {#if row.current > 0}
          <rect class="paired__current" x="0" y="0" width={size(row.current)} height="10" rx="5" />
        {/if}
        {#if row.previous > 0}
          <rect class="paired__previous" x="0" y="12" width={size(row.previous)} height="6" rx="3" />
        {/if}
      </svg>
    </div>
  {/each}
</div>

<style>
  .paired {
    display: grid;
    gap: var(--space-4);
    width: 100%;
  }

  .paired__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2) var(--space-3);
    align-items: center;
  }

  .paired__name {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
    font-weight: 500;
  }

  .paired__text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .paired__values {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    white-space: nowrap;
  }

  .paired__values span {
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .paired__bars {
    display: block;
    grid-column: 1 / -1;
    width: 100%;
    height: 18px;
  }

  .paired__track {
    fill: var(--surface-2);
  }

  .paired__current {
    fill: var(--accent);
  }

  .paired__previous {
    fill: var(--ink-3);
    fill-opacity: 0.45;
  }
</style>
