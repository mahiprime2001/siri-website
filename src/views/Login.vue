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
      translateY: [10, 0],
      duration: 400,
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
        translateX: [0, -6, 6, -4, 4, 0],
        duration: 320,
        ease: 'inOut(2)',
      })
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 bg-[var(--color-bg)]">
    <div ref="card" class="w-full max-w-[23rem]">
      <div class="flex flex-col items-center text-center mb-7">
        <div class="brand-mark">
          <img src="/Logo.png" alt="Siri" class="h-7 w-7 object-contain" />
        </div>
        <h1 class="font-display font-semibold text-xl text-[var(--color-text)] mt-3.5">
          Siri Admin
        </h1>
        <p class="text-sm text-[var(--color-text-dim)] mt-1">
          Sign in to view bills and attendance
        </p>
      </div>

      <div class="card p-6">
        <form @submit.prevent="onSubmit" class="space-y-3.5" autocomplete="on">
          <div>
            <label class="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
              Email
            </label>
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
            <label class="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
              Password
            </label>
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
                class="absolute inset-y-0 right-0 px-3 text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
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
            class="flex items-start gap-2 text-sm text-[var(--color-danger)] bg-[oklch(56%_0.19_25_/_0.08)] border border-[oklch(56%_0.19_25_/_0.25)] rounded-lg px-3 py-2"
          >
            <AlertCircle :size="16" class="mt-0.5 shrink-0" />
            <span>{{ error }}</span>
          </div>

          <button type="submit" class="btn btn-primary w-full !h-11" :disabled="loading">
            <span v-if="loading" class="spinner"></span>
            <span>{{ loading ? 'Signing in…' : 'Sign in' }}</span>
          </button>
        </form>
      </div>

      <div
        class="mt-5 flex items-center justify-center gap-2 text-xs text-[var(--color-text-dim)]"
      >
        <ShieldCheck :size="13" />
        Admin-only access · sessions expire after 8 hours
      </div>
    </div>
  </div>
</template>

<style scoped>
.brand-mark {
  height: 3rem;
  width: 3rem;
  border-radius: 0.875rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
