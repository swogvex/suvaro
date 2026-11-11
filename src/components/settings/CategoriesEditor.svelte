<!--
  Settings › Categories (island): the list (tile, name, "n this month") and a dialog to create or edit one
  (name, icon grid, eight named colors). Deleting asks which category receives its movements and
  recurring ones (a second dialog). Saves wait for the server (names must be unique), then update the list.
  Props:
    categories  Initial rows (`listCategoryRows`).
    messages    Translated strings (`categories.`, `color.`, `catIcon.`).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { UiKey } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import * as api from '../../lib/categories/client';
  import {
    CATEGORY_MAX,
    CATEGORY_NAME_MAX,
    categoryIcons,
    type CategoryIcon,
    type CategoryRow,
    type ColorIndex,
  } from '../../lib/categories/model';
  import type { IconName } from '../../lib/icons';
  import { ulid } from '../../lib/id';
  import { showToast } from '../../lib/toast';
  import Dialog from '../ui/Dialog.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    categories: CategoryRow[];
    messages: Messages;
  }

  let { categories, messages }: Props = $props();
  const t = translator(messages);
  const COLORS: ColorIndex[] = [1, 2, 3, 4, 5, 6, 7, 8];

  // svelte-ignore state_referenced_locally
  let rows = $state<CategoryRow[]>(categories);
  const atLimit = $derived(rows.length >= CATEGORY_MAX);

  // ------------------------------------------------------------------------------------- edit dialog
  let dialog: HTMLDialogElement | undefined = $state();
  let editing = $state<CategoryRow | null>(null);
  let name = $state('');
  let icon = $state<CategoryIcon>('dots');
  let color = $state<ColorIndex>(1);
  let nameError = $state('');
  let busy = $state(false);

  async function open(row: CategoryRow | null) {
    if (!row && atLimit) {
      showToast(t('categories.errorLimit'));
      return;
    }
    editing = row;
    name = row?.name ?? '';
    icon = (categoryIcons as readonly string[]).includes(row?.icon ?? '')
      ? (row?.icon as CategoryIcon)
      : 'dots';
    color = row?.color ?? 1;
    nameError = '';
    dialog?.showModal();
    await tick();
    dialog?.querySelector<HTMLInputElement>('#category-name')?.focus();
  }

  const errorText = (code: string): string =>
    ({
      DUPLICATE_NAME: t('categories.errorDuplicate'),
      LIMIT_REACHED: t('categories.errorLimit'),
      LAST_CATEGORY: t('categories.errorLast'),
    })[code] ?? t('categories.errorSave');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      nameError = t('categories.errorName');
      dialog?.querySelector<HTMLInputElement>('#category-name')?.focus();
      return;
    }
    busy = true;
    try {
      const fields = { name: clean.slice(0, CATEGORY_NAME_MAX), icon, color };
      if (editing) {
        const saved = await api.updateCategory(editing.id, fields);
        const id = editing.id;
        rows = rows.map((row) => (row.id === id ? { ...row, ...saved } : row));
        showToast(t('categories.saved'));
      } else {
        rows = [...rows, await api.createCategory(ulid(), fields)];
        showToast(t('categories.created'));
      }
      dialog?.close();
    } catch (error) {
      const code = error instanceof api.ApiError ? error.code : '';
      if (code === 'DUPLICATE_NAME') {
        nameError = errorText(code);
        dialog?.querySelector<HTMLInputElement>('#category-name')?.focus();
      } else {
        showToast(errorText(code));
      }
    } finally {
      busy = false;
    }
  }

  // ----------------------------------------------------------------------------------- delete dialog
  let removeDialog: HTMLDialogElement | undefined = $state();
  let removing = $state<CategoryRow | null>(null);
  let moveTo = $state('');
  const targets = $derived(rows.filter((row) => row.id !== removing?.id));

  async function askRemove() {
    const row = editing;
    if (!row) return;
    if (rows.length <= 1) {
      showToast(t('categories.errorLast'));
      return;
    }
    dialog?.close();
    removing = row;
    moveTo = rows.find((other) => other.id !== row.id)?.id ?? '';
    removeDialog?.showModal();
    await tick();
    removeDialog?.querySelector<HTMLElement>('#category-move-to')?.focus();
  }

  async function confirmRemove(event: SubmitEvent) {
    event.preventDefault();
    const row = removing;
    if (!row || busy) return;
    busy = true;
    try {
      await api.deleteCategory(row.id, moveTo || null);
      const target = rows.find((other) => other.id === moveTo);
      rows = rows
        .filter((other) => other.id !== row.id)
        .map((other) =>
          other.id === target?.id
            ? { ...other, total: other.total + row.total, thisMonth: other.thisMonth + row.thisMonth }
            : other,
        );
      removeDialog?.close();
      showToast(
        row.total > 0 && target
          ? t('categories.deletedMoved', { name: row.name, target: target.name })
          : t('categories.deleted', { name: row.name }),
      );
    } catch (error) {
      showToast(errorText(error instanceof api.ApiError ? error.code : ''));
    } finally {
      busy = false;
    }
  }
</script>

