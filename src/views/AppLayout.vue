<script setup lang="ts">
import { useRouter } from 'vue-router'
import { CalendarCheck, LogOut, Receipt } from 'lucide-vue-next'
import { useAuth } from '../lib/auth'

const { user, logout } = useAuth()
const router = useRouter()

const nav = [
  { name: 'bills', label: 'Bills', icon: Receipt },
  { name: 'attendance', label: 'Attendance', icon: CalendarCheck },
]

function handleLogout() {
  logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="shell">
    <!-- desktop sidebar -->
    <aside class="sidebar">
      <div class="sidebar__brand">
        <img src="/Logo.png" alt="Siri" class="sidebar__logo" />
        <div class="min-w-0">
          <p class="sidebar__wordmark">Siri Admin</p>
          <p class="sidebar__tag">Ops console</p>
        </div>
      </div>

      <nav class="sidebar__nav">
        <router-link
          v-for="item in nav"
          :key="item.name"
          :to="{ name: item.name }"
          class="nav-link"
          active-class="active"
        >
          <component :is="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar__foot">
        <div class="sidebar__user">
          <div class="avatar">
            {{ (user?.name || user?.email || '?').charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="sidebar__user-name">{{ user?.name || 'Admin' }}</p>
            <p class="sidebar__user-email">{{ user?.email }}</p>
          </div>
        </div>
        <button class="btn btn-ghost w-full mt-2.5" @click="handleLogout">
          <LogOut :size="14" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>

    <!-- mobile top bar -->
    <header class="topbar">
      <div class="flex items-center gap-2 min-w-0">
        <img src="/Logo.png" alt="Siri" class="h-7 w-7 rounded-md shrink-0" />
        <span class="font-display font-semibold text-sm truncate">Siri Admin</span>
      </div>
      <button class="avatar avatar--sm" aria-label="Account" @click="handleLogout">
        {{ (user?.name || user?.email || '?').charAt(0).toUpperCase() }}
      </button>
    </header>

    <main class="content">
      <router-view />
    </main>

    <!-- mobile bottom tab bar — 2 destinations, thumb-reachable, always visible -->
    <nav class="tabbar">
      <router-link
        v-for="item in nav"
        :key="item.name"
        :to="{ name: item.name }"
        class="tabbar__item"
        active-class="active"
      >
        <component :is="item.icon" :size="20" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  display: flex;
}

/* ---------- desktop sidebar ---------- */
.sidebar {
  display: none;
  width: 17rem;
  flex-shrink: 0;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}
@media (min-width: 60rem) {
  .sidebar {
    display: flex;
  }
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1.25rem;
  height: 4rem;
  border-bottom: 1px solid var(--color-border);
}
.sidebar__logo {
  height: 2rem;
  width: 2rem;
  border-radius: 0.5rem;
}
.sidebar__wordmark {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.9375rem;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.sidebar__tag {
  font-size: 0.6875rem;
  color: var(--color-text-dim);
  line-height: 1.2;
}

.sidebar__nav {
  flex: 1;
  padding: 0.875rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 150ms cubic-bezier(0.16, 1, 0.3, 1),
    color 150ms cubic-bezier(0.16, 1, 0.3, 1);
  text-decoration: none;
  border-left: 3px solid transparent;
}
.nav-link:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}
.nav-link.active {
  background: var(--color-surface-2);
  color: var(--color-accent);
  font-weight: 600;
  border-left-color: var(--color-accent);
}

.sidebar__foot {
  padding: 0.875rem;
  border-top: 1px solid var(--color-border);
}
.sidebar__user {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.25rem;
}
.sidebar__user-name {
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar__user-email {
  font-size: 0.6875rem;
  color: var(--color-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.avatar {
  height: 2.125rem;
  width: 2.125rem;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8125rem;
  font-weight: 600;
  flex-shrink: 0;
}
.avatar--sm {
  height: 1.875rem;
  width: 1.875rem;
  font-size: 0.75rem;
  border: none;
  cursor: pointer;
}

/* ---------- mobile top bar ---------- */
.topbar {
  display: none;
  position: sticky;
  top: 0;
  z-index: 20;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0 1rem;
  height: 3.25rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
@media (max-width: 59.99rem) {
  .topbar {
    display: flex;
  }
}

/* ---------- content ---------- */
.content {
  flex: 1;
  min-width: 0;
  padding-bottom: 0;
}
@media (max-width: 59.99rem) {
  .content {
    padding-bottom: 4.25rem; /* clears the fixed tab bar */
  }
}

/* ---------- mobile bottom tab bar ---------- */
.tabbar {
  display: none;
}
@media (max-width: 59.99rem) {
  .tabbar {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 30;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
}
.tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1875rem;
  padding: 0.5rem 0 0.625rem;
  min-height: 3rem;
  color: var(--color-text-dim);
  font-size: 0.6875rem;
  font-weight: 500;
  text-decoration: none;
}
.tabbar__item.active {
  color: var(--color-accent);
}
</style>
