<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Store as StoreIcon,
  Users,
  CalendarCheck,
  Smartphone,
  Plus,
  RefreshCw,
  UserX,
  UserCheck,
  ScanFace,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Inbox,
  LogIn,
  LogOut,
  Clock,
} from 'lucide-vue-next'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtDateInput } from '../lib/format'
import type {
  AttendanceDevice,
  AttendanceEmployee,
  AttendanceRecord,
  Store,
} from '../lib/types'

type Tab = 'attendance' | 'employees' | 'devices'

const stores = ref<Store[]>([])
const selectedStoreId = ref<string>('')
const tab = ref<Tab>('attendance')
const error = ref<string | null>(null)

// per-shop rail stats
const railStats = ref<Record<string, { employees: number; present: number }>>({})

// employees
const employees = ref<AttendanceEmployee[]>([])
const loadingEmployees = ref(false)
const newName = ref('')
const addingEmployee = ref(false)

// attendance
const records = ref<AttendanceRecord[]>([])
const loadingRecords = ref(false)
const dateFrom = ref(fmtDateInput(new Date()))
const dateTo = ref(fmtDateInput(new Date()))
const employeeFilter = ref('')
const photoPreview = ref<string | null>(null)
const viewMode = ref<'days' | 'scans'>('days')

// devices (all shops, grouped)
const devices = ref<AttendanceDevice[]>([])
const loadingDevices = ref(false)
const creatingFor = ref<string | null>(null)
const copiedCode = ref<string | null>(null)

// toast (top-right)
const toast = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 7000)
}

const selectedStore = computed(() =>
  stores.value.find((s) => s.id === selectedStoreId.value)
)

const devicesByStore = computed(() => {
  const map: Record<string, AttendanceDevice[]> = {}
  for (const d of devices.value) {
    ;(map[d.store_id] ??= []).push(d)
  }
  return map
})

onMounted(async () => {
  await loadStores()
  loadRailStats()
})

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

async function loadRailStats() {
  try {
    const today = fmtDateInput(new Date())
    const [emps, recs] = await Promise.all([
      supabase.from('attendance_employees').select('id, store_id, status'),
      supabase
        .from('attendance_records')
        .select('store_id, employee_id')
        .gte('ts', `${today}T00:00:00`),
    ])
    const stats: Record<string, { employees: number; present: number }> = {}
    for (const e of (emps.data ?? []) as { store_id: string; status: string }[]) {
      const s = (stats[e.store_id] ??= { employees: 0, present: 0 })
      if (e.status === 'active') s.employees++
    }
    const seen = new Set<string>()
    for (const r of (recs.data ?? []) as { store_id: string; employee_id: string }[]) {
      const key = `${r.store_id}|${r.employee_id}`
      if (seen.has(key)) continue
      seen.add(key)
      const s = (stats[r.store_id] ??= { employees: 0, present: 0 })
      s.present++
    }
    railStats.value = stats
  } catch {
    /* stats are decorative */
  }
}

watch([selectedStoreId, tab], () => refresh())
watch([dateFrom, dateTo, employeeFilter], () => {
  if (tab.value === 'attendance') loadRecords()
})

function refresh() {
  error.value = null
  loadRailStats()
  if (tab.value === 'devices') {
    loadAllDevices()
    return
  }
  if (!selectedStoreId.value) return
  loadEmployees()
  if (tab.value === 'attendance') loadRecords()
}

// ---------------- employees ----------------

async function loadEmployees() {
  loadingEmployees.value = true
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
  } finally {
    loadingEmployees.value = false
  }
}

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
    showToast(
      `${name} added — they must scan their face on the shop phone (popup at the top right of the app) before attendance works.`
    )
    await loadEmployees()
    loadRailStats()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add employee'
  } finally {
    addingEmployee.value = false
  }
}

async function reEnroll(emp: AttendanceEmployee) {
  if (!confirm(`Re-enroll ${emp.name}? Their current face data will be replaced at the next scan on the shop phone.`)) return
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
  loadRailStats()
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
  await loadEmployees()
  loadRailStats()
}

