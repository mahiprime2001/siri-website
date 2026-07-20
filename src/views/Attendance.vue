<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Store as StoreIcon,
  Users,
  Smartphone,
  Plus,
  UserX,
  UserCheck,
  ScanFace,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-vue-next'
import { format, parseISO } from 'date-fns'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fmtDateInput } from '../lib/format'
import type {
  AttendanceDevice,
  AttendanceEmployee,
  AttendanceRecord,
  Store,
} from '../lib/types'

// ---------------- state ----------------

const stores = ref<Store[]>([])
const selectedStoreId = ref<string>('')
const error = ref<string | null>(null)

type Preset = 'today' | 'yesterday' | 'custom'
const preset = ref<Preset>('today')
const dateFrom = ref(fmtDateInput(new Date()))
const dateTo = ref(fmtDateInput(new Date()))

const employees = ref<AttendanceEmployee[]>([])
const records = ref<AttendanceRecord[]>([])
const loading = ref(false)
const expanded = ref<Record<string, boolean>>({})
const photoPreview = ref<string | null>(null)

type Drawer = 'members' | 'devices' | null
const drawer = ref<Drawer>(null)

// members drawer
const newName = ref('')
const addingEmployee = ref(false)

// devices drawer
const devices = ref<AttendanceDevice[]>([])
const loadingDevices = ref(false)
const copiedCode = ref<string | null>(null)

const selectedStore = computed(() =>
  stores.value.find((s) => s.id === selectedStoreId.value)
)
const singleDay = computed(() => dateFrom.value === dateTo.value)

// ---------------- loading ----------------

onMounted(() => {
  loadStores()
  subscribeDevices()
})

onUnmounted(() => {
  if (storeChannel) supabase.removeChannel(storeChannel)
  if (devicesChannel) supabase.removeChannel(devicesChannel)
})

// ---------------- live updates (Supabase Realtime, no polling) ----------------

let storeChannel: RealtimeChannel | null = null
let devicesChannel: RealtimeChannel | null = null

/** Collapses a burst of rapid-fire realtime events (e.g. a phone that was
 *  offline dumping many queued records at once) into a single reload, so
 *  the photo thumbnails don't flicker by re-fetching on every single event. */
function debounce(fn: () => void, waitMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, waitMs)
  }
}

const debouncedLoadRecords = debounce(() => loadRecords(), 600)
const debouncedLoadEmployees = debounce(() => loadEmployees(), 600)
const debouncedLoadDevices = debounce(() => loadDevices(), 600)

