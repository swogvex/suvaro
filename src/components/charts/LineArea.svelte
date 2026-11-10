<!--
  Line with a soft area (own SVG) for cumulative savings: the area fills towards zero, the starting value
  is labelled at the first point and the last point is highlighted with its value. A zero line shows when
  the values cross it. The viewBox follows the real width, so text keeps its size on phones.
  Props:
    values      Cents per point, oldest first.
    first, last Tick labels for the first and last point.
    label       Accessible summary (role="img").
    format      Cents → money text.
-->
<script lang="ts">
  interface Props {
    values: readonly number[];
    first: string;
    last: string;
    label: string;
    format: (cents: number) => string;
  }

  let { values, first, last, label, format }: Props = $props();

  let width = $state(0);
  const W = $derived(width > 0 ? width : 480);
  const H = 190;
  const TOP = 30;
  const BOTTOM = 26;
  const SIDE = 6;

  const high = $derived(Math.max(...values, 0));
  const low = $derived(Math.min(...values, 0));
  const span = $derived(high - low || 1);
  const x = (index: number) =>
    SIDE + (values.length > 1 ? index / (values.length - 1) : 0.5) * (W - SIDE * 2);
  const y = (cents: number) => TOP + ((high - cents) / span) * (H - TOP - BOTTOM);

  const line = $derived(
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' '),
  );
  const area = $derived(
    values.length > 1
      ? `${line} L${x(values.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`
      : '',
  );
  const end = $derived(values.length > 0 ? { x: x(values.length - 1), y: y(values.at(-1) ?? 0) } : null);
  /** Labels sit above their point, below it when the point is near the top. */
  const above = (py: number) => (py - 12 < 12 ? py + 20 : py - 12);
  const anchor = (px: number) => (px > W * 0.6 ? 'end' : px < W * 0.4 ? 'start' : 'middle');
</script>

<div class="area" role="img" aria-label={label} bind:clientWidth={width}>
  <svg viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true" focusable="false">
    <line class="area__base" x1={SIDE} x2={W - SIDE} y1={H - BOTTOM} y2={H - BOTTOM} />
    {#if low < 0 && high > 0}
      <line class="area__zero" x1={SIDE} x2={W - SIDE} y1={y(0)} y2={y(0)} stroke-dasharray="2 4" />
    {/if}
    {#if area}
      <path class="area__fill" d={area} />
      <path class="area__line" d={line} />
    {/if}
    {#if values.length > 1}
      <circle class="area__start" cx={x(0)} cy={y(values[0] ?? 0)} r="3" />
      <text class="area__value area__value--start" x={x(0)} y={above(y(values[0] ?? 0))} text-anchor="start">
        {format(values[0] ?? 0)}
      </text>
    {/if}
    {#if end}
      <circle class="area__point" cx={end.x} cy={end.y} r="4.5" />
      <text class="area__value" x={end.x} y={above(end.y)} text-anchor={anchor(end.x)}>
        {format(values.at(-1) ?? 0)}
      </text>
    {/if}
    <text class="area__axis" x={SIDE} y={H - 7}>{first}</text>
    {#if values.length > 1}
      <text class="area__axis" x={W - SIDE} y={H - 7} text-anchor="end">{last}</text>
    {/if}
  </svg>
</div>

<style>
  .area {
    width: 100%;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .area__base,
  .area__zero {
    stroke: var(--line);
  }

  .area__fill {
    fill: var(--accent);
    fill-opacity: 0.12;
  }

  .area__line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.25;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .area__start {
    fill: var(--surface);
    stroke: var(--accent);
    stroke-width: 1.5;
  }

  .area__point {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2;
  }

  .area__value {
    fill: var(--ink);
    font-size: 12px;
    font-weight: 600;
  }

  .area__value--start {
    fill: var(--ink-2);
  }

  .area__axis {
    fill: var(--ink-3);
    font-size: 12px;
  }
</style>
