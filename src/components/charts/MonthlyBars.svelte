<!--
  Monthly bars (own SVG): spending per month with its value on top and the month below. The running month
  is a dashed outline at 35 % fill; months that spent more than they earned use `--accent-2`; a dashed
  `--positive` line marks the average income, named by a key in the top-left corner (above the bars, so
  it never covers a value). Values have a halo where the line crosses them. The viewBox follows the real width.
  Props:
    bars        `{ key, label, cents, inProgress, over }[]`, oldest first.
    average     Average income in cents, or null for no line.
    averageLabel  Text of the average line.
    label       Accessible summary (role="img").
    format      Cents → short money text.
-->
<script lang="ts">
  interface Bar {
    key: string;
    label: string;
    cents: number;
    inProgress: boolean;
    over: boolean;
  }

  interface Props {
    bars: readonly Bar[];
    average: number | null;
    averageLabel: string;
    label: string;
    format: (cents: number) => string;
  }

  let { bars, average, averageLabel, label, format }: Props = $props();

  let width = $state(0);
  const W = $derived(width > 0 ? width : 480);
  const H = 210;
  const TOP = 46;
  const BOTTOM = 26;

  const top = $derived(Math.max(...bars.map((bar) => bar.cents), average ?? 0, 1));
  const slot = $derived(W / Math.max(bars.length, 1));
  const barWidth = $derived(Math.min(slot * 0.58, 56));
  const y = (cents: number) => TOP + (1 - cents / top) * (H - TOP - BOTTOM);
  const cx = (index: number) => slot * index + slot / 2;
  /** Bar height in px: at least 2 px for any spending, so a small month is still visible. */
  const height = (cents: number) => Math.max(H - BOTTOM - y(cents), cents > 0 ? 2 : 0);
</script>

<div class="bars" role="img" aria-label={label} bind:clientWidth={width}>
  <svg viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true" focusable="false">
    <line class="bars__base" x1="0" x2={W} y1={H - BOTTOM} y2={H - BOTTOM} />
    {#each bars as bar, index (bar.key)}
      <rect
        class={['bars__bar', bar.over && 'bars__bar--over', bar.inProgress && 'bars__bar--running']}
        x={cx(index) - barWidth / 2}
        y={H - BOTTOM - height(bar.cents)}
        width={barWidth}
        height={height(bar.cents)}
        rx="4"
        stroke-dasharray={bar.inProgress ? '4 3' : undefined}
      />
    {/each}
    {#if average !== null}
      <line class="bars__average" x1="0" x2={W} y1={y(average)} y2={y(average)} stroke-dasharray="6 5" />
      <line class="bars__average" x1="0" x2="18" y1="8" y2="8" stroke-dasharray="6 3" />
      <text class="bars__average-label" x="24" y="12">{averageLabel}</text>
    {/if}
    {#each bars as bar, index (bar.key)}
      <text class="bars__value" x={cx(index)} y={H - BOTTOM - height(bar.cents) - 6} text-anchor="middle">
        {format(bar.cents)}
      </text>
      <text class="bars__month" x={cx(index)} y={H - 7} text-anchor="middle">{bar.label}</text>
    {/each}
  </svg>
</div>

<style>
  .bars {
    width: 100%;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .bars__base {
    stroke: var(--line);
  }

  .bars__bar {
    fill: var(--accent);
  }

  .bars__bar--over {
    fill: var(--accent-2);
  }

  .bars__bar--running {
    fill-opacity: 0.35;
    stroke: var(--accent);
    stroke-width: 1.5;
  }

  .bars__bar--over.bars__bar--running {
    stroke: var(--accent-2);
  }

  .bars__value {
    fill: var(--ink-2);
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 3px;
    stroke-linejoin: round;
    font-size: 12px;
    font-weight: 600;
  }

  .bars__month {
    fill: var(--ink-3);
    font-size: 12px;
  }

  .bars__average {
    stroke: var(--positive);
    stroke-width: 1.5;
  }

  .bars__average-label {
    fill: var(--positive);
    font-size: 12px;
    font-weight: 600;
  }
</style>
