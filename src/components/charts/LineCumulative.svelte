<!--
  Cumulative line chart (own SVG): this cycle (solid, up to today, current point marked) against the
  previous cycle (dashed). Direct labels at the line ends instead of a legend. The viewBox follows the
  rendered width, so text stays at its real size on phones. Decorative: the caller shows the text summary
  and the table.
  Props:
    current         Cumulative cents by day of this cycle so far (element 0 = day 1).
    previous        Cumulative cents by day of the previous cycle.
    days            Length of this cycle (the x axis).
    currentLabel, previousLabel   Direct labels.
    tick            Label for a 0-based day index on the x axis.
    format          Cents → short money text for the top gridline.
-->
<script lang="ts">
  interface Props {
    current: readonly number[];
    previous: readonly number[];
    days: number;
    currentLabel: string;
    previousLabel: string;
    tick: (index: number) => string;
    format: (cents: number) => string;
  }

  let { current, previous, days, currentLabel, previousLabel, tick, format }: Props = $props();

  let width = $state(0);
  const W = $derived(width > 0 ? width : 640);
  const H = 200;
  const TOP = 30;
  const BOTTOM = 24;
  const SIDE = 6;

  const span = $derived(Math.max(days, previous.length, 2) - 1);
  const top = $derived(Math.max(current.at(-1) ?? 0, previous.at(-1) ?? 0, 1));
  const x = (index: number) => SIDE + (index / span) * (W - SIDE * 2);
  const y = (cents: number) => TOP + (1 - cents / top) * (H - TOP - BOTTOM);

  function path(values: readonly number[]): string {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  }

  const end = $derived(current.length > 0 ? { x: x(current.length - 1), y: y(current.at(-1) ?? 0) } : null);
  const previousEnd = $derived(
    previous.length > 0 ? { x: x(previous.length - 1), y: y(previous.at(-1) ?? 0) } : null,
  );

  /** Text anchored towards the inside of the chart, so labels never leave it. */
  const anchor = (px: number) => (px > W * 0.6 ? 'end' : 'start');

  const labels = $derived.by(() => {
    const result: { x: number; y: number; text: string; tone: 'current' | 'previous' }[] = [];
    if (end) result.push({ x: end.x, y: Math.max(end.y - 12, 14), text: currentLabel, tone: 'current' });
    if (previousEnd) {
      let py = Math.max(previousEnd.y - 12, 14);
      // Keep the two labels apart.
      if (end && Math.abs(previousEnd.x - end.x) < 140 && Math.abs(py - (result[0]?.y ?? 0)) < 16) {
        py = previousEnd.y + 20;
      }
      result.push({
        x: previousEnd.x,
        y: Math.min(py, H - BOTTOM - 4),
        text: previousLabel,
        tone: 'previous',
      });
    }
    return result;
  });

  const ticks = $derived([0, Math.floor((days - 1) / 2), days - 1]);
</script>

<div class="line" bind:clientWidth={width}>
  <svg viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true" focusable="false">
    <line class="line__grid" x1={SIDE} x2={W - SIDE} y1={TOP} y2={TOP} />
    <text class="line__axis" x={SIDE} y={TOP - 8}>{format(top)}</text>
    <line class="line__base" x1={SIDE} x2={W - SIDE} y1={H - BOTTOM} y2={H - BOTTOM} />
    {#each ticks as index (index)}
      <text class="line__axis" x={x(index)} y={H - 6} text-anchor={index === 0 ? 'start' : anchor(x(index))}>
        {tick(index)}
      </text>
    {/each}
    {#if previous.length > 1}
      <path class="line__previous" d={path(previous)} stroke-dasharray="5 5" />
    {/if}
    {#if current.length > 1}
      <path class="line__current" d={path(current)} />
    {/if}
    {#if end}
      <circle class="line__point" cx={end.x} cy={end.y} r="4.5" />
    {/if}
    {#each labels as label (label.tone)}
      <text
        class="line__label line__label--{label.tone}"
        x={label.x}
        y={label.y}
        text-anchor={anchor(label.x)}
      >
        {label.text}
      </text>
    {/each}
  </svg>
</div>

<style>
  .line {
    width: 100%;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .line__grid {
    stroke: var(--line);
    stroke-dasharray: 2 4;
  }

  .line__base {
    stroke: var(--line);
  }

  .line__axis {
    fill: var(--ink-3);
    font-size: 12px;
  }

  .line__previous,
  .line__current {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .line__previous {
    stroke: var(--ink-3);
    stroke-width: 1.5;
  }

  .line__current {
    stroke: var(--accent);
    stroke-width: 2.25;
  }

  .line__point {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2;
  }

  .line__label {
    font-size: 12px;
    font-weight: 600;
  }

  .line__label--current {
    fill: var(--ink);
  }

  .line__label--previous {
    fill: var(--ink-2);
  }
</style>