<div class="card categories">
  <div class="categories__head">
    <p class="categories__lead">{t('categories.lead', { n: rows.length })}</p>
    <button class="btn btn--secondary" type="button" disabled={atLimit} onclick={() => open(null)}>
      <Icon name="plus" />{t('categories.new')}
    </button>
  </div>

  <ul class="categories__list">
    {#each rows as row (row.id)}
      <li>
        <button class="category" type="button" data-id={row.id} onclick={() => open(row)}>
          <span class="cat-tile" data-color={row.color} aria-hidden="true"
            ><Icon name={row.icon as IconName} /></span
          >
          <span class="visually-hidden">{t('categories.edit')}</span>
          <span class="category__text">
            <span class="category__name">{row.name}</span>
            <span class="category__meta">{t('categories.thisMonth', { n: row.thisMonth })}</span>
          </span>
          <Icon name="pencil" class="category__edit" />
        </button>
      </li>
    {/each}
  </ul>
</div>

<Dialog
  id="category-dialog"
  title={editing ? t('categories.editTitle') : t('categories.newTitle')}
  closeLabel={t('categories.close')}
  bind:dialog
  onsubmit={submit}
>
  {#snippet body()}
    <div class="field">
      <label class="field__label" for="category-name">{t('categories.name')}</label>
      <input
        id="category-name"
        class="field__input"
        bind:value={name}
        maxlength={CATEGORY_NAME_MAX}
        autocomplete="off"
        placeholder={t('categories.namePlaceholder')}
        aria-invalid={nameError ? 'true' : undefined}
        aria-describedby={nameError ? 'category-name-error' : undefined}
        oninput={() => (nameError = '')}
      />
      {#if nameError}
        <p class="field__error" id="category-name-error"><Icon name="alert" />{nameError}</p>
      {/if}
    </div>

    <fieldset class="group">
      <legend class="field__label">{t('categories.icon')}</legend>
      <div class="swatches swatches--icons">
        {#each categoryIcons as option (option)}
          <label class="swatch">
            <input
              type="radio"
              name="category-icon"
              value={option}
              checked={icon === option}
              onchange={() => (icon = option)}
            />
            <span class="cat-tile" data-color={color} aria-hidden="true"><Icon name={option} /></span>
            <span class="visually-hidden">{t(`catIcon.${option}` as UiKey)}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="group">
      <legend class="field__label">{t('categories.color')}</legend>
      <div class="swatches swatches--colors">
        {#each COLORS as option (option)}
          <label class="swatch" title={t(`color.${option}` as UiKey)}>
            <input
              type="radio"
              name="category-color"
              value={option}
              checked={color === option}
              onchange={() => (color = option)}
            />
            <span class="cat-tile swatch__color" data-color={option} aria-hidden="true"></span>
            <span class="visually-hidden">{t(`color.${option}` as UiKey)}</span>
          </label>
        {/each}
      </div>
    </fieldset>
  {/snippet}

  {#snippet footer()}
    {#if editing}
      <button class="btn btn--danger" type="button" onclick={askRemove}>
        <Icon name="trash" />{t('categories.delete')}
      </button>
    {/if}
    <button class="btn btn--primary" type="submit" disabled={busy}>{t('categories.save')}</button>
  {/snippet}
</Dialog>

<Dialog
  id="category-delete"
  title={removing ? t('categories.deleteTitle', { name: removing.name }) : ''}
  closeLabel={t('categories.close')}
  bind:dialog={removeDialog}
  onsubmit={confirmRemove}
>
  {#snippet body()}
    {#if removing}
      <div class="remove__head">
        <span class="cat-tile cat-tile--lg" data-color={removing.color} aria-hidden="true">
          <Icon name={removing.icon as IconName} />
        </span>
        <p>
          {removing.total > 0 ? t('categories.usedBy', { n: removing.total }) : t('categories.unused')}
        </p>
      </div>
      <div class="field">
        <label class="field__label" for="category-move-to">{t('categories.moveTo')}</label>
        <select id="category-move-to" class="field__input" bind:value={moveTo}>
          {#each targets as target (target.id)}
            <option value={target.id}>{target.name}</option>
          {/each}
        </select>
      </div>
      <p class="remove__note"><Icon name="alert" />{t('categories.deleteNote')}</p>
    {/if}
  {/snippet}

  {#snippet footer()}
    <button class="btn btn--secondary" type="button" onclick={() => removeDialog?.close()}>
      {t('categories.cancel')}
    </button>
    <button class="btn btn--danger" type="submit" disabled={busy}>
      <Icon name="trash" />{t('categories.delete')}
    </button>
  {/snippet}
</Dialog>

<style>
  .categories {
    display: grid;
    gap: var(--space-4);
  }

  .categories__head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
  }

  .categories__lead {
    color: var(--ink-2);
  }

  .categories__list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .category {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    width: 100%;
    min-height: 3.5rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-btn);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: border-color var(--dur) var(--ease);
  }

  .category:hover {
    border-color: var(--ink-3);
  }

  .category:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .category__text {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .category__name {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category__meta {
    color: var(--ink-2);
    font-size: 0.8125rem;
  }

  .category :global(.category__edit) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    color: var(--ink-2);
  }

  @media (min-width: 40rem) {
    .categories__list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 72rem) {
    .categories__list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .group {
    display: grid;
    gap: var(--space-2);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  /* 44 px targets: the tile plus a ring when checked. */
  .swatch {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--radius-btn);
    cursor: pointer;
  }

  .swatch input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .swatch:has(input:checked) {
    box-shadow: inset 0 0 0 2px var(--ink);
  }

  .swatch:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .swatch__color {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
  }

  /* Phones: the 8 colors in two even rows instead of 6 + 2. */
  @media (max-width: 30rem) {
    .swatches--colors {
      display: grid;
      grid-template-columns: repeat(4, 2.75rem);
    }
  }

  .remove__head {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }

  .remove__note {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    color: var(--ink-2);
  }

  .remove__note :global(svg) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    margin-block-start: 2px;
    color: var(--warning);
  }
</style>
