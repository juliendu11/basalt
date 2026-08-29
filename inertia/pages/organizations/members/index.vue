<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

const props = defineProps<{
  organization: { id: number; name: string; slug: string; ownerUserId: number }
  memberships: Array<{
    id: number
    role: 'owner' | 'admin' | 'member' | 'viewer'
    joinedAt: string | null
    user?: { id: number; fullName: string | null; email: string; initials: string }
  }>
  pendingInvitations: Array<{
    id: number
    email: string
    role: 'owner' | 'admin' | 'member' | 'viewer'
    expiresAt: string | null
    isExpired: boolean
  }>
}>()

const assignableRoles = ['admin', 'member', 'viewer'] as const

function confirmRemoval(event: MouseEvent, name: string) {
  if (!confirm(`Remove ${name} from ${props.organization.name}?`)) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="Members" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-8 text-2xl font-semibold">{{ organization.name }}</h1>

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-medium">Invite a member</h2>
      <Form
        v-slot="{ processing, errors }"
        route="organization_invitations.store"
        :params="{ organizationId: organization.id }"
        class="flex flex-wrap items-end gap-3"
      >
        <label class="form-control">
          <span class="label-text mb-1">Email</span>
          <input
            name="email"
            type="email"
            class="input input-bordered"
            :class="{ 'input-error': errors.email }"
          />
          <span v-if="errors.email" class="mt-1 text-sm text-error">{{ errors.email }}</span>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Role</span>
          <select name="role" class="select select-bordered">
            <option v-for="role in assignableRoles" :key="role" :value="role">{{ role }}</option>
          </select>
        </label>

        <button type="submit" class="btn btn-primary" :disabled="processing">Send invite</button>
      </Form>
    </section>

    <section v-if="pendingInvitations.length > 0" class="mb-10">
      <h2 class="mb-3 text-lg font-medium">Pending invitations</h2>
      <ul class="flex flex-col gap-2">
        <li
          v-for="invitation in pendingInvitations"
          :key="invitation.id"
          class="flex items-center justify-between rounded-box border border-base-200 px-4 py-2"
        >
          <div>
            <span>{{ invitation.email }}</span>
            <span class="badge badge-ghost badge-sm ml-2">{{ invitation.role }}</span>
            <span v-if="invitation.isExpired" class="badge badge-warning badge-sm ml-2">
              expired
            </span>
          </div>
          <Form
            method="delete"
            route="organization_invitations.destroy"
            :params="{ organizationId: organization.id, invitationId: invitation.id }"
          >
            <button type="submit" class="btn btn-ghost btn-xs">Revoke</button>
          </Form>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="mb-3 text-lg font-medium">Members</h2>
      <div class="flex flex-col gap-2">
        <div
          v-for="membership in memberships"
          :key="membership.id"
          class="card border border-base-200"
        >
          <div class="card-body">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium">{{ membership.user?.fullName ?? membership.user?.email }}</p>
                <p class="text-sm opacity-60">{{ membership.user?.email }}</p>
              </div>

              <div class="flex items-center gap-2">
                <span v-if="membership.role === 'owner'" class="badge badge-primary badge-sm">
                  owner
                </span>

                <Form
                  v-else
                  v-slot="{ processing }"
                  method="patch"
                  route="organization_members.update"
                  :params="{ organizationId: organization.id, membershipId: membership.id }"
                  class="flex items-center gap-2"
                >
                  <select
                    name="role"
                    class="select select-bordered select-xs"
                    :value="membership.role"
                  >
                    <option v-for="role in assignableRoles" :key="role" :value="role">
                      {{ role }}
                    </option>
                  </select>
                  <button type="submit" class="btn btn-ghost btn-xs" :disabled="processing">
                    Update
                  </button>
                </Form>

                <Form
                  v-if="membership.role !== 'owner'"
                  method="delete"
                  route="organization_members.destroy"
                  :params="{ organizationId: organization.id, membershipId: membership.id }"
                >
                  <button
                    type="submit"
                    class="btn btn-ghost btn-xs text-error"
                    @click="
                      confirmRemoval(
                        $event,
                        membership.user?.fullName ?? membership.user?.email ?? 'this member'
                      )
                    "
                  >
                    Remove
                  </button>
                </Form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
