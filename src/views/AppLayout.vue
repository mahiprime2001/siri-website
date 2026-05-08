<script setup lang="ts">
import { useRouter } from 'vue-router'
import { LogOut, Receipt } from 'lucide-vue-next'
import { useAuth } from '../lib/auth'

const { user, logout } = useAuth()
const router = useRouter()

function handleLogout() {
  logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="relative z-10 flex min-h-screen">
    <aside
      class="hidden md:flex w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/60 backdrop-blur-md"
    >
      <div
        class="flex items-center gap-3 px-5 h-16 border-b border-[var(--color-border)]"
      >
        <img src="/Logo.png" alt="Siri" class="h-8 w-8 rounded-md" />
        <div class="flex flex-col">
          <span class="text-sm font-semibold leading-tight">Siri Admin</span>
          <span class="text-[11px] text-[var(--color-text-dim)] leading-tight"
            >Bills viewer</span
          >
        </div>
      </div>

      <div class="p-3 border-b border-[var(--color-border)]">
        <div class="flex items-center gap-3 px-2 py-2">
          <div
            class="h-9 w-9 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center text-sm font-semibold"
          >
            {{ (user?.name || user?.email || '?').charAt(0).toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate">{{ user?.name || 'Admin' }}</p>
            <p class="text-xs text-[var(--color-text-dim)] truncate">
              {{ user?.email }}
            </p>
          </div>
        </div>
        <button class="btn btn-ghost w-full mt-2" @click="handleLogout">
          <LogOut :size="14" />
          <span>Sign out</span>
        </button>
      </div>

      <nav class="flex-1 p-3 space-y-1">
        <router-link
          :to="{ name: 'bills' }"
          class="nav-link"
          active-class="active"
        >
          <Receipt :size="16" />
          <span>Bills by store</span>
        </router-link>
      </nav>
    </aside>

    <main class="flex-1 min-w-0">
      <header
        class="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 h-14 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur-md"
      >
        <div class="flex items-center gap-2 min-w-0">
          <img src="/Logo.png" alt="Siri" class="h-7 w-7 rounded-md shrink-0" />
          <span class="text-sm font-semibold truncate">Siri Admin</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div
            class="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)]"
          >
            <div
              class="h-6 w-6 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center text-[11px] font-semibold"
            >
              {{ (user?.name || user?.email || '?').charAt(0).toUpperCase() }}
            </div>
            <span class="text-xs text-[var(--color-text-muted)] truncate max-w-[80px]">
              {{ user?.name || 'Admin' }}
            </span>
          </div>
          <button
            class="btn btn-ghost !py-1.5 !px-2"
            @click="handleLogout"
            aria-label="Sign out"
          >
            <LogOut :size="14" />
          </button>
        </div>
      </header>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.nav-link {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 500;
  transition:
    background 0.15s,
    color 0.15s;
  text-decoration: none;
}
.nav-link:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}
.nav-link.active {
  background: linear-gradient(
    180deg,
    rgba(170, 59, 255, 0.18),
    rgba(170, 59, 255, 0.06)
  );
  color: #fff;
  border: 1px solid rgba(170, 59, 255, 0.35);
  padding: calc(0.55rem - 1px) calc(0.75rem - 1px);
}
</style>
