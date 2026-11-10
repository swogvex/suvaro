<!--
  "Add a passkey" button (Settings › Security). Registers a passkey for the signed-in user, then reloads
  the page with a confirmation toast; errors are shown next to the button.
  Props: locale, messages (`signIn.*` errors + `security.addPasskey`).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient, supportsPasskeys } from '../../lib/auth-client';
  import { authErrorKey } from '../../lib/auth-errors';
  import Icon from '../ui/Icon.svelte';
  import type { Locale, UiKey } from '../../i18n';

  interface Props {
    locale: Locale;
    messages: Partial<Record<UiKey, string>>;
  }

  let { locale, messages }: Props = $props();

  let supported = $state(true);
  let busy = $state(false);
  let ready = $state(false);
  let error = $state<UiKey | null>(null);

  onMount(() => {
    supported = supportsPasskeys();
    ready = true;
  });

  async function add() {
    if (busy) return;
    busy = true;
    error = null;
    try {
      const client = createClient(locale);
      const result = await client.passkey.addPasskey();
      if (result.error) {
        error = authErrorKey(result.error);
        return;
      }
      window.location.assign(`${window.location.pathname}?done=passkey-added`);
    } catch {
      error = 'signIn.errorNetwork';
    } finally {
      busy = false;
    }
  }
</script>

<div class="add-passkey">
  {#if supported}
    <button class="btn btn--secondary" type="button" disabled={busy || !ready} onclick={add}>
      <Icon name="plus" />
      {messages['security.addPasskey']}
    </button>
  {:else}
    <p class="add-passkey__note">{messages['signIn.noPasskeySupport']}</p>
  {/if}
  {#if error}
    <p class="add-passkey__error" role="alert">{messages[error]}</p>
  {/if}
</div>

<style>
  .add-passkey {
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }

  .add-passkey__note {
    color: var(--ink-2);
  }

  .add-passkey__error {
    color: var(--negative);
    font-weight: 500;
  }
</style>
