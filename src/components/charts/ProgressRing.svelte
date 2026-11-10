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
  <text class="ring__text num" x="36" y="36" text-anchor="middle" dominant-baseline="central">{pct} %</text>
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
    font-size: 15px;
  }
</style>