// ---------------- attendance ----------------

async function loadRecords() {
  if (!selectedStoreId.value) return
  loadingRecords.value = true
  try {
    let q = supabase
      .from('attendance_records')
      .select('id, employee_id, store_id, device_id, type, ts, match_score, photo_url, attendance_employees ( name )')
      .eq('store_id', selectedStoreId.value)
      .gte('ts', `${dateFrom.value}T00:00:00`)
      .lte('ts', `${dateTo.value}T23:59:59`)
      .order('ts', { ascending: false })
    if (employeeFilter.value) q = q.eq('employee_id', employeeFilter.value)
    const { data, error: err } = await q
    if (err) throw err
    records.value = (data ?? []) as unknown as AttendanceRecord[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load attendance'
  } finally {
    loadingRecords.value = false
  }
}

const peopleInRange = computed(() => {
  const seen = new Set<string>()
  for (const r of records.value) seen.add(r.employee_id)
  return seen.size
})

// Pair scans into day-wise sessions: each IN opens a session, the next OUT
// of the same employee on the same day closes it. Orphan OUTs get their own row.
interface DaySession {
  key: string
  date: string
  employeeId: string
  name: string
  inRec: AttendanceRecord | null
  outRec: AttendanceRecord | null
}

const sessions = computed<DaySession[]>(() => {
  const asc = [...records.value].sort((a, b) => a.ts.localeCompare(b.ts))
  const open = new Map<string, DaySession>()
  const list: DaySession[] = []
  for (const r of asc) {
    const date = r.ts.slice(0, 10)
    const key = `${r.employee_id}|${date}`
    const name = r.attendance_employees?.name ?? r.employee_id
    if (r.type === 'in') {
      const s: DaySession = {
        key: `${key}|${r.id}`,
        date,
        employeeId: r.employee_id,
        name,
        inRec: r,
        outRec: null,
      }
      list.push(s)
      open.set(key, s)
    } else {
      const s = open.get(key)
      if (s && !s.outRec) {
        s.outRec = r
        open.delete(key)
      } else {
        list.push({
          key: `${key}|${r.id}`,
          date,
          employeeId: r.employee_id,
          name,
          inRec: null,
          outRec: r,
        })
      }
    }
  }
  return list.reverse()
})

const stillIn = computed(
  () => sessions.value.filter((s) => isToday(s.date) && s.inRec && !s.outRec).length
)

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
    return format(parseISO(s), 'dd MMM yyyy')
  } catch {
    return s
  }
}

function sessionDuration(s: DaySession): string {
  if (!s.inRec || !s.outRec) return '—'
  const ms = new Date(s.outRec.ts).getTime() - new Date(s.inRec.ts).getTime()
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return h ? `${h}h ${m}m` : `${m}m`
}

function isToday(date: string): boolean {
  return date === fmtDateInput(new Date())
}

// ---------------- devices ----------------

