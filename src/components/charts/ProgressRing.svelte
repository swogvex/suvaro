<!--
  Progress ring for goals (own SVG). The percentage is drawn in the middle; the ring itself is decorative,
  so the caller gives the text equivalent (`label`).
  Props: pct (0–100+, the ring is capped at 100), label (accessible text), size in px (default 72).
-->
<script lang="ts">
  interface Props {
    pct: number;
    label: string;
    size?: number;
  }

  let { pct, label, size = 72 }: Props = $props();

  const R = 30;
  const C = 2 * Math.PI * R;
  const filled = $derived((Math.min(Math.max(pct, 0), 100) / 100) * C);
  /** Room inside the stroke: 53 px. "100 %" at 15 px is ~50 px wide and touched the ring, so 3+ digits
   * get a smaller size (never under 12 px), and very long values are squeezed to fit (textLength). */
  const digits = $derived(String(pct).length);
  const fontSize = $derived(digits <= 2 ? 15 : 12);
  const squeeze = $derived(digits >= 4 ? 44 : undefined);
</script>

<svg class="ring" viewBox="0 0 72 72" width={size} height={size} role="img" aria-label={label}>
  <circle class="ring__track" cx="36" cy="36" r={R} />
  {#if filled > 0}
    <circle
      class="ring__value"
      cx="36"
      cy="36"
      r={R}
      stroke-dasharray="{filled} {C}"
      transform="rotate(-90 36 36)"
    />
  {/if}
  <text
    class="ring__text num"
    x="36"
    y="36"
    text-anchor="middle"
    dominant-baseline="central"
    font-size={fontSize}
    textLength={squeeze}
    lengthAdjust={squeeze ? 'spacingAndGlyphs' : undefined}>{pct} %</text
  >
</svg>

<style>
  .ring {
    flex: none;
  }

  .ring__track,
  .ring__value {
    fill: none;
    stroke-width: 7;
  }

  .ring__track {
    stroke: var(--surface-2);
  }

  .ring__value {
    stroke: var(--accent);
    stroke-linecap: round;
  }

  .ring__text {
    fill: var(--ink);
  }
</style>