function subscribeStore(storeId: string) {
  if (storeChannel) {
    supabase.removeChannel(storeChannel)
    storeChannel = null
  }
  if (!storeId) return
  storeChannel = supabase
    .channel(`attendance-store-${storeId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance_records', filter: `store_id=eq.${storeId}` },
      () => debouncedLoadRecords()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance_employees', filter: `store_id=eq.${storeId}` },
      () => debouncedLoadEmployees()
    )
    .subscribe()
}

function subscribeDevices() {
  devicesChannel = supabase
    .channel('attendance-devices-all')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance_devices' },
      () => {
        if (drawer.value === 'devices') debouncedLoadDevices()
      }
    )
    .subscribe()
}

async function loadStores() {
  try {
    const { data, error: err } = await supabase
      .from('stores')
      .select('id, name, address, phone, status, storecode')
      .order('name', { ascending: true })
    if (err) throw err
    stores.value = (data ?? []) as Store[]
    if (!selectedStoreId.value && stores.value.length) {
      selectedStoreId.value = stores.value[0].id
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load stores'
  }
}

function setPreset(p: Preset) {
  preset.value = p
  const today = fmtDateInput(new Date())
  if (p === 'today') {
    dateFrom.value = today
    dateTo.value = today
  } else if (p === 'yesterday') {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    dateFrom.value = fmtDateInput(y)
    dateTo.value = fmtDateInput(y)
  }
}

watch(
  selectedStoreId,
  (id) => {
    refresh()
    subscribeStore(id)
    if (drawer.value === 'devices') loadDevices()
  },
  { immediate: true }
)
watch([dateFrom, dateTo], () => loadRecords())

async function refresh() {
  if (!selectedStoreId.value) return
  error.value = null
  expanded.value = {}
  await Promise.all([loadEmployees(), loadRecords()])
}

async function loadEmployees() {
  try {
    const { data, error: err } = await supabase
      .from('attendance_employees')
      .select('id, store_id, name, status, enroll_status, photo_url, enrolled_at, created_at')
      .eq('store_id', selectedStoreId.value)
      .order('name', { ascending: true })
    if (err) throw err
    employees.value = (data ?? []) as AttendanceEmployee[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load employees'
  }
}

async function loadRecords() {
  if (!selectedStoreId.value) return
  loading.value = true
  try {
    const { data, error: err } = await supabase
      .from('attendance_records')
      .select('id, employee_id, store_id, device_id, type, ts, match_score, photo_url')
      .eq('store_id', selectedStoreId.value)
      .gte('ts', `${dateFrom.value}T00:00:00`)
      .lte('ts', `${dateTo.value}T23:59:59`)
      .order('ts', { ascending: true })
    if (err) throw err
    records.value = (data ?? []) as AttendanceRecord[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load attendance'
  } finally {
    loading.value = false
  }
}

// ---------------- per-employee summary ----------------

interface Session {
  inRec: AttendanceRecord | null
  outRec: AttendanceRecord | null
}
interface EmpDay {
  date: string
  sessions: Session[]
}
interface EmpSummary {
  emp: AttendanceEmployee
  daysPresent: number
  totalDays: number
  leaves: number
  days: EmpDay[] // newest first
  // single-day convenience
  firstIn: AttendanceRecord | null
  lastOut: AttendanceRecord | null
  hours: string
}

function dayMs(d: string): number {
  return new Date(`${d}T00:00:00`).getTime()
}

const summaries = computed<EmpSummary[]>(() => {
  const byEmp = new Map<string, AttendanceRecord[]>()
  for (const r of records.value) {
    ;(byEmp.get(r.employee_id) ?? byEmp.set(r.employee_id, []).get(r.employee_id)!).push(r)
  }
  const today = fmtDateInput(new Date())
  const rangeEnd = dateTo.value < today ? dateTo.value : today

  return employees.value.map((emp) => {
    const recs = byEmp.get(emp.id) ?? []
    // group by date, pair in->out
    const dayMap = new Map<string, EmpDay>()
    for (const r of recs) {
      const date = r.ts.slice(0, 10)
      let day = dayMap.get(date)
      if (!day) {
        day = { date, sessions: [] }
        dayMap.set(date, day)
      }
      const openSession = day.sessions.find((s) => s.inRec && !s.outRec)
      if (r.type === 'in') {
        day.sessions.push({ inRec: r, outRec: null })
      } else if (openSession) {
        openSession.outRec = r
      } else {
        day.sessions.push({ inRec: null, outRec: r })
      }
    }
    const days = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date))

    // leaves: counted from when they joined, never into the future
    const created = (emp.created_at ?? '').slice(0, 10)
    const start =
      created && created > dateFrom.value ? created : dateFrom.value
    let totalDays = 0
    if (start <= rangeEnd) {
      totalDays = Math.round((dayMs(rangeEnd) - dayMs(start)) / 86_400_000) + 1
    }
    const daysPresent = days.length
    const leaves = Math.max(0, totalDays - daysPresent)

    // single-day columns
    const todaySessions = days[0]?.sessions ?? []
    const firstIn = todaySessions.find((s) => s.inRec)?.inRec ?? null
    const outs = todaySessions.filter((s) => s.outRec)
    const lastOut = outs.length ? outs[outs.length - 1].outRec : null

    return {
      emp,
      daysPresent,
      totalDays,
      leaves,
      days,
      firstIn,
      lastOut,
      hours: days[0] ? dayHours(days[0]) : '—',
    }
  })
})

const presentCount = computed(
  () => summaries.value.filter((s) => s.daysPresent > 0).length
)
const totalLeaves = computed(() =>
  summaries.value
    .filter((s) => s.emp.status === 'active')
    .reduce((sum, s) => sum + s.leaves, 0)
)
const stillIn = computed(() => {
  const today = fmtDateInput(new Date())
  let n = 0
  for (const s of summaries.value) {
    const d = s.days.find((x) => x.date === today)
    if (d && d.sessions.some((x) => x.inRec && !x.outRec)) n++
  }
  return n
})

function dayHours(day: EmpDay): string {
  let ms = 0
  for (const s of day.sessions) {
    if (s.inRec && s.outRec) {
      ms += new Date(s.outRec.ts).getTime() - new Date(s.inRec.ts).getTime()
    }
  }
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return h ? `${h}h ${m}m` : `${m}m`
}

function fmtTime(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    return format(parseISO(s), 'hh:mm a')
  } catch {
    return '—'
  }
}

function fmtDay(s: string): string {
  try {
    return format(parseISO(s), 'EEE, dd MMM')
  } catch {
    return s
  }
}

function isToday(date: string): boolean {
  return date === fmtDateInput(new Date())
}

// ---------------- members drawer actions ----------------

async function addEmployee() {
  const name = newName.value.trim()
  if (!name || !selectedStoreId.value) return
  addingEmployee.value = true
  error.value = null
  try {
    const { error: err } = await supabase.from('attendance_employees').insert({
      store_id: selectedStoreId.value,
      name,
      status: 'active',
      enroll_status: 'pending',
    })
    if (err) throw err
    newName.value = ''
    await loadEmployees()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add employee'
  } finally {
    addingEmployee.value = false
  }
}

async function reEnroll(emp: AttendanceEmployee) {
  if (!confirm(`Re-enroll ${emp.name}? Their current face data will be replaced at the next capture on the shop phone.`)) return
  const { error: err } = await supabase
    .from('attendance_employees')
    .update({ enroll_status: 'pending', face_embeddings: null })
    .eq('id', emp.id)
  if (err) error.value = err.message
  await loadEmployees()
}

async function toggleEmployee(emp: AttendanceEmployee) {
  const next = emp.status === 'active' ? 'disabled' : 'active'
  if (next === 'disabled' && !confirm(`Disable ${emp.name}? Their face will stop marking attendance.`)) return
  const { error: err } = await supabase
    .from('attendance_employees')
    .update({ status: next })
    .eq('id', emp.id)
  if (err) error.value = err.message
  await loadEmployees()
}

async function deleteEmployee(emp: AttendanceEmployee) {
  if (
    !confirm(
      `Delete ${emp.name} completely? Their face data AND all attendance history will be deleted. Use Disable instead if you only want to stop their scans.`
    )
  )
    return
  try {
    const { error: e1 } = await supabase
      .from('attendance_records')
      .delete()
      .eq('employee_id', emp.id)
    if (e1) throw e1
    const { error: e2 } = await supabase
      .from('attendance_employees')
      .delete()
      .eq('id', emp.id)
    if (e2) throw e2
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete employee'
  }
  await refresh()
}

// ---------------- devices drawer actions ----------------

function openDrawer(d: Exclude<Drawer, null>) {
  drawer.value = d
  if (d === 'devices') loadDevices()
}

async function loadDevices() {
  loadingDevices.value = true
  try {
    // All shops at once — the drawer groups them per store.
    const { data, error: err } = await supabase
      .from('attendance_devices')
      .select('id, store_id, name, activation_code, status, device_info, last_seen, activated_at, app_version')
      .order('created_at', { ascending: false })
    if (err) throw err
    devices.value = (data ?? []) as AttendanceDevice[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load devices'
  } finally {
    loadingDevices.value = false
  }
}

const devicesByStore = computed(() => {
  const map: Record<string, AttendanceDevice[]> = {}
  for (const d of devices.value) {
    ;(map[d.store_id] ??= []).push(d)
  }
  return map
})

function genCode(): string {
  // Simple 6-digit code — quick to type on a phone's numpad.
  return String(Math.floor(100000 + Math.random() * 900000))
}

const creatingFor = ref<string | null>(null)

async function createDevice(store: Store) {
  creatingFor.value = store.id
  try {
    const { error: err } = await supabase.from('attendance_devices').insert({
      store_id: store.id,
      name: `${store.name ?? 'Shop'} phone`,
      activation_code: genCode(),
      status: 'unclaimed',
    })
    if (err) throw err
    await loadDevices()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create device'
  } finally {
    creatingFor.value = null
  }
}

async function removeDevice(d: AttendanceDevice) {
  const msg =
    d.status === 'unclaimed'
      ? 'Remove this unused activation code?'
      : 'Remove this phone? The app on it resets and can be added again with a new code. Attendance history stays.'
  if (!confirm(msg)) return
  try {
    const { error: e1 } = await supabase
      .from('attendance_records')
      .update({ device_id: null })
      .eq('device_id', d.id)
    if (e1) throw e1
    const { error: e2 } = await supabase
      .from('attendance_devices')
      .delete()
      .eq('id', d.id)
    if (e2) throw e2
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove device'
  }
  await loadDevices()
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    copiedCode.value = code
    setTimeout(() => (copiedCode.value = null), 1500)
  } catch {
    /* clipboard unavailable */
  }
}

function isOnline(d: AttendanceDevice): boolean {
  if (!d.last_seen) return false
  return Date.now() - new Date(d.last_seen).getTime() < 2 * 60 * 1000
}
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8 space-y-4 max-w-6xl mx-auto">
    <!-- page header -->
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div class="min-w-0">
        <h1 class="page-title">Attendance</h1>
        <p class="page-sub mt-0.5">Face check-ins across every shop.</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-ghost !px-3" title="Members" @click="openDrawer('members')">
          <Users :size="15" />
          <span class="hidden sm:inline">Members</span>
          <span class="count-badge">{{ employees.length }}</span>
        </button>
        <button class="btn btn-ghost !px-3" title="Devices" @click="openDrawer('devices')">
          <Smartphone :size="15" />
          <span class="hidden sm:inline">Devices</span>
        </button>
      </div>
    </header>

    <!-- toolbar -->
    <section class="card p-3.5 flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <StoreIcon :size="14" class="text-[var(--color-text-dim)]" />
        <select v-model="selectedStoreId" class="input !w-52">
          <option v-for="s in stores" :key="s.id" :value="s.id">
            {{ s.name || s.id }}
          </option>
        </select>
      </div>

      <div class="flex items-center gap-1.5">
        <button class="preset-chip" :class="{ active: preset === 'today' }" @click="setPreset('today')">
          Today
        </button>
        <button class="preset-chip" :class="{ active: preset === 'yesterday' }" @click="setPreset('yesterday')">
          Yesterday
        </button>
        <button class="preset-chip" :class="{ active: preset === 'custom' }" @click="setPreset('custom')">
          Pick days
        </button>
      </div>

      <div v-if="preset === 'custom'" class="flex items-center gap-2">
        <input v-model="dateFrom" type="date" class="input date-input !w-38" />
        <span class="text-[var(--color-text-dim)] text-sm">→</span>
        <input v-model="dateTo" type="date" class="input date-input !w-38" />
      </div>
    </section>

    <div
      v-if="error"
      class="card p-3 flex items-center gap-2 text-sm text-[var(--color-danger)] border-[oklch(56%_0.19_25_/_0.3)]"
    >
      <AlertCircle :size="16" />
      {{ error }}
    </div>

    <!-- stat rail -->
    <div class="stat-rail grid-cols-2 sm:grid-cols-4">
      <div class="stat-cell">
        <p class="stat-label">Employees</p>
        <p class="stat-value">{{ employees.filter((e) => e.status === 'active').length }}</p>
      </div>
      <div class="stat-cell">
        <p class="stat-label">Present</p>
        <p class="stat-value" style="color: oklch(38% 0.12 155)">{{ presentCount }}</p>
      </div>
      <div class="stat-cell">
        <p class="stat-label">Leaves</p>
        <p class="stat-value" style="color: oklch(42% 0.13 60)">{{ totalLeaves }}</p>
      </div>
      <div class="stat-cell">
        <p class="stat-label">Still in</p>
        <p class="stat-value" style="color: var(--color-accent)">{{ stillIn }}</p>
      </div>
    </div>

    <!-- ============ per-employee table ============ -->
    <div class="card overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-sm text-[var(--color-text-dim)]">
        Loading…
      </div>
      <div v-else-if="!employees.length" class="p-10 text-center text-[var(--color-text-dim)]">
        <Users :size="28" class="mx-auto mb-2 opacity-60" />
        No employees at {{ selectedStore?.name || 'this shop' }} yet — add them from Members (top right).
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="thead-row">
              <th class="th">Employee</th>
              <th class="th">Present</th>
              <th class="th">Leaves</th>
              <th v-if="singleDay" class="th">IN</th>
              <th v-if="singleDay" class="th">OUT</th>
              <th v-if="singleDay" class="th hidden md:table-cell">Hours</th>
              <th class="th w-10"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="s in summaries" :key="s.emp.id">
              <tr
                class="body-row cursor-pointer"
                :class="{ 'opacity-50': s.emp.status !== 'active' }"
                @click="expanded[s.emp.id] = !expanded[s.emp.id]"
              >
                <td class="td">
                  <div class="flex items-center gap-3">
                    <img
                      v-if="s.emp.photo_url"
                      :src="s.emp.photo_url"
                      class="h-9 w-9 rounded-full object-cover border border-[var(--color-border)]"
                      @click.stop="photoPreview = s.emp.photo_url"
                    />
                    <div
                      v-else
                      class="h-9 w-9 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-xs font-semibold"
                    >
                      {{ s.emp.name.charAt(0).toUpperCase() }}
                    </div>
                    <div class="min-w-0">
                      <p class="font-medium truncate">{{ s.emp.name }}</p>
                      <p v-if="s.emp.enroll_status !== 'enrolled'" class="text-[11px] text-amber-600">
                        Waiting for face scan
                      </p>
                      <p v-else-if="s.emp.status !== 'active'" class="text-[11px] text-red-600">
                        Disabled
                      </p>
                    </div>
                  </div>
                </td>
                <td class="td tabular-nums">
                  <span :class="s.daysPresent ? 'text-green-600' : 'text-[var(--color-text-dim)]'">
                    {{ s.daysPresent }}<span v-if="!singleDay" class="text-[var(--color-text-dim)]"> / {{ s.totalDays }}</span>
                  </span>
                </td>
                <td class="td tabular-nums">
                  <span :class="s.leaves ? 'text-amber-600' : 'text-[var(--color-text-dim)]'">{{ s.leaves }}</span>
                </td>
                <td v-if="singleDay" class="td">
                  <div v-if="s.firstIn" class="flex items-center gap-2">
                    <img
                      v-if="s.firstIn.photo_url"
                      :src="s.firstIn.photo_url"
                      class="thumb"
                      @click.stop="photoPreview = s.firstIn.photo_url"
                    />
                    <span class="tabular-nums text-green-600">{{ fmtTime(s.firstIn.ts) }}</span>
                  </div>
                  <span v-else class="text-[var(--color-text-dim)]">—</span>
                </td>
                <td v-if="singleDay" class="td">
                  <div v-if="s.lastOut" class="flex items-center gap-2">
                    <img
                      v-if="s.lastOut.photo_url"
                      :src="s.lastOut.photo_url"
                      class="thumb"
                      @click.stop="photoPreview = s.lastOut.photo_url"
                    />
                    <span class="tabular-nums text-amber-600">{{ fmtTime(s.lastOut.ts) }}</span>
                  </div>
                  <span v-else-if="s.firstIn && isToday(dateFrom)" class="chip chip-success">
                    <Clock :size="11" />
                    Still in
                  </span>
                  <span v-else class="text-[var(--color-text-dim)]">—</span>
                </td>
                <td v-if="singleDay" class="td hidden md:table-cell tabular-nums text-[var(--color-text-muted)]">
                  {{ s.hours }}
                </td>
                <td class="td text-right text-[var(--color-text-dim)]">
                  <ChevronDown v-if="expanded[s.emp.id]" :size="16" />
                  <ChevronRight v-else :size="16" />
                </td>
              </tr>

              <!-- expanded: every day, every session, with photos -->
              <tr v-if="expanded[s.emp.id]" class="body-row">
                <td :colspan="singleDay ? 7 : 4" class="!p-0 bg-[var(--color-surface-2)]/30">
                  <div v-if="!s.days.length" class="px-6 py-4 text-sm text-[var(--color-text-dim)]">
                    No attendance in this period.
                  </div>
                  <table v-else class="w-full text-sm">
                    <tbody>
                      <template v-for="d in s.days" :key="d.date">
                        <tr
                          v-for="(sess, i) in d.sessions"
                          :key="d.date + i"
                          class="border-b border-[var(--color-border)]/60 last:border-0"
                        >
                          <td class="px-6 py-2 w-36 tabular-nums text-[var(--color-text-muted)]">
                            {{ i === 0 ? fmtDay(d.date) : '' }}
                          </td>
                          <td class="px-4 py-2">
                            <div v-if="sess.inRec" class="flex items-center gap-2">
                              <img
                                v-if="sess.inRec.photo_url"
                                :src="sess.inRec.photo_url"
                                class="thumb"
                                @click="photoPreview = sess.inRec.photo_url"
                              />
                              <span class="tabular-nums text-green-600">IN {{ fmtTime(sess.inRec.ts) }}</span>
                            </div>
                            <span v-else class="text-[var(--color-text-dim)]">—</span>
                          </td>
                          <td class="px-4 py-2">
                            <div v-if="sess.outRec" class="flex items-center gap-2">
                              <img
                                v-if="sess.outRec.photo_url"
                                :src="sess.outRec.photo_url"
                                class="thumb"
                                @click="photoPreview = sess.outRec.photo_url"
                              />
                              <span class="tabular-nums text-amber-600">OUT {{ fmtTime(sess.outRec.ts) }}</span>
                            </div>
                            <span v-else-if="isToday(d.date)" class="chip chip-success">
                              <Clock :size="11" />
                              Still in
                            </span>
                            <span v-else class="text-[var(--color-text-dim)]">no out</span>
                          </td>
                          <td class="px-4 py-2 w-24 text-right tabular-nums text-[var(--color-text-muted)]">
                            {{ i === d.sessions.length - 1 ? dayHours(d) : '' }}
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ============ MEMBERS drawer ============ -->
    <div v-if="drawer" class="fixed inset-0 z-40">
      <div class="absolute inset-0 bg-black/60" @click="drawer = null" />
      <div
        class="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--color-bg)] border-l border-[var(--color-border)] overflow-y-auto"
      >
        <div
          class="sticky top-0 z-10 flex items-center gap-2 px-4 h-14 border-b border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <component :is="drawer === 'members' ? Users : Smartphone" :size="17" />
          <h2 class="font-semibold mr-auto">
            {{ drawer === 'members' ? `Members · ${selectedStore?.name}` : 'Devices · All shops' }}
          </h2>
          <button class="btn btn-ghost !p-2" @click="drawer = null">
            <X :size="16" />
          </button>
        </div>

        <!-- members -->
        <div v-if="drawer === 'members'" class="p-4 space-y-3">
          <div class="flex gap-2">
            <input
              v-model="newName"
              class="input"
              placeholder="Employee name"
              @keyup.enter="addEmployee"
            />
            <button class="btn btn-primary shrink-0" :disabled="addingEmployee || !newName.trim()" @click="addEmployee">
              <Plus :size="15" />
              Add
            </button>
          </div>
          <p class="text-xs text-[var(--color-text-dim)]">
            After adding, the shop phone shows an ADD popup for this person's face.
          </p>

          <div
            v-for="e in employees"
            :key="e.id"
            class="card p-3 flex items-center gap-3"
          >
            <img
              v-if="e.photo_url"
              :src="e.photo_url"
              class="h-10 w-10 rounded-full object-cover border border-[var(--color-border)] cursor-pointer"
              @click="photoPreview = e.photo_url"
            />
            <div
              v-else
              class="h-10 w-10 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-sm font-semibold"
            >
              {{ e.name.charAt(0).toUpperCase() }}
            </div>
            <div class="min-w-0 mr-auto">
              <p class="font-medium text-sm truncate">{{ e.name }}</p>
              <span class="chip mt-0.5" :class="e.enroll_status === 'enrolled' ? 'chip-success' : 'chip-warn'">
                <ScanFace :size="10" />
                {{ e.enroll_status === 'enrolled' ? 'Enrolled' : 'Waiting for scan' }}
              </span>
            </div>
            <div class="flex flex-col gap-1.5 items-end">
              <div class="flex gap-1.5">
                <button
                  v-if="e.enroll_status === 'enrolled'"
                  class="icon-action"
                  title="Re-enroll face"
                  @click="reEnroll(e)"
                >
                  <ScanFace :size="14" />
                </button>
                <button
                  class="icon-action"
                  :title="e.status === 'active' ? 'Disable' : 'Enable'"
                  @click="toggleEmployee(e)"
                >
                  <UserX v-if="e.status === 'active'" :size="14" />
                  <UserCheck v-else :size="14" />
                </button>
                <button
                  class="icon-action danger"
                  title="Delete permanently"
                  @click="deleteEmployee(e)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
              <span v-if="e.status !== 'active'" class="chip chip-danger">Disabled</span>
            </div>
          </div>
        </div>

        <!-- devices: every shop, grouped -->
        <div v-else class="p-4 space-y-4">
          <div v-if="loadingDevices" class="p-6 text-center text-sm text-[var(--color-text-dim)]">
            Loading…
          </div>

          <div v-for="s in stores" v-else :key="s.id" class="card overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
              <StoreIcon :size="14" class="text-[var(--color-text-dim)]" />
              <p class="text-sm font-semibold mr-auto truncate">{{ s.name || s.id }}</p>
              <button
                class="btn btn-ghost !py-1 !px-2.5 text-xs"
                :disabled="creatingFor === s.id"
                @click="createDevice(s)"
              >
                <Plus :size="12" />
                New code
              </button>
            </div>

            <p
              v-if="!(devicesByStore[s.id] ?? []).length"
              class="px-3 py-3 text-xs text-[var(--color-text-dim)]"
            >
              No phone yet — generate a code and enter it in the app.
            </p>
            <div
              v-for="d in devicesByStore[s.id] ?? []"
              v-else
              :key="d.id"
              class="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--color-border)] last:border-0"
            >
              <div
                class="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                :class="isOnline(d) ? 'bg-green-500/10 text-green-600' : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)]'"
              >
                <Smartphone :size="15" />
              </div>
              <div class="min-w-0 mr-auto">
                <p class="text-[11px] text-[var(--color-text-dim)] truncate">
                  {{ d.device_info || 'Not activated yet' }}
                  <template v-if="d.app_version"> · v{{ d.app_version }}</template>
                  <template v-if="d.last_seen"> · {{ fmtTime(d.last_seen) }}</template>
                </p>
                <button
                  v-if="d.status === 'unclaimed' && d.activation_code"
                  class="chip font-mono mt-1 cursor-pointer hover:border-[var(--color-accent)]"
                  @click="copyCode(d.activation_code)"
                >
                  {{ d.activation_code }}
                  <CheckCircle2 v-if="copiedCode === d.activation_code" :size="11" class="text-green-600" />
                  <Copy v-else :size="11" />
                </button>
              </div>
              <span
                class="chip"
                :class="d.status === 'unclaimed' ? 'chip-warn' : isOnline(d) ? 'chip-success' : ''"
              >
                {{ d.status === 'unclaimed' ? 'Waiting' : isOnline(d) ? 'Online' : 'Offline' }}
              </span>
              <button class="icon-action danger" title="Remove device" @click="removeDevice(d)">
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- photo lightbox -->
    <div
      v-if="photoPreview"
      class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
      @click="photoPreview = null"
    >
      <img :src="photoPreview" class="max-h-full max-w-full rounded-lg" />
    </div>
  </div>
</template>

<style scoped>
.preset-chip {
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
}
.preset-chip:hover {
  background: var(--color-surface-2);
}
.preset-chip.active {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-accent-ink);
}

.count-badge {
  font-size: 0.6875rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.thead-row {
  text-align: left;
  font-size: 0.6875rem;
  color: var(--color-text-dim);
  border-bottom: 1px solid var(--color-border);
}
.th {
  padding: 0.625rem 1rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.body-row {
  border-bottom: 1px solid var(--color-border);
}
.body-row:last-child {
  border-bottom: none;
}
.td {
  padding: 0.625rem 1rem;
}
.thumb {
  height: 2.25rem;
  width: 2.25rem;
  border-radius: 0.375rem;
  object-fit: cover;
  cursor: pointer;
  border: 1px solid var(--color-border);
}

.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.9rem;
  width: 1.9rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.icon-action:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}
.icon-action.danger {
  color: var(--color-danger);
}
.icon-action.danger:hover {
  border-color: rgba(220, 38, 38, 0.4);
  background: rgba(220, 38, 38, 0.08);
}
</style>
