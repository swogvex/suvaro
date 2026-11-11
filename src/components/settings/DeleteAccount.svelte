<!--
  Settings › Privacy: "Delete my account" (island). The dialog first confirms it's the user: a passkey, or a
  6-digit code emailed to the account. Either one signs in again (a fresh session), then the account is
  deleted at once (`DELETE /api/account`, which checks the session is fresh and is this account). The last
  step says it's done and leads to the homepage (the session is gone).
  Props:
    userId       The account on screen (a passkey for another account must not delete that one).
    email        Where the code goes.
    hasPasskeys  Whether to offer the passkey option.
    homeHref     Homepage in the user's language.
    locale, messages (`privacy.`, `signIn.error*`).
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Locale, UiKey } from '../../i18n';
  import { translator, type Messages } from '../../i18n/client';
  import { createClient, supportsPasskeys } from '../../lib/auth-client';
  import { authErrorKey } from '../../lib/auth-errors';
  import { ApiError, call } from '../../lib/movements/client';
  import Dialog from '../ui/Dialog.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    userId: string;
    email: string;
    hasPasskeys: boolean;
    homeHref: string;
    locale: Locale;
    messages: Messages;
  }

  let { userId, email, hasPasskeys, homeHref, locale, messages }: Props = $props();
  const t = translator(messages);

  let dialog: HTMLDialogElement | undefined = $state();
  let step = $state<'verify' | 'code' | 'done'>('verify');
  let code = $state('');
  let error = $state('');
  let busy = $state(false);
  let passkeys = $state(false);

  onMount(() => {
    passkeys = hasPasskeys && supportsPasskeys();
  });

  async function open() {
    step = 'verify';
    code = '';
    error = '';
    dialog?.showModal();
  }

  /** The session is gone once the account is: closing the last step leaves the app. */
  function closed() {
    if (step === 'done') window.location.assign(homeHref);
  }

  async function deleteNow() {
    try {
      await call('DELETE', '/api/account', { userId });
      step = 'done';
    } catch (failure) {
      const reason = failure instanceof ApiError ? failure.code : '';
      error =
        reason === 'WRONG_ACCOUNT'
          ? t('privacy.errorWrongAccount')
          : reason === 'REAUTH_REQUIRED'
            ? t('privacy.errorReauth')
            : t('privacy.errorDelete');
      step = 'verify';
    }
  }

  async function withPasskey() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const result = await createClient(locale).signIn.passkey();
      if (result.error) {
        error = t(authErrorKey(result.error));
        return;
      }
      await deleteNow();
    } catch {
      error = t('signIn.errorNetwork' as UiKey);
    } finally {
      busy = false;
    }
  }

  async function sendCode() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const result = await createClient(locale).emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      if (result.error) {
        error = t(authErrorKey(result.error));
        return;
      }
      step = 'code';
      code = '';
      await tick();
      dialog?.querySelector<HTMLInputElement>('#delete-code')?.focus();
    } catch {
      error = t('signIn.errorNetwork' as UiKey);
    } finally {
      busy = false;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (step === 'done') {
      window.location.assign(homeHref);
      return;
    }
    if (step !== 'code' || busy) return;
    const otp = code.replace(/\D/g, '');
    if (otp.length !== 6) {
      error = t('privacy.errorCode');
      dialog?.querySelector<HTMLInputElement>('#delete-code')?.focus();
      return;
    }
    busy = true;
    error = '';
    try {
      const result = await createClient(locale).signIn.emailOtp({ email, otp });
      if (result.error) {
        error = t(authErrorKey(result.error));
        return;
      }
      await deleteNow();
    } catch {
      error = t('signIn.errorNetwork' as UiKey);
    } finally {
      busy = false;
    }
  }
</script>

<button class="btn btn--danger" type="button" onclick={open}>
  <Icon name="trash" />{t('privacy.deleteAction')}
</button>

<Dialog
  id="delete-account"
  title={step === 'done' ? t('privacy.doneTitle') : t('privacy.dialogTitle')}
  closeLabel={t('privacy.close')}
  bind:dialog
  onsubmit={submit}
  onclose={closed}
>
  {#snippet body()}
    {#if step === 'done'}
      <p class="done" role="status"><Icon name="check" />{t('privacy.done', { email })}</p>
    {:else}
      <p>{passkeys ? t('privacy.verifyLead', { email }) : t('privacy.verifyLeadCode', { email })}</p>
      {#if step === 'verify'}
        <div class="choices">
          {#if passkeys}
            <button class="btn btn--secondary" type="button" disabled={busy} onclick={withPasskey}>
              <Icon name="key" />{t('privacy.usePasskey')}
            </button>
          {/if}
          <button class="btn btn--secondary" type="button" disabled={busy} onclick={sendCode}>
            <Icon name="mail" />{t('privacy.sendCode')}
          </button>
        </div>
      {:else}
        <div class="field">
          <label class="field__label" for="delete-code">{t('privacy.codeLabel')}</label>
          <input
            id="delete-code"
            class="field__input num code"
            bind:value={code}
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            aria-describedby="delete-code-hint"
            aria-invalid={error ? 'true' : undefined}
          />
          <p class="field__hint" id="delete-code-hint">{t('privacy.codeHint', { email })}</p>
        </div>
      {/if}
      {#if error}
        <p class="field__error" role="alert"><Icon name="alert" />{error}</p>
      {/if}
    {/if}
  {/snippet}

  {#snippet footer()}
    {#if step === 'done'}
      <button class="btn btn--primary" type="submit">{t('privacy.goHome')}</button>
    {:else}
      <button class="btn btn--secondary" type="button" onclick={() => dialog?.close()}>
        {t('privacy.cancel')}
      </button>
      {#if step === 'code'}
        <button class="btn btn--danger" type="submit" disabled={busy}>
          <Icon name="trash" />{t('privacy.confirmDelete')}
        </button>
      {/if}
    {/if}
  {/snippet}
</Dialog>

<style>
  .choices {
    display: grid;
    gap: var(--space-3);
  }

  .code {
    max-width: 12rem;
    font-size: 1.25rem;
    letter-spacing: 0.2em;
  }

  .done {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
  }

  .done :global(svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    margin-block-start: 2px;
    color: var(--positive);
  }

  @media (min-width: 30rem) {
    .choices {
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    }
  }
</style>
