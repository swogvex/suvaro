<!--
  "Export" button with a small disclosure panel: CSV (spreadsheet) and PDF (opens the print dialog), and the
  caption "Exports {period} as you see it". Closes on Escape (focus back to the button) and outside clicks.
  Props:
    period    Label of the period shown.
    disabled  True until hydrated and while loading.
    onCsv, onPrint
    t
-->
<script lang="ts">
  import type { Translate } from '../../i18n/client';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    period: string;
    disabled: boolean;
    onCsv: () => void;
    onPrint: () => void;
    t: Translate;
  }

  let { period, disabled, onCsv, onPrint, t }: Props = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();

  function close(focus = false) {
    open = false;
    if (focus) button?.focus();
  }

  function pick(action: () => void) {
    close();
    action();
  }

  $effect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="export" bind:this={root}>
  <button
    bind:this={button}
    class="btn btn--secondary"
    type="button"
    aria-expanded={open}
    aria-controls="export-panel"
    {disabled}
    onclick={() => (open = !open)}
  >
    <Icon name="download" />
    {t('stats.export')}
  </button>
  <div id="export-panel" class="export__panel" hidden={!open}>
    <button class="export__item" type="button" onclick={() => pick(onCsv)}>
      <Icon name="sheet" />
      {t('stats.exportCsv')}
    </button>
    <button class="export__item" type="button" onclick={() => pick(onPrint)}>
      <Icon name="printer" />
      {t('stats.exportPdf')}
    </button>
    <p class="export__caption">{t('stats.exportCaption', { period })}</p>
  </div>
</div>

<style>
  .export {
    position: relative;
  }

  .export__panel {
    position: absolute;
    z-index: 20;
    inset-block-start: calc(100% + var(--space-2));
    inset-inline-end: 0;
    display: grid;
    gap: var(--space-1);
    width: max-content;
    max-width: min(18rem, calc(100vw - 2rem));
    padding: var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .export__panel[hidden] {
    display: none;
  }

  .export__item {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-height: 2.75rem;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-s);
    background: none;
    color: var(--ink);
    font: inherit;
    font-weight: 500;
    text-align: start;
    cursor: pointer;
  }

  .export__item:hover {
    background: var(--surface-2);
  }

  .export__item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .export__item :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .export__caption {
    padding: var(--space-1) var(--space-3) var(--space-2);
    color: var(--ink-2);
    font-size: 0.75rem;
  }
</style>