async function loadAllDevices() {
  loadingDevices.value = true
  try {
    const { data, error: err } = await supabase
      .from('attendance_devices')
      .select('id, store_id, name, activation_code, status, device_info, last_seen, activated_at')
      .order('created_at', { ascending: false })
    if (err) throw err
    devices.value = (data ?? []) as AttendanceDevice[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load devices'
  } finally {
    loadingDevices.value = false
  }
}

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
    if (i === 3) code += '-'
  }
  return code
}

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
    await loadAllDevices()
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
    // Keep history: detach records from the device before deleting it.
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
  await loadAllDevices()
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
  <div class="p-4 md:p-6 space-y-5 max-w-7xl">
    <!-- header -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="mr-auto">
        <h1 class="text-lg font-semibold leading-tight">Attendance</h1>
        <p class="text-xs text-[var(--color-text-dim)]">
          Face check-ins across all shops
        </p>
      </div>
      <button class="btn btn-ghost" @click="refresh">
        <RefreshCw :size="15" />
        <span class="hidden sm:inline">Refresh</span>
      </button>
    </div>

    <!-- tabs -->
    <div
      class="inline-flex p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
    >
      <button
        v-for="t in [
          { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
          { id: 'employees', label: 'Employees', icon: Users },
          { id: 'devices', label: 'Devices', icon: Smartphone },
        ]"
        :key="t.id"
        class="tab-btn"
        :class="{ active: tab === t.id }"
        @click="tab = t.id as Tab"
      >
        <component :is="t.icon" :size="15" />
        {{ t.label }}
      </button>
    </div>

    <div
      v-if="error"
      class="card p-3 flex items-center gap-2 text-sm text-red-400 border-red-500/30"
    >
      <AlertCircle :size="16" />
      {{ error }}
    </div>

    <!-- ============ ATTENDANCE + EMPLOYEES: shop rail + content ============ -->
    <div v-if="tab !== 'devices'" class="flex flex-col lg:flex-row gap-4 items-start">
      <!-- shop rail -->
      <aside class="w-full lg:w-64 shrink-0">
        <p class="rail-label">Shops</p>
        <div
          class="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0"
        >
          <button
            v-for="s in stores"
            :key="s.id"
            class="shop-item"
            :class="{ active: selectedStoreId === s.id }"
            @click="selectedStoreId = s.id"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="shop-icon">
                <StoreIcon :size="15" />
              </div>
              <div class="min-w-0 text-left">
                <p class="text-sm font-medium truncate">{{ s.name || s.id }}</p>
                <p class="text-[11px] text-[var(--color-text-dim)] truncate">
                  {{ railStats[s.id]?.employees ?? 0 }} employees
                </p>
              </div>
            </div>
            <span
              v-if="railStats[s.id]?.present"
              class="chip chip-success shrink-0 !text-[10px]"
            >
              {{ railStats[s.id].present }} in today
            </span>
          </button>
        </div>
      </aside>

      <!-- content -->
      <div class="flex-1 min-w-0 w-full space-y-4">
        <!-- ============ ATTENDANCE ============ -->
        <template v-if="tab === 'attendance'">
          <!-- stat tiles -->
          <div class="grid grid-cols-3 gap-3">
            <div class="card p-3.5">
              <p class="stat-label">People</p>
              <p class="stat-value">{{ peopleInRange }}</p>
            </div>
            <div class="card p-3.5">
              <p class="stat-label">Scans</p>
              <p class="stat-value">{{ records.length }}</p>
            </div>
            <div class="card p-3.5">
              <p class="stat-label">Still in</p>
              <p class="stat-value text-green-400">{{ stillIn }}</p>
            </div>
          </div>

          <!-- filters -->
          <div class="card p-3 flex flex-wrap items-end gap-3">
            <div>
              <label class="filter-label">From</label>
              <input v-model="dateFrom" type="date" class="input date-input !w-40" />
            </div>
            <div>
              <label class="filter-label">To</label>
              <input v-model="dateTo" type="date" class="input date-input !w-40" />
            </div>
            <div>
              <label class="filter-label">Employee</label>
              <select v-model="employeeFilter" class="input !w-44">
                <option value="">All</option>
                <option v-for="e in employees" :key="e.id" :value="e.id">
                  {{ e.name }}
                </option>
              </select>
            </div>
            <div class="ml-auto flex rounded-lg border border-[var(--color-border)] overflow-hidden">
              <button
                class="px-3 py-1.5 text-xs"
                :class="viewMode === 'days' ? 'bg-[var(--color-surface-2)] font-semibold' : 'text-[var(--color-text-dim)]'"
                @click="viewMode = 'days'"
              >
                Day view
              </button>
              <button
                class="px-3 py-1.5 text-xs"
                :class="viewMode === 'scans' ? 'bg-[var(--color-surface-2)] font-semibold' : 'text-[var(--color-text-dim)]'"
                @click="viewMode = 'scans'"
              >
                All scans
              </button>
            </div>
          </div>

          <div class="card overflow-hidden">
            <div v-if="loadingRecords" class="p-8 text-center text-sm text-[var(--color-text-dim)]">
              Loading…
            </div>
            <div v-else-if="!records.length" class="p-10 text-center text-[var(--color-text-dim)]">
              <Inbox :size="28" class="mx-auto mb-2 opacity-60" />
              No scans for {{ selectedStore?.name || 'this shop' }} in this period.
            </div>

            <!-- Day view -->
            <div v-else-if="viewMode === 'days'" class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="thead-row">
                    <th class="th">Employee</th>
                    <th class="th">Date</th>
                    <th class="th">IN</th>
                    <th class="th">OUT</th>
                    <th class="th hidden md:table-cell">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in sessions" :key="s.key" class="body-row">
                    <td class="td font-medium">{{ s.name }}</td>
                    <td class="td tabular-nums text-[var(--color-text-muted)]">
                      {{ fmtDay(s.date) }}
                    </td>
                    <td class="td">
                      <div v-if="s.inRec" class="flex items-center gap-2">
                        <img
                          v-if="s.inRec.photo_url"
                          :src="s.inRec.photo_url"
                          class="thumb"
                          @click="photoPreview = s.inRec.photo_url"
                        />
                        <span class="tabular-nums text-green-400">{{ fmtTime(s.inRec.ts) }}</span>
                      </div>
                      <span v-else class="text-[var(--color-text-dim)]">—</span>
                    </td>
                    <td class="td">
                      <div v-if="s.outRec" class="flex items-center gap-2">
                        <img
                          v-if="s.outRec.photo_url"
                          :src="s.outRec.photo_url"
                          class="thumb"
                          @click="photoPreview = s.outRec.photo_url"
                        />
                        <span class="tabular-nums text-amber-400">{{ fmtTime(s.outRec.ts) }}</span>
                      </div>
                      <span v-else-if="isToday(s.date)" class="chip chip-success">
                        <Clock :size="11" />
                        Still in
                      </span>
                      <span v-else class="text-[var(--color-text-dim)]">—</span>
                    </td>
                    <td class="td hidden md:table-cell tabular-nums text-[var(--color-text-muted)]">
                      {{ sessionDuration(s) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- All scans -->
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="thead-row">
                    <th class="th">Employee</th>
                    <th class="th">Type</th>
                    <th class="th">Time</th>
                    <th class="th hidden md:table-cell">Match</th>
                    <th class="th">Photo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in records" :key="r.id" class="body-row">
                    <td class="td font-medium">
                      {{ r.attendance_employees?.name ?? r.employee_id }}
                    </td>
                    <td class="td">
                      <span class="chip" :class="r.type === 'in' ? 'chip-success' : 'chip-warn'">
                        <LogIn v-if="r.type === 'in'" :size="11" />
                        <LogOut v-else :size="11" />
                        {{ r.type.toUpperCase() }}
                      </span>
                    </td>
                    <td class="td tabular-nums">{{ fmtDate(r.ts) }}</td>
                    <td class="td hidden md:table-cell text-[var(--color-text-dim)]">
                      {{ r.match_score != null ? Math.round(Number(r.match_score) * 100) + '%' : '—' }}
                    </td>
                    <td class="td">
                      <img
                        v-if="r.photo_url"
                        :src="r.photo_url"
                        class="thumb"
                        @click="photoPreview = r.photo_url"
                      />
                      <span v-else class="text-[var(--color-text-dim)]">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>

        <!-- ============ EMPLOYEES ============ -->
        <template v-else>
          <div class="card p-3 flex flex-wrap items-center gap-2">
            <input
              v-model="newName"
              class="input !w-64"
              :placeholder="`New employee at ${selectedStore?.name || 'shop'}`"
              @keyup.enter="addEmployee"
            />
            <button class="btn btn-primary" :disabled="addingEmployee || !newName.trim()" @click="addEmployee">
              <Plus :size="15" />
              Add
            </button>
            <p class="text-xs text-[var(--color-text-dim)] w-full md:w-auto md:ml-2">
              After adding, the shop phone shows a popup for this person to scan their face.
            </p>
          </div>

          <div class="card overflow-hidden">
            <div v-if="loadingEmployees" class="p-8 text-center text-sm text-[var(--color-text-dim)]">
              Loading…
            </div>
            <div v-else-if="!employees.length" class="p-10 text-center text-[var(--color-text-dim)]">
              <Users :size="28" class="mx-auto mb-2 opacity-60" />
              No employees at {{ selectedStore?.name || 'this shop' }} yet — add the first one above.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="thead-row">
                    <th class="th">Employee</th>
                    <th class="th">Face</th>
                    <th class="th">Status</th>
                    <th class="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in employees" :key="e.id" class="body-row">
                    <td class="td">
                      <div class="flex items-center gap-3">
                        <img
                          v-if="e.photo_url"
                          :src="e.photo_url"
                          class="h-9 w-9 rounded-full object-cover border border-[var(--color-border)] cursor-pointer"
                          @click="photoPreview = e.photo_url"
                        />
                        <div
                          v-else
                          class="h-9 w-9 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-xs font-semibold"
                        >
                          {{ e.name.charAt(0).toUpperCase() }}
                        </div>
                        <span class="font-medium">{{ e.name }}</span>
                      </div>
                    </td>
                    <td class="td">
                      <span class="chip" :class="e.enroll_status === 'enrolled' ? 'chip-success' : 'chip-warn'">
                        <ScanFace :size="11" />
                        {{ e.enroll_status === 'enrolled' ? 'Enrolled' : 'Waiting for scan' }}
                      </span>
                    </td>
                    <td class="td">
                      <span class="chip" :class="e.status === 'active' ? 'chip-success' : 'chip-danger'">
                        {{ e.status === 'active' ? 'Active' : 'Disabled' }}
                      </span>
                    </td>
                    <td class="td">
                      <div class="flex justify-end gap-2">
                        <button
                          v-if="e.enroll_status === 'enrolled'"
                          class="btn btn-ghost !py-1.5 !px-2.5 text-xs"
                          @click="reEnroll(e)"
                        >
                          <ScanFace :size="13" />
                          Re-enroll
                        </button>
                        <button class="btn btn-ghost !py-1.5 !px-2.5 text-xs" @click="toggleEmployee(e)">
                          <UserX v-if="e.status === 'active'" :size="13" />
                          <UserCheck v-else :size="13" />
                          {{ e.status === 'active' ? 'Disable' : 'Enable' }}
                        </button>
                        <button
                          class="btn btn-ghost !py-1.5 !px-2.5 text-xs !text-red-400 hover:!border-red-500/50"
                          @click="deleteEmployee(e)"
                        >
                          <Trash2 :size="13" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ============ DEVICES: all shops, grouped ============ -->
    <div v-else class="space-y-4">
      <div v-if="loadingDevices && !devices.length" class="card p-8 text-center text-sm text-[var(--color-text-dim)]">
        Loading…
      </div>
      <div v-for="s in stores" :key="s.id" class="card overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <div class="shop-icon">
            <StoreIcon :size="15" />
          </div>
          <div class="mr-auto min-w-0">
            <p class="text-sm font-semibold truncate">{{ s.name || s.id }}</p>
            <p class="text-[11px] text-[var(--color-text-dim)]">
              {{ (devicesByStore[s.id] ?? []).length }}
              {{ (devicesByStore[s.id] ?? []).length === 1 ? 'device' : 'devices' }}
            </p>
          </div>
          <button
            class="btn btn-ghost !py-1.5 !px-3 text-xs"
            :disabled="creatingFor === s.id"
            @click="createDevice(s)"
          >
            <Plus :size="13" />
            New code
          </button>
        </div>

        <div
          v-if="!(devicesByStore[s.id] ?? []).length"
          class="px-4 py-5 text-sm text-[var(--color-text-dim)]"
        >
          No phone yet — generate a code and enter it in the app on this shop's phone.
        </div>
        <div v-else class="divide-y divide-[var(--color-border)]">
          <div
            v-for="d in devicesByStore[s.id]"
            :key="d.id"
            class="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <div
              class="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
              :class="isOnline(d) ? 'bg-green-500/10 text-green-400' : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)]'"
            >
              <Smartphone :size="16" />
            </div>
            <div class="min-w-0 mr-auto">
              <p class="text-sm font-medium truncate">{{ d.name || 'Shop phone' }}</p>
              <p class="text-[11px] text-[var(--color-text-dim)] truncate">
                {{ d.device_info || 'Not activated yet' }}
                <template v-if="d.last_seen"> · last seen {{ fmtDate(d.last_seen) }}</template>
              </p>
            </div>

            <button
              v-if="d.status === 'unclaimed' && d.activation_code"
              class="chip font-mono text-sm cursor-pointer hover:border-[var(--color-accent)]"
              @click="copyCode(d.activation_code)"
            >
              {{ d.activation_code }}
              <CheckCircle2 v-if="copiedCode === d.activation_code" :size="12" class="text-green-400" />
              <Copy v-else :size="12" />
            </button>

            <span
              class="chip"
              :class="
                d.status === 'unclaimed'
                  ? 'chip-warn'
                  : isOnline(d)
                    ? 'chip-success'
                    : ''
              "
            >
              {{
                d.status === 'unclaimed'
                  ? 'Waiting for activation'
                  : isOnline(d)
                    ? 'Online'
                    : 'Offline'
              }}
            </span>

            <button
              class="btn btn-ghost !py-1.5 !px-2.5 text-xs !text-red-400 hover:!border-red-500/50"
              @click="removeDevice(d)"
            >
              <Trash2 :size="13" />
              Remove
            </button>
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

    <!-- top-right toast -->
    <Transition name="toast">
      <div
        v-if="toast"
        class="fixed top-4 right-4 z-50 max-w-sm card p-3 flex items-start gap-2 text-sm border-amber-500/40 bg-[var(--color-surface)] shadow-xl"
      >
        <ScanFace :size="18" class="text-amber-400 shrink-0 mt-0.5" />
        <p>{{ toast }}</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.9rem;
  border-radius: 0.6rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-muted);
  transition:
    background 0.15s,
    color 0.15s;
}
.tab-btn:hover {
  color: var(--color-text);
}
.tab-btn.active {
  background: linear-gradient(
    180deg,
    rgba(170, 59, 255, 0.22),
    rgba(170, 59, 255, 0.08)
  );
  color: #fff;
  border: 1px solid rgba(170, 59, 255, 0.35);
  padding: calc(0.45rem - 1px) calc(0.9rem - 1px);
}

.rail-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin-bottom: 0.5rem;
  padding-left: 0.25rem;
}
.shop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  min-width: 200px;
  padding: 0.6rem 0.7rem;
  border-radius: 0.7rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  transition:
    border-color 0.15s,
    background 0.15s;
  cursor: pointer;
}
.shop-item:hover {
  background: var(--color-surface-2);
}
.shop-item.active {
  border-color: rgba(170, 59, 255, 0.5);
  background: linear-gradient(
    180deg,
    rgba(170, 59, 255, 0.14),
    rgba(170, 59, 255, 0.04)
  );
}
.shop-icon {
  height: 2rem;
  width: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  flex-shrink: 0;
}
.shop-item.active .shop-icon {
  background: rgba(170, 59, 255, 0.2);
  color: #d8a5ff;
}

.stat-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.filter-label {
  display: block;
  font-size: 0.6875rem;
  color: var(--color-text-dim);
  margin-bottom: 0.25rem;
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
.body-row:hover {
  background: color-mix(in srgb, var(--color-surface-2) 50%, transparent);
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

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
