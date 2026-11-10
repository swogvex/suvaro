<!--
  Search (island, once per app page). Opened with `/`, Ctrl/Cmd K or the header button. One input
  (combobox) searching movements on the server (note, category, amount; 20 results) and settings pages
  here. Results grouped "Movements · 3" / "Settings · 0", matches highlighted, arrow keys + Enter, Esc closes.
  Props:
    categories, locale, currency
    settings   Settings pages that can be found: label + href.
    messages   Translated strings.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Locale } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import type { IconName } from '../../lib/icons';
  import { listenFor, openEditor, SEARCH_EVENT } from '../../lib/movements/client';
  import { movementAmount, movementName, shortDate } from '../../lib/movements/format';
  import type { CategoryOption, Movement } from '../../lib/movements/model';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    categories: CategoryOption[];
    locale: Locale;
    currency: string;
    settings: { label: string; href: string }[];
    messages: Messages;
  }

  let { categories, locale, currency, settings, messages }: Props = $props();

  const t = $derived(translator(messages));
  const DEBOUNCE_MS = 200;

  type Result =
    { kind: 'movement'; movement: Movement; name: string } | { kind: 'setting'; label: string; href: string };

  let dialog: HTMLDialogElement | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  let query = $state('');
  let movements = $state<Movement[]>([]);
  let searched = $state('');
  let failed = $state(false);
  let active = $state(0);
  let ready = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;

  const categoryOf = (id: string | null) => categories.find((c) => c.id === id);
  const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const trimmed = $derived(query.trim());
  const settingResults = $derived(
    trimmed ? settings.filter((s) => fold(s.label).includes(fold(trimmed))) : [],
  );
  const results = $derived<Result[]>([
    ...movements.map((movement) => ({
      kind: 'movement' as const,
      movement,
      name: movementName(movement, categoryOf(movement.categoryId), t),
    })),
    ...settingResults.map((s) => ({ kind: 'setting' as const, ...s })),
  ]);
  const optionId = (index: number) => `search-option-${index}`;

  onMount(() => {
    const stop = listenFor(SEARCH_EVENT, () => void open());
    ready = true;
    return stop;
  });

  async function open() {
    if (!dialog?.open) dialog?.showModal();
    await tick();
    input?.select();
  }

  function onInput() {
    active = 0;
    clearTimeout(timer);
    timer = setTimeout(search, DEBOUNCE_MS);
  }

  async function search() {
    const text = trimmed;
    request?.abort();
    if (!text) {
      movements = [];
      searched = '';
      return;
    }
    request = new AbortController();
    try {
      const response = await fetch(`/api/search?${new URLSearchParams({ q: text.slice(0, 60) })}`, {
        signal: request.signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      movements = ((await response.json()) as { movements: Movement[] }).movements;
      failed = false;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      movements = [];
      failed = true;
    }
    searched = text;
  }

  function choose(result: Result) {
    dialog?.close();
    if (result.kind === 'movement') openEditor({ movement: result.movement });
    else window.location.assign(result.href);
  }

  async function onKeydown(event: KeyboardEvent) {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
      await tick();
      document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = results[active];
      if (result) choose(result);
    }
  }

  /** Splits `text` around the first match of the query (accent- and case-insensitive) for <mark>. */
  function highlight(text: string): { text: string; match: boolean }[] {
    const needle = fold(trimmed);
    const folded = fold(text);
    const at = needle ? folded.indexOf(needle) : -1;
    // Folding can change the length (rare ligatures); then skip highlighting rather than misplace it.
    if (at === -1 || folded.length !== text.length) return [{ text, match: false }];
    return [
      { text: text.slice(0, at), match: false },
      { text: text.slice(at, at + needle.length), match: true },
      { text: text.slice(at + needle.length), match: false },
    ].filter((part) => part.text);
  }
</script>

<dialog
  class="search"
  bind:this={dialog}
  aria-labelledby="search-title"
  onclose={() => {
    query = '';
    movements = [];
    searched = '';
  }}
>
  {#if ready}
    <div class="search__head">
      <h2 id="search-title" class="visually-hidden">{t('search.title')}</h2>
      <Icon name="search" class="search__icon" />
      <input
        bind:this={input}
        bind:value={query}
        class="search__input"
        type="search"
        role="combobox"
        aria-label={t('search.label')}
        aria-expanded={results.length > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
        aria-describedby="search-hint"
        placeholder={t('search.placeholder')}
        autocomplete="off"
        maxlength="60"
        oninput={onInput}
        onkeydown={onKeydown}
      />
      <button class="icon-btn" type="button" aria-label={t('search.close')} onclick={() => dialog?.close()}>
        <Icon name="x" />
      </button>
    </div>

    <div class="search__body">
      <p id="search-hint" class={['search__note', trimmed && 'visually-hidden']}>{t('search.hint')}</p>

      <div id="search-results" role="listbox" aria-label={t('search.title')} class="search__results">
        {#if trimmed && searched}
          <div role="group" aria-label={t('search.movements', { n: movements.length })}>
            <p class="search__group" aria-hidden="true">{t('search.movements', { n: movements.length })}</p>
            {#each results as result, index (index)}
              {#if result.kind === 'movement'}
                {@const category = categoryOf(result.movement.categoryId)}
                <div
                  id={optionId(index)}
                  role="option"
                  tabindex="-1"
                  aria-selected={active === index}
                  class="search__option"
                  onclick={() => choose(result)}
                  onkeydown={() => undefined}
                  onpointermove={() => (active = index)}
                >
                  <span
                    class="cat-tile cat-tile--sm"
                    data-color={result.movement.type === 'income' ? 3 : (category?.color ?? 7)}
                    aria-hidden="true"
                  >
                    <Icon
                      name={(result.movement.type === 'income'
                        ? 'wallet'
                        : (category?.icon ?? 'dots')) as IconName}
                    />
                  </span>
                  <span class="search__text">
                    <span class="search__name">
                      {#each highlight(result.name) as part, i (i)}{#if part.match}<mark>{part.text}</mark
                          >{:else}{part.text}{/if}{/each}
                    </span>
                    <span class="search__meta"
                      >{shortDate(result.movement.date, locale)}{category ? ` · ${category.name}` : ''}</span
                    >
                  </span>
                  <span class="search__amount num">{movementAmount(result.movement, locale, currency)}</span>
                </div>
              {/if}
            {/each}
          </div>
          <div role="group" aria-label={t('search.settings', { n: settingResults.length })}>
            <p class="search__group" aria-hidden="true">
              {t('search.settings', { n: settingResults.length })}
            </p>
            {#each results as result, index (index)}
              {#if result.kind === 'setting'}
                <div
                  id={optionId(index)}
                  role="option"
                  tabindex="-1"
                  aria-selected={active === index}
                  class="search__option"
                  onclick={() => choose(result)}
                  onkeydown={() => undefined}
                  onpointermove={() => (active = index)}
                >
                  <span class="cat-tile cat-tile--sm" data-color="5" aria-hidden="true"
                    ><Icon name="shield" /></span
                  >
                  <span class="search__name">
                    {#each highlight(result.label) as part, i (i)}{#if part.match}<mark>{part.text}</mark
                        >{:else}{part.text}{/if}{/each}
                  </span>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

      <p class="search__note" role="status">
        {#if failed}
          {t('search.error')}
        {:else if trimmed && searched && results.length === 0}
          {t('search.empty', { q: searched })}
        {/if}
      </p>
    </div>
  {/if}
</dialog>

<style>
  .search {
    width: min(40rem, calc(100% - 2 * var(--space-4)));
    max-height: min(36rem, calc(100dvh - 2 * var(--space-6)));
    margin-block-start: 10dvh;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-float);
  }

  .search[open] {
    display: grid;
    grid-template-rows: auto 1fr;
  }

  .search::backdrop {
    background: rgb(20 18 16 / 0.45);
  }

  .search__head {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--line);
  }

  .search__head :global(.search__icon) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--ink-2);
  }

  .search__input {
    flex: 1;
    min-width: 0;
    min-height: 3rem;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1.0625rem;
  }

  .search__input:focus-visible {
    outline: none;
  }

  /* The dialog has its own close button. */
  .search__input::-webkit-search-cancel-button {
    appearance: none;
  }

  .search__head:has(.search__input:focus-visible) {
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .search__body {
    display: grid;
    gap: var(--space-2);
    align-content: start;
    overflow-y: auto;
    padding: var(--space-3);
  }

  .search__note {
    padding-inline: var(--space-2);
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .search__note:empty {
    display: none;
  }

  .search__results {
    display: grid;
    gap: var(--space-3);
  }

  .search__group {
    padding: var(--space-1) var(--space-2);
    color: var(--ink-2);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .search__option {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-3);
    align-items: center;
    min-height: 3rem;
    padding: var(--space-2);
    border-radius: var(--radius-btn);
    cursor: pointer;
  }

  .search__option[aria-selected='true'] {
    background: var(--surface-2);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .search__text {
    display: grid;
    min-width: 0;
  }

  .search__name {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search__meta {
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .search__amount {
    font-size: 0.875rem;
    white-space: nowrap;
  }

  mark {
    border-radius: var(--radius-xs);
    background: var(--accent-soft);
    color: var(--ink);
  }
</style>
