import { ref, computed } from 'vue'
import { supabase } from './supabase'
import type { User } from './types'

const STORAGE_KEY = 'siri_admin_session'
const SESSION_TTL_HOURS = 8

interface Session {
  user: User
  expiresAt: number
}

const session = ref<Session | null>(loadSession())

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.expiresAt || parsed.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function persistSession(s: Session | null) {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  else localStorage.removeItem(STORAGE_KEY)
}

export function useAuth() {
  const user = computed(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => session.value !== null)
  const isAdmin = computed(
    () => session.value?.user.role?.toLowerCase() === 'super_admin'
  )

  async function login(email: string, password: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, status, password')
      .ilike('email', email.trim())
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Invalid email or password')

    const status = (data.status ?? '').toLowerCase()
    if (status && status !== 'active') {
      throw new Error('Account is not active. Contact your administrator.')
    }

    if (!data.password || data.password !== password) {
      throw new Error('Invalid email or password')
    }

    if ((data.role ?? '').toLowerCase() !== 'super_admin') {
      throw new Error('Only super_admin accounts can sign in here.')
    }

    const u: User = {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      status: data.status,
    }
    const s: Session = {
      user: u,
      expiresAt: Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000,
    }
    session.value = s
    persistSession(s)
    return u
  }

  function logout() {
    session.value = null
    persistSession(null)
  }

  return { user, isAuthenticated, isAdmin, login, logout }
}
