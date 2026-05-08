<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { animate } from 'animejs'
import { Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-vue-next'
import { useAuth } from '../lib/auth'

const { login } = useAuth()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const card = ref<HTMLElement | null>(null)

onMounted(() => {
  if (card.value) {
    animate(card.value, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 600,
      ease: 'out(3)',
    })
  }
})

async function onSubmit() {
  if (loading.value) return
  error.value = null
  if (!email.value.trim() || !password.value) {
    error.value = 'Please enter your email and password.'
    return
  }
  loading.value = true
  try {
    await login(email.value, password.value)
    const redirect = (route.query.redirect as string) || '/bills'
    router.replace(redirect)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Sign in failed.'
    if (card.value) {
      animate(card.value, {
        translateX: [0, -8, 8, -6, 6, -3, 3, 0],
        duration: 450,
        ease: 'inOut(2)',
      })
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative z-10 min-h-screen flex items-center justify-center p-6">
    <div ref="card" class="card w-full max-w-md p-8 relative overflow-hidden">
      <div
        class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/60 to-transparent"
      ></div>

      <div class="flex items-center gap-3 mb-7">
        <div
          class="h-11 w-11 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden"
        >
          <img src="/Logo.png" alt="Siri" class="h-7 w-7 object-contain" />
        </div>
        <div>
          <h1 class="text-lg font-semibold text-white leading-tight">
            Welcome back
          </h1>
          <p class="text-xs text-[var(--color-text-dim)] leading-tight">
            Sign in to the Siri admin panel
          </p>
        </div>
      </div>

      <form @submit.prevent="onSubmit" class="space-y-4" autocomplete="on">
        <div>
          <label class="text-xs text-[var(--color-text-muted)] mb-1.5 block"
            >Email</label
          >
          <input
            v-model="email"
            type="email"
            class="input"
            autocomplete="email"
            placeholder="admin@example.com"
            :disabled="loading"
          />
        </div>

        <div>
          <label class="text-xs text-[var(--color-text-muted)] mb-1.5 block"
            >Password</label
          >
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="input pr-10"
              autocomplete="current-password"
              placeholder="••••••••"
              :disabled="loading"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 px-3 text-[var(--color-text-dim)] hover:text-white transition"
              @click="showPassword = !showPassword"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
            >
              <Eye v-if="!showPassword" :size="16" />
              <EyeOff v-else :size="16" />
            </button>
          </div>
        </div>

        <div
          v-if="error"
          class="flex items-start gap-2 text-sm text-[#fca5a5] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] rounded-lg px-3 py-2"
        >
          <AlertCircle :size="16" class="mt-0.5 shrink-0" />
          <span>{{ error }}</span>
        </div>

        <button
          type="submit"
          class="btn btn-primary w-full !py-2.5"
          :disabled="loading"
        >
          <span v-if="loading" class="spinner"></span>
          <span>{{ loading ? 'Signing in…' : 'Sign in' }}</span>
        </button>
      </form>

      <div
        class="mt-6 pt-5 border-t border-[var(--color-border)] flex items-center gap-2 text-xs text-[var(--color-text-dim)]"
      >
        <ShieldCheck :size="14" class="text-[var(--color-accent)]" />
        Admin-only access. Sessions expire after 8 hours.
      </div>
    </div>
  </div>
</template>
