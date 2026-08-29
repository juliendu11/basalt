<script setup lang="ts">
const config = defineModel<any>({ required: true })

defineProps<{
  emails: { id: number; name: string }[]
  smtpConnectors: { id: number; name: string }[]
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="form-control">
      <span class="label-text mb-1">Email</span>
      <select
        class="select select-bordered select-sm"
        :value="config.emailId ?? ''"
        @change="
          config = { ...config, emailId: Number(($event.target as HTMLSelectElement).value) }
        "
      >
        <option value="" disabled>Select an email...</option>
        <option v-for="e in emails" :key="e.id" :value="e.id">{{ e.name }}</option>
      </select>
    </label>

    <label class="form-control">
      <span class="label-text mb-1">SMTP connector (optional, defaults to project default)</span>
      <select
        class="select select-bordered select-sm"
        :value="config.smtpConnectorId ?? ''"
        @change="
          config = {
            ...config,
            smtpConnectorId: ($event.target as HTMLSelectElement).value
              ? Number(($event.target as HTMLSelectElement).value)
              : undefined,
          }
        "
      >
        <option value="">Project default</option>
        <option v-for="c in smtpConnectors" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </label>
  </div>
</template>
