<!--
  Horizontal stacked bar (own SVG, attributes only: the CSP forbids inline styles): spent / set aside / free.
  Decorative: the caller shows the values as text and gives the figure its accessible name.
  Props: segments  { value, tone }[] with tone spent | setAside | free.
-->
<script lang="ts">
  interface Props {
    segments: readonly { value: number; tone: 'spent' | 'setAside' | 'free' }[];
  }

  let { segments }: Props = $props();

  const GAP = 0.8;
  const rects = $derived.by(() => {
    const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
    if (total === 0) return [];
    let x = 0;
    return segments.flatMap((segment) => {
      const width = (Math.max(segment.value, 0) / total) * 100;
      if (width === 0) return [];
      const rect = { x, width: Math.max(width - GAP, 0.5), tone: segment.tone };
      x += width;
      return [rect];
    });
  });
</script>

<svg class="bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <rect class="bar__track" x="0" y="0" width="100" height="10" />
  {#each rects as r (r.tone)}
    <rect x={r.x} y="0" width={r.width} height="10" class="bar__{r.tone}" />
  {/each}
</svg>

<style>
  .bar {
    display: block;
    width: 100%;
    height: 0.75rem;
    border-radius: var(--radius-track);
  }

  .bar__track {
    fill: var(--surface);
    opacity: 0.6;
  }

  .bar__spent {
    fill: var(--accent-2);
  }

  .bar__setAside {
    fill: var(--accent);
  }

  .bar__free {
    fill: var(--surface);
  }
</style>
