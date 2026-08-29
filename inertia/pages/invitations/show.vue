<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

defineProps<{
  token: string
  invitation: {
    id: number
    email: string
    role: string
    isExpired: boolean
    isPending: boolean
    organization?: { id: number; name: string }
    invitedBy?: { id: number; fullName: string | null; email: string }
  } | null
}>()
</script>

<template>
  <Head title="Invitation" />

  <div class="mx-auto max-w-md px-4 py-16 text-center">
    <template v-if="invitation && invitation.isPending">
      <h1 class="mb-2 text-2xl font-semibold">Join {{ invitation.organization?.name }}</h1>
      <p class="mb-8 opacity-70">
        {{ invitation.invitedBy?.fullName ?? invitation.invitedBy?.email }} invited you to join as
        <strong>{{ invitation.role }}</strong
        >.
      </p>

      <div class="flex justify-center gap-3">
        <Form route="invitations.decline" :params="{ token }">
          <button type="submit" class="btn btn-ghost">Decline</button>
        </Form>
        <Form route="invitations.accept" :params="{ token }">
          <button type="submit" class="btn btn-primary">Accept invitation</button>
        </Form>
      </div>
    </template>

    <template v-else-if="invitation && !invitation.isPending">
      <h1 class="mb-2 text-2xl font-semibold">This invitation is no longer valid</h1>
      <p class="opacity-70">
        It may have already been accepted, declined, revoked, or expired. Ask an organization admin
        to send a new one.
      </p>
    </template>

    <template v-else>
      <h1 class="mb-2 text-2xl font-semibold">Invitation not found</h1>
      <p class="opacity-70">This invitation link is invalid.</p>
    </template>
  </div>
</template>
