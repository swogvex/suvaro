<!--
  Modal dialog with a form (native <dialog>): title + close button, scrolling body, footer with actions.
  Centered 560 px on desktop, a full-screen sheet on phones (same look as the movement editor).
  Esc and the close button close it; focus returns to what opened it (native behaviour).
  Props:
    id        Base id (the title is `{id}-title`).
    title     Heading text.
    closeLabel  Accessible name of the close button.
    onsubmit  Form submit handler (Enter submits).
    onclose   Called after the dialog closes.
    body, footer  Snippets.
  Bind `dialog` to call `showModal()` / `close()`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    id: string;
    title: string;
    closeLabel: string;
    dialog?: HTMLDialogElement | undefined;
    onsubmit: (event: SubmitEvent) => void;
    onclose?: () => void;
    body: Snippet;
    footer: Snippet;
  }

  let { id, title, closeLabel, dialog = $bindable(), onsubmit, onclose, body, footer }: Props = $props();
</script>

<dialog class="sheet" {id} bind:this={dialog} aria-labelledby="{id}-title" {onclose}>
  <form class="sheet__form" novalidate {onsubmit}>
    <header class="sheet__head">
      <h2 id="{id}-title" class="sheet__title">{title}</h2>
      <button class="icon-btn" type="button" aria-label={closeLabel} onclick={() => dialog?.close()}>
        <Icon name="x" />
      </button>
    </header>
    <div class="sheet__body">
      {@render body()}
    </div>
    <footer class="sheet__foot">
      <div class="sheet__actions">{@render footer()}</div>
    </footer>
  </form>
</dialog>

<style>
  .sheet {
    width: min(35rem, calc(100% - 2 * var(--space-4)));
    max-height: calc(100dvh - 2 * var(--space-6));
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-float);
  }

  .sheet::backdrop {
    background: rgb(20 18 16 / 0.45);
  }

  .sheet__form {
    display: grid;
    grid-template-rows: auto 1fr auto;
    max-height: inherit;
  }

  .sheet__head,
  .sheet__foot {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }

  .sheet__head {
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--line);
  }

  .sheet__title {
    flex: 1;
    min-width: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    letter-spacing: var(--tracking-display);
    overflow-wrap: anywhere;
  }

  /* align-content: start — a short body on a full-height phone sheet keeps its rows at their size. */
  .sheet__body {
    display: grid;
    align-content: start;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
    overflow-y: auto;
    padding: var(--space-5);
    overscroll-behavior: contain;
  }

  .sheet__foot {
    justify-content: flex-end;
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--line);
  }

  /* Footer buttons are always the same size: equal columns as wide as the widest label (min 8 rem). */
  .sheet__actions {
    display: inline-grid;
    grid-auto-columns: minmax(8rem, 1fr);
    grid-auto-flow: column;
    gap: var(--space-3);
  }

  @media (max-width: 47.99rem) {
    .sheet {
      width: 100%;
      max-width: none;
      height: 100dvh;
      max-height: none;
      margin: 0;
      border: 0;
      border-radius: 0;
    }

    .sheet__form {
      height: 100%;
    }

    .sheet__foot {
      padding-block-end: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    }

    .sheet__actions {
      display: grid;
      flex: 1;
      grid-auto-columns: minmax(0, 1fr);
    }

    @media (prefers-reduced-motion: no-preference) {
      .sheet[open] {
        animation: sheet-in var(--dur) var(--ease);
      }
    }
  }

  @keyframes sheet-in {
    from {
      transform: translateX(100%);
    }
  }
</style>
