<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import AuthLayout from '~/layouts/auth.vue'
import PasswordField from '~/components/password_field.vue'

defineOptions({ layout: AuthLayout })

const features = [
  'Exactly-once email delivery, even after a crash',
  'Segments that recompute themselves in real time',
  'Campaigns that resume exactly where they left off',
]
</script>

<template>
  <Head title="Log in" />

  <div class="grid min-h-screen lg:grid-cols-2">
    <aside
      class="brand-panel relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between"
    >
      <div class="dot-grid absolute inset-0" />
      <svg
        class="mark-ghost pointer-events-none absolute top-8 -right-24"
        width="440"
        height="159"
        viewBox="0 0 105 38"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0 0h7.5v15H0ZM7.5 15h7.5v15H7.5ZM15 30h7.5v7.5H15ZM22.5 15h7.5v15H22.5ZM30 0h7.5v15H30ZM45 0h7.5v30h15v-30h7.5v37.5h-30v-37.5ZM82.5 37.5V0H105v7.5H90V15h15v7.5H90V30h15v7.5H82.5Z"
          fill="currentColor"
        />
      </svg>

      <div class="relative z-10 flex items-center gap-2.5 px-12 pt-10">
        <svg
          width="30"
          height="11"
          viewBox="0 0 105 38"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0 0h7.5v15H0ZM7.5 15h7.5v15H7.5ZM15 30h7.5v7.5H15ZM22.5 15h7.5v15H22.5ZM30 0h7.5v15H30ZM45 0h7.5v30h15v-30h7.5v37.5h-30v-37.5ZM82.5 37.5V0H105v7.5H90V15h15v7.5H90V30h15v7.5H82.5Z"
            fill="currentColor"
          />
        </svg>
        <span class="tag-mono text-[0.7rem] text-white/70">basalt</span>
      </div>

      <div class="relative z-10 px-12 py-14">
        <p class="tag-mono mb-5 text-[0.7rem] text-amber-300/90">MARKETING INFRASTRUCTURE</p>
        <h2 class="headline max-w-md text-[2.6rem] leading-[1.05] text-white">
          Automation that never double-sends.
        </h2>
        <p class="mt-5 max-w-sm text-[0.95rem] leading-relaxed text-white/60">
          Segments, campaigns, and email delivery — orchestrated with the same rigor as the
          infrastructure it runs on.
        </p>

        <ul class="mt-10 flex flex-col gap-4">
          <li v-for="(feature, index) in features" :key="feature" class="flex items-start gap-3.5">
            <span class="index-badge">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="pt-0.5 text-sm text-white/75">{{ feature }}</span>
          </li>
        </ul>
      </div>

      <div class="relative z-10 border-t border-white/10 px-12 py-6">
        <p class="tag-mono text-[0.65rem] text-white/35">Built for reliability, not for demos.</p>
      </div>
    </aside>

    <div class="flex flex-col px-6 pt-14 pb-10 sm:px-10 lg:justify-center lg:px-20 lg:py-16">
      <div class="mx-auto w-full max-w-sm auth-copy">
        <Link route="home" class="mb-10 flex items-center gap-2.5 lg:hidden">
          <svg
            width="30"
            height="11"
            viewBox="0 0 105 38"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 0h7.5v15H0ZM7.5 15h7.5v15H7.5ZM15 30h7.5v7.5H15ZM22.5 15h7.5v15H22.5ZM30 0h7.5v15H30ZM45 0h7.5v30h15v-30h7.5v37.5h-30v-37.5ZM82.5 37.5V0H105v7.5H90V15h15v7.5H90V30h15v7.5H82.5Z"
              fill="currentColor"
            />
          </svg>
          <span class="tag-mono text-[0.7rem] opacity-60">basalt</span>
        </Link>

        <p class="tag-mono mb-3 text-[0.7rem] text-primary">AUTHENTICATE</p>
        <h1 class="headline text-3xl">Welcome back</h1>
        <p class="mt-2.5 mb-9 text-sm opacity-60">Log in to keep your campaigns running.</p>

        <Form v-slot="{ processing, errors }" route="session.store" class="flex flex-col gap-5">
          <label for="email" class="form-control block">
            <span class="field-label mb-1.5 block">Email</span>
            <input
              id="email"
              type="email"
              name="email"
              autocomplete="username"
              autofocus
              class="input input-bordered w-full"
              :class="{ 'input-error': errors.email }"
            />
            <span v-if="errors.email" class="mt-1.5 block text-sm text-error">{{
              errors.email
            }}</span>
          </label>

          <PasswordField
            id="password"
            name="password"
            label="Password"
            autocomplete="current-password"
            :error="errors.password"
          />

          <button type="submit" class="btn btn-primary mt-2 w-full" :disabled="processing">
            {{ processing ? 'Signing in…' : 'Log in' }}
          </button>
        </Form>

        <p class="mt-8 text-center text-sm opacity-60">
          Don't have an account?
          <Link route="new_account.create" class="link link-primary font-medium no-underline"
            >Create one</Link
          >
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-copy,
.brand-panel {
  font-family: 'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif;
}

.headline {
  font-family: 'Unbounded', ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.tag-mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.field-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in oklab, currentColor 60%, transparent);
}

.brand-panel {
  background: #0b0c0b;
  color: white;
}

.dot-grid {
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.14) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: linear-gradient(to bottom, black, transparent 85%);
}

.mark-ghost {
  color: white;
  opacity: 0.05;
}

.index-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.9rem;
  height: 1.9rem;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(255, 176, 84, 0.35);
  background: rgba(255, 176, 84, 0.08);
  color: rgb(252, 197, 116);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.7rem;
  font-weight: 500;
}
</style>
