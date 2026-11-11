<!--
  Sign in / create account (island). Passkey first; email + 6-digit code as the alternative.
  Props:
    locale       Page language (sent as a header so a code email for a new address uses it).
    initialMode  'sign-in' | 'create' (from ?mode=create).
    messages     Translated `signIn.*` strings.
    termsHref, privacyHref  Legal pages in the page language.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { createClient, supportsPasskeys } from '../../lib/auth-client';
  import { authErrorKey, looksLikeEmail, type AuthErrorLike } from '../../lib/auth-errors';
  import Icon from '../ui/Icon.svelte';
  import type { Locale, UiKey } from '../../i18n';

  type Mode = 'sign-in' | 'create';
  type Field = 'email' | 'age' | 'code' | null;

  interface Props {
    locale: Locale;
    initialMode: Mode;
    messages: Partial<Record<UiKey, string>>;
    termsHref: string;
    privacyHref: string;
  }

  let { locale, initialMode, messages, termsHref, privacyHref }: Props = $props();

  const RESEND_SECONDS = 45;
  const APP_PATH = '/app';
  const client = createClient(locale);

  let mode = $state<Mode>(initialMode);
  let step = $state<'start' | 'code'>('start');
  let email = $state('');
  let ageConfirmed = $state(false);
  let digits = $state<string[]>(['', '', '', '', '', '']);
  let busy = $state(false);
  // Buttons stay disabled until hydration, so an early click never does a native form submit.
  let ready = $state(false);
  let error = $state<UiKey | null>(null);
  let errorField = $state<Field>(null);
  let passkeys = $state(true);
  let resendAt = $state(0);
  let now = $state(Date.now());

  let emailInput: HTMLInputElement | undefined = $state();
  let digitInputs: HTMLInputElement[] = $state([]);

  const t = (key: UiKey, vars: Record<string, string | number> = {}) =>
    (messages[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    );

  const ageParts = $derived(t('signIn.age').split(/(\{terms\}|\{privacy\})/));
  const secondsLeft = $derived(Math.max(0, Math.ceil((resendAt - now) / 1000)));
  const countdown = $derived(`0:${String(secondsLeft).padStart(2, '0')}`);

  onMount(() => {
    passkeys = supportsPasskeys();
    ready = true;
    const timer = setInterval(() => (now = Date.now()), 1000);
    // Conditional UI: the browser offers saved passkeys in the email field's autofill.
    void (async () => {
      if (!passkeys || !(await PublicKeyCredential.isConditionalMediationAvailable?.())) return;
      const result = await client.signIn.passkey({ autoFill: true });
      if (result.data) window.location.assign(APP_PATH);
    })();
    return () => clearInterval(timer);
  });

  function setError(key: UiKey | null, field: Field = null) {
    error = key;
    errorField = key ? field : null;
  }

  function showAuthError(err: AuthErrorLike | null | undefined) {
    const key = authErrorKey(err);
    const field: Field =
      key === 'signIn.errorEmail' || key === 'signIn.errorExists'
        ? 'email'
        : key === 'signIn.errorAge'
          ? 'age'
          : key.startsWith('signIn.errorCode')
            ? 'code'
            : null;
    setError(key, field);
  }

  function switchMode(next: Mode) {
    mode = next;
    setError(null);
  }

  /** Checks email (and the 18+ box when creating). Returns false and shows the error otherwise. */
  function checkStart(): boolean {
    email = email.trim().toLowerCase();
    if (!looksLikeEmail(email)) {
      setError('signIn.errorEmail', 'email');
      emailInput?.focus();
      return false;
    }
    if (mode === 'create' && !ageConfirmed) {
      setError('signIn.errorAge', 'age');
      return false;
    }
    return true;
  }

  async function run(task: () => Promise<void>) {
    if (busy) return;
    busy = true;
    setError(null);
    try {
      await task();
    } catch {
      setError('signIn.errorNetwork');
    } finally {
      busy = false;
    }
  }

  function passkeySignIn() {
    return run(async () => {
      const result = await client.signIn.passkey();
      if (result.error) return showAuthError(result.error);
      window.location.assign(APP_PATH);
    });
  }

  function passkeyCreate() {
    if (!checkStart()) return;
    return run(async () => {
      const result = await client.passkey.addPasskey({
        context: JSON.stringify({ email, locale, ageConfirmed: true }),
        createSession: true,
      });
      if (result.error) return showAuthError(result.error);
      window.location.assign(APP_PATH);
    });
  }

  function sendCode(event?: SubmitEvent) {
    event?.preventDefault();
    if (!checkStart()) return;
    return run(async () => {
      const result = await client.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      if (result.error) return showAuthError(result.error);
      digits = ['', '', '', '', '', ''];
      step = 'code';
      resendAt = Date.now() + RESEND_SECONDS * 1000;
      now = Date.now();
      await tick();
      digitInputs[0]?.focus();
    });
  }

  function verifyCode(event?: SubmitEvent) {
    event?.preventDefault();
    const otp = digits.join('');
    if (!/^\d{6}$/.test(otp)) {
      setError('signIn.errorCodeIncomplete', 'code');
      return;
    }
    return run(async () => {
      const result = await client.signIn.emailOtp({
        email,
        otp,
        ...(mode === 'create' && { ageConfirmed: true, locale }),
      });
      if (result.error) {
        if (result.error.code === 'AGE_CONFIRMATION_REQUIRED') {
          // Signing in with an address that has no account yet: offer to create it (the code is used up).
          mode = 'create';
          step = 'start';
          setError('signIn.errorNoAccount', 'age');
          return;
        }
        showAuthError(result.error);
        digits = ['', '', '', '', '', ''];
        await tick();
        digitInputs[0]?.focus();
        return;
      }
      window.location.assign(APP_PATH);
    });
  }

  function useOtherEmail() {
    step = 'start';
    setError(null);
    void tick().then(() => emailInput?.focus());
  }

  function fillDigits(text: string, from: number) {
    const incoming = text
      .replace(/\D/g, '')
      .slice(0, 6 - from)
      .split('');
    if (incoming.length === 0) return;
    const next = [...digits];
    incoming.forEach((digit, offset) => (next[from + offset] = digit));
    digits = next;
    const focusAt = Math.min(from + incoming.length, 5);
    digitInputs[focusAt]?.focus();
    if (next.every((digit) => digit !== '')) void verifyCode();
  }

  function onDigitInput(index: number, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');
    if (value.length > 1) return fillDigits(value, index === 0 ? 0 : index);
    const next = [...digits];
    next[index] = value;
    digits = next;
    input.value = value;
    if (value && index < 5) digitInputs[index + 1]?.focus();
    if (next.every((digit) => digit !== '')) void verifyCode();
  }

  function onDigitKey(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = '';
      digits = next;
      digitInputs[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      digitInputs[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < 5) {
      digitInputs[index + 1]?.focus();
    }
  }

  function onDigitPaste(index: number, event: ClipboardEvent) {
    event.preventDefault();
    fillDigits(event.clipboardData?.getData('text') ?? '', index);
  }
</script>

<div class="sign-in" data-mode={mode} data-step={step}>
  {#if step === 'start'}
    <fieldset class="sign-in__modes">
      <legend class="visually-hidden">{t('signIn.modeLabel')}</legend>
      <div class="segmented">
        <label class="segmented__item">
          <input
            type="radio"
            name="sign-in-mode"
            value="sign-in"
            checked={mode === 'sign-in'}
            onchange={() => switchMode('sign-in')}
          />
          <span>{t('signIn.modeSignIn')}</span>
        </label>
        <label class="segmented__item">
          <input
            type="radio"
            name="sign-in-mode"
            value="create"
            checked={mode === 'create'}
            onchange={() => switchMode('create')}
          />
          <span>{t('signIn.modeCreate')}</span>
        </label>
      </div>
    </fieldset>

    <h2 class="sign-in__title">{mode === 'create' ? t('signIn.titleCreate') : t('signIn.title')}</h2>

    {#if error}
      <p class="sign-in__error" id="sign-in-error" role="alert">
        <Icon name="alert" />
        <span>{t(error)}</span>
      </p>
    {/if}

    <form class="sign-in__form" novalidate onsubmit={sendCode}>
      <div class="field">
        <label class="field__label" for="sign-in-email">{t('signIn.email')}</label>
        <input
          bind:this={emailInput}
          bind:value={email}
          class="field__input"
          id="sign-in-email"
          name="email"
          type="email"
          inputmode="email"
          autocomplete="email webauthn"
          autocapitalize="off"
          spellcheck="false"
          required
          aria-invalid={errorField === 'email' ? 'true' : undefined}
          aria-describedby={errorField === 'email'
            ? 'sign-in-error sign-in-email-hint'
            : 'sign-in-email-hint'}
        />
        <p class="field__hint" id="sign-in-email-hint">{t('signIn.emailHint')}</p>
      </div>

      {#if mode === 'create'}
        <div class="sign-in__check">
          <input
            id="sign-in-age"
            type="checkbox"
            bind:checked={ageConfirmed}
            aria-invalid={errorField === 'age' ? 'true' : undefined}
            aria-describedby={errorField === 'age' ? 'sign-in-error' : undefined}
          />
          <label for="sign-in-age">
            {#each ageParts as part, i (i)}
              {#if part === '{terms}'}
                <a href={termsHref}>{t('signIn.ageTerms')}</a>
              {:else if part === '{privacy}'}
                <a href={privacyHref}>{t('signIn.agePrivacy')}</a>
              {:else}
                {part}
              {/if}
            {/each}
          </label>
        </div>
      {/if}

      {#if passkeys}
        <button
          class="btn btn--primary btn--lg"
          type="button"
          disabled={busy || !ready}
          onclick={mode === 'create' ? passkeyCreate : passkeySignIn}
        >
          <Icon name="key" />
          {mode === 'create' ? t('signIn.passkeyCreate') : t('signIn.passkey')}
        </button>
        <p class="sign-in__or"><span>{t('signIn.or')}</span></p>
      {:else}
        <p class="sign-in__note">{t('signIn.noPasskeySupport')}</p>
      {/if}

      <button
        class={['btn btn--lg', passkeys ? 'btn--secondary' : 'btn--primary']}
        type="submit"
        disabled={busy || !ready}
      >
        <Icon name="mail" />
        {t('signIn.sendCode')}
      </button>
    </form>

    <!-- The tip fills the space the error would take, so the card keeps one height with or without it. -->
    {#if mode === 'sign-in' && !error}
      <aside class="sign-in__tip" aria-labelledby="sign-in-tip-title">
        <h3 class="sign-in__tip-title" id="sign-in-tip-title">
          <Icon name="key" />{t('signIn.tipPasskeyTitle')}
        </h3>
        <p>{t('signIn.tipPasskey')}</p>
      </aside>
    {/if}
  {:else}
    <h2 class="sign-in__title">{t('signIn.codeLegend')}</h2>
    <p class="sign-in__lead" aria-live="polite">
      {t('signIn.codeSent', { email })}
      {t('signIn.codeExpires')}
    </p>

    {#if error}
      <p class="sign-in__error" id="sign-in-error" role="alert">
        <Icon name="alert" />
        <span>{t(error)}</span>
      </p>
    {/if}

    <form class="sign-in__form" novalidate onsubmit={verifyCode}>
      <fieldset class="code" aria-describedby={errorField === 'code' ? 'sign-in-error' : undefined}>
        <legend class="visually-hidden">{t('signIn.codeLegend')}</legend>
        <div class="code__digits">
          {#each digits as digit, i (i)}
            <input
              bind:this={digitInputs[i]}
              class="code__digit num"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength={i === 0 ? 6 : 1}
              autocomplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={t('signIn.codeDigit', { n: i + 1 })}
              aria-invalid={errorField === 'code' ? 'true' : undefined}
              value={digit}
              disabled={!ready}
              readonly={busy}
              aria-busy={busy ? 'true' : undefined}
              oninput={(event) => onDigitInput(i, event)}
              onkeydown={(event) => onDigitKey(i, event)}
              onpaste={(event) => onDigitPaste(i, event)}
            />
          {/each}
        </div>
      </fieldset>

      <button class="btn btn--primary btn--lg" type="submit" disabled={busy || !ready}>
        {busy ? t('signIn.working') : t('signIn.verify')}
      </button>

      <div class="sign-in__links">
        {#if secondsLeft > 0}
          <p class="sign-in__muted">{t('signIn.resendIn', { time: countdown })}</p>
        {:else}
          <button class="btn btn--ghost" type="button" disabled={busy || !ready} onclick={() => sendCode()}>
            {t('signIn.resend')}
          </button>
        {/if}
        <button class="btn btn--ghost" type="button" onclick={useOtherEmail}>{t('signIn.otherEmail')}</button>
      </div>
    </form>

    {#if !error}
      <aside class="sign-in__tip" aria-labelledby="sign-in-tip-title">
        <h3 class="sign-in__tip-title" id="sign-in-tip-title">
          <Icon name="mail" />{t('signIn.tipCodeTitle')}
        </h3>
        <p>{t('signIn.tipCode')}</p>
      </aside>
    {/if}
  {/if}
</div>

<style>
  /* A column as tall as the panel, so the tip can sit at the bottom instead of leaving a blank strip. */
  .sign-in {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .sign-in__tip {
    display: grid;
    gap: var(--space-1);
    margin-block-start: auto;
    padding: var(--space-4);
    border-radius: var(--radius-m);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .sign-in__tip-title {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    color: var(--ink);
    font-family: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: normal;
  }

  .sign-in__tip-title :global(svg) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    color: var(--accent);
  }

  .sign-in__modes {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .sign-in__modes .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .sign-in__title {
    font-size: 1.375rem;
    line-height: 1.1;
  }

  .sign-in__lead {
    color: var(--ink-2);
  }

  .sign-in__form {
    display: grid;
    gap: var(--space-4);
  }

  .sign-in__error {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    padding: var(--space-3);
    border: 1px solid var(--negative);
    border-radius: var(--radius-s);
    color: var(--ink);
    font-weight: 500;
  }

  .sign-in__error :global(svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--negative);
  }

  .sign-in__check {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .sign-in__check input {
    flex: none;
    width: 1.375rem;
    height: 1.375rem;
    margin: 0.0625rem 0 0;
    accent-color: var(--accent);
  }

  .sign-in__check input[aria-invalid='true'] {
    outline: 2px solid var(--negative);
    outline-offset: 2px;
  }

  .sign-in__or {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .sign-in__or::before,
  .sign-in__or::after {
    content: '';
    flex: 1;
    border-block-start: 1px solid var(--line);
  }

  .sign-in__note,
  .sign-in__muted {
    color: var(--ink-2);
    font-size: 0.875rem;
  }

  .sign-in__links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }

  /* Next to the reassurance card the panel is tall: give the parts room instead of bunching them up. */
  @media (min-width: 52rem) {
    .sign-in {
      gap: var(--space-6);
    }

    .sign-in__form {
      gap: var(--space-5);
    }
  }

  .code {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .code__digits {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 3.25rem));
    gap: var(--space-2);
  }

  .code__digit {
    width: 100%;
    min-width: 0;
    height: 3.5rem;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    background: var(--surface);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 1.375rem;
    text-align: center;
  }

  .code__digit:focus-visible {
    border-color: var(--accent);
  }

  .code__digit[aria-invalid='true'] {
    border-color: var(--negative);
  }
</style>
