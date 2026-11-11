<!--
  Settings › Security: the user's passkeys with Rename and Remove (island). Rename opens a dialog with the
  name; Remove asks first. The last passkey of an account with an unconfirmed email can't be removed
  (the server enforces it too: 409 LAST_PASSKEY).
  Props:
    passkeys       `{ id, name, added }` (added: already formatted date text, or null).
    emailVerified  Whether the account's email is confirmed.
    messages       Translated strings (`security.`, `settings.saveError`).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { translator, type Messages } from '../../i18n/client';
  import { ApiError, call } from '../../lib/movements/client';
  import { showToast } from '../../lib/toast';
  import Dialog from '../ui/Dialog.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Row {
    id: string;
    name: string | null;
    added: string | null;
  }

  interface Props {
    passkeys: Row[];
    emailVerified: boolean;
    messages: Messages;
  }

  let { passkeys, emailVerified, messages }: Props = $props();
  const t = translator(messages);
  const NAME_MAX = 40;

  // svelte-ignore state_referenced_locally
  let rows = $state<Row[]>(passkeys);
  const locked = $derived(rows.length === 1 && !emailVerified);
  const label = (row: Row) => row.name || t('security.passkeyUnnamed');

  let busy = $state(false);

  // ----------------------------------------------------------------------------------------- rename
  let renameDialog: HTMLDialogElement | undefined = $state();
  let renaming = $state<Row | null>(null);
  let name = $state('');
  let nameError = $state('');

  async function openRename(row: Row) {
    renaming = row;
    name = row.name ?? '';
    nameError = '';
    renameDialog?.showModal();
    await tick();
    renameDialog?.querySelector<HTMLInputElement>('#passkey-name')?.select();
  }

  async function rename(event: SubmitEvent) {
    event.preventDefault();
    const row = renaming;
    if (!row || busy) return;
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      nameError = t('security.errorName');
      return;
    }
    busy = true;
    try {
      await call('PATCH', `/api/passkeys/${encodeURIComponent(row.id)}`, { name: clean.slice(0, NAME_MAX) });
      rows = rows.map((other) =>
        other.id === row.id ? { ...other, name: clean.slice(0, NAME_MAX) } : other,
      );
      renameDialog?.close();
      showToast(t('security.passkeyRenamed'));
    } catch {
      showToast(t('settings.saveError'));
    } finally {
      busy = false;
    }
  }

  // ----------------------------------------------------------------------------------------- remove
  let removeDialog: HTMLDialogElement | undefined = $state();
  let removing = $state<Row | null>(null);

  function openRemove(row: Row) {
    removing = row;
    removeDialog?.showModal();
  }

  async function remove(event: SubmitEvent) {
    event.preventDefault();
    const row = removing;
    if (!row || busy) return;
    busy = true;
    try {
      await call('DELETE', `/api/passkeys/${encodeURIComponent(row.id)}`);
      rows = rows.filter((other) => other.id !== row.id);
      removeDialog?.close();
      showToast(t('security.passkeyRemoved'));
    } catch (error) {
      showToast(
        error instanceof ApiError && error.code === 'LAST_PASSKEY'
          ? t('security.lastPasskeyLocked')
          : t('settings.saveError'),
      );
    } finally {
      busy = false;
    }
  }
</script>

{#if rows.length === 0}
  <p class="passkeys__empty">{t('security.passkeysEmpty')}</p>
{:else}
  <ul class="passkeys">
    {#each rows as row (row.id)}
      <li class="passkey">
        <Icon name="key" />
        <span class="passkey__main">
          <span class="passkey__name">{label(row)}</span>
          {#if row.added}
            <span class="passkey__meta">{t('security.passkeyAdded', { date: row.added })}</span>
          {/if}
        </span>
        <span class="btn-group">
          <button
            class="btn btn--ghost"
            type="button"
            aria-label={t('security.renameLabel', { name: label(row) })}
            onclick={() => openRename(row)}
          >
            {t('security.rename')}
          </button>
          <button
            class="btn btn--ghost passkey__remove"
            type="button"
            aria-label={t('security.removeLabel', { name: label(row) })}
            aria-describedby={locked ? 'passkey-locked' : undefined}
            disabled={locked}
            onclick={() => openRemove(row)}
          >
            {t('security.remove')}
          </button>
        </span>
      </li>
    {/each}
  </ul>
  {#if locked}
    <p class="passkeys__note" id="passkey-locked"><Icon name="alert" />{t('security.lastPasskeyLocked')}</p>
  {/if}
{/if}

<Dialog
  id="passkey-rename"
  title={t('security.renameTitle')}
  closeLabel={t('security.close')}
  bind:dialog={renameDialog}
  onsubmit={rename}
>
  {#snippet body()}
    <div class="field">
      <label class="field__label" for="passkey-name">{t('security.passkeyName')}</label>
      <input
        id="passkey-name"
        class="field__input"
        bind:value={name}
        maxlength={NAME_MAX}
        autocomplete="off"
        aria-invalid={nameError ? 'true' : undefined}
        aria-describedby={nameError ? 'passkey-name-error passkey-name-hint' : 'passkey-name-hint'}
        oninput={() => (nameError = '')}
      />
      <p class="field__hint" id="passkey-name-hint">{t('security.passkeyNameHint')}</p>
      {#if nameError}
        <p class="field__error" id="passkey-name-error"><Icon name="alert" />{nameError}</p>
      {/if}
    </div>
  {/snippet}
  {#snippet footer()}
    <button class="btn btn--secondary" type="button" onclick={() => renameDialog?.close()}>
      {t('security.cancel')}
    </button>
    <button class="btn btn--primary" type="submit" disabled={busy}>{t('security.save')}</button>
  {/snippet}
</Dialog>

<Dialog
  id="passkey-remove"
  title={removing ? t('security.removeTitle', { name: label(removing) }) : ''}
  closeLabel={t('security.close')}
  bind:dialog={removeDialog}
  onsubmit={remove}
>
  {#snippet body()}
    <p>{rows.length === 1 ? t('security.removeLastBody') : t('security.removeBody')}</p>
  {/snippet}
  {#snippet footer()}
    <button class="btn btn--secondary" type="button" onclick={() => removeDialog?.close()}>
      {t('security.cancel')}
    </button>
    <button class="btn btn--danger" type="submit" disabled={busy}>
      <Icon name="trash" />{t('security.remove')}
    </button>
  {/snippet}
</Dialog>

<style>
  .passkeys {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .passkey {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    padding-block: var(--space-3);
  }

  .passkey + .passkey {
    border-block-start: 1px solid var(--line);
  }

  .passkey > :global(svg) {
    flex: none;
    width: 1.375rem;
    height: 1.375rem;
    color: var(--ink-2);
  }

  .passkey__main {
    display: grid;
    flex: 1;
    gap: var(--space-1);
    min-width: 10rem;
    overflow-wrap: anywhere;
  }

  .passkey__name {
    font-weight: 500;
  }

  .passkey__meta,
  .passkeys__empty {
    color: var(--ink-2);
  }

  .passkey__meta {
    font-size: 0.875rem;
  }

  /* When the actions wrap under the name (phones), they line up with the text, not the key icon. */
  @media (max-width: 30rem) {
    .passkey > :global(.btn-group) {
      margin-inline-start: calc(1.375rem + var(--space-3));
    }
  }

  .passkey__remove:not(:disabled) {
    color: var(--negative);
  }

  .passkeys__note {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .passkeys__note :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    margin-block-start: 2px;
    color: var(--warning);
  }
</style>
