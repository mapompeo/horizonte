<script lang="ts">
  import { L } from '../lib/i18n'
  import type { ErrorCode } from '../../../shared/errors'

  /** O código do erro, sempre visível, e o link para a linha dele na tabela do site (o que fazer, com mais calma). */
  let { code }: { code: ErrorCode } = $props()
</script>

<span class="error-code"
  >{L({ pt: 'Código', en: 'Code', es: 'Código' })} <b>{code}</b> ·
  <button class="link link-inline" onclick={() => window.horizonte.openErrorHelp(code)}
    >{L({ pt: 'Como resolver', en: 'How to fix', es: 'Cómo resolverlo' })}</button
  ></span
>
