<!--
  Line icon for Svelte islands (same set and markup as Icon.astro). Decorative (`aria-hidden`).
  Props: name (icon name), class (extra classes).
-->
<script lang="ts">
  import { icons, type IconName } from '../../lib/icons';

  interface Props {
    name: IconName;
    class?: string;
  }

  let { name, class: className }: Props = $props();
</script>

<svg
  class={className}
  viewBox="0 0 24 24"
  width="24"
  height="24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <g>
    <!-- Static markup from src/lib/icons.ts, never user data. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html icons[name]}
  </g>
</svg>
