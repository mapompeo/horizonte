<script lang="ts">
  import type { PrepStep } from '../../../shared/types'
  import { copyFor, progress, stepRows } from '../lib/copy'

  interface Props {
    step: PrepStep
  }

  let { step }: Props = $props()

  const copy = $derived(copyFor({ screen: 'preparing', mode: 'send', step }))
  const rows = $derived(stepRows(step))
  const percent = $derived(progress(step))
</script>

<h1 class="title">{copy.title}</h1>
<div
  class="bar"
  role="progressbar"
  aria-label="Progresso"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={percent}
>
  <div class="bar-fill" style="width: {percent}%"></div>
</div>
<ul class="steps">
  {#each rows as row (row.label)}
    <li class="step step-{row.status}">
      {#if row.status === 'done'}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ok-fg)"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" />
        </svg>
      {:else if row.status === 'active'}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke-width="2.4"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" stroke="var(--line)" /><path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="var(--fg)"
          />
        </svg>
      {:else}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--line)"
          stroke-width="2.4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
      {/if}
      {row.label}
    </li>
  {/each}
</ul>
