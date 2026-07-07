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
  Ban,
  CheckCircle2,
  AlertCircle,
  Inbox,
  LogIn,
  LogOut,
} from 'lucide-vue-next'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtDateInput } from '../lib/format'
import type {
  AttendanceDevice,
  AttendanceEmployee,
  AttendanceRecord,
  Store,
} from '../lib/types'

type Tab = 'employees' | 'attendance' | 'devices'

const stores = ref<Store[]>([])
const selectedStoreId = ref<string>('')
const tab = ref<Tab>('attendance')
const error = ref<string | null>(null)

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

// devices
const devices = ref<AttendanceDevice[]>([])
const loadingDevices = ref(false)
const creatingDevice = ref(false)
const copiedCode = ref<string | null>(null)

const selectedStore = computed(() =>
  stores.value.find((s) => s.id === selectedStoreId.value)
)

onMounted(loadStores)

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

watch([selectedStoreId, tab], () => refresh(), { immediate: false })
watch([dateFrom, dateTo, employeeFilter], () => {
  if (tab.value === 'attendance') loadRecords()
})

function refresh() {
  if (!selectedStoreId.value) return
  error.value = null
  if (tab.value === 'employees') loadEmployees()
  if (tab.value === 'attendance') {
    loadEmployees()
    loadRecords()
  }
  if (tab.value === 'devices') loadDevices()
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
    await loadEmployees()
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

const presentToday = computed(() => {
  const seen = new Set<string>()
  for (const r of records.value) seen.add(r.employee_id)
  return seen.size
})

// ---------------- devices ----------------

async function loadDevices() {
  loadingDevices.value = true
  try {
    const { data, error: err } = await supabase
      .from('attendance_devices')
      .select('id, store_id, name, activation_code, status, device_info, last_seen, activated_at')
      .eq('store_id', selectedStoreId.value)
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

async function createDevice() {
  if (!selectedStoreId.value) return
  creatingDevice.value = true
  try {
    const { error: err } = await supabase.from('attendance_devices').insert({
      store_id: selectedStoreId.value,
      name: `${selectedStore.value?.name ?? 'Shop'} phone`,
      activation_code: genCode(),
      status: 'unclaimed',
    })
    if (err) throw err
    await loadDevices()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create device'
  } finally {
    creatingDevice.value = false
  }
}

async function toggleDevice(d: AttendanceDevice) {
  const next = d.status === 'disabled' ? 'active' : 'disabled'
  if (next === 'disabled' && !confirm('Deactivate this device? The app on that phone will lock immediately.')) return
  const { error: err } = await supabase
    .from('attendance_devices')
    .update({ status: next })
    .eq('id', d.id)
  if (err) error.value = err.message
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
  <div class="p-4 md:p-6 space-y-4 max-w-6xl">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-lg font-semibold mr-auto">Attendance</h1>
      <div class="flex items-center gap-2">
        <StoreIcon :size="16" class="text-[var(--color-text-dim)]" />
        <select v-model="selectedStoreId" class="input !w-56">
          <option v-for="s in stores" :key="s.id" :value="s.id">
            {{ s.name || s.id }}
          </option>
        </select>
      </div>
    </div>

    <div class="flex gap-2">
      <button
        v-for="t in [
          { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
          { id: 'employees', label: 'Employees', icon: Users },
          { id: 'devices', label: 'Devices', icon: Smartphone },
        ]"
        :key="t.id"
        class="btn"
        :class="tab === t.id ? 'btn-primary' : 'btn-ghost'"
        @click="tab = t.id as Tab"
      >
        <component :is="t.icon" :size="15" />
        {{ t.label }}
      </button>
      <button class="btn btn-ghost ml-auto" @click="refresh">
        <RefreshCw :size="15" />
      </button>
    </div>

    <div
      v-if="error"
      class="card p-3 flex items-center gap-2 text-sm text-red-400 border-red-500/30"
    >
      <AlertCircle :size="16" />
      {{ error }}
    </div>

    <!-- ================= ATTENDANCE ================= -->
    <template v-if="tab === 'attendance'">
      <div class="card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label class="block text-xs text-[var(--color-text-dim)] mb-1">From</label>
          <input v-model="dateFrom" type="date" class="input date-input !w-40" />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-dim)] mb-1">To</label>
          <input v-model="dateTo" type="date" class="input date-input !w-40" />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-dim)] mb-1">Employee</label>
          <select v-model="employeeFilter" class="input !w-48">
            <option value="">All employees</option>
            <option v-for="e in employees" :key="e.id" :value="e.id">
              {{ e.name }}
            </option>
          </select>
        </div>
        <span class="chip ml-auto">{{ records.length }} scans · {{ presentToday }} people</span>
      </div>

      <div class="card overflow-hidden">
        <div v-if="loadingRecords" class="p-8 text-center text-sm text-[var(--color-text-dim)]">
          Loading…
        </div>
        <div
          v-else-if="!records.length"
          class="p-10 text-center text-[var(--color-text-dim)]"
        >
          <Inbox :size="28" class="mx-auto mb-2 opacity-60" />
          No scans in this period.
        </div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-[var(--color-text-dim)] border-b border-[var(--color-border)]">
              <th class="px-4 py-2.5 font-medium">Employee</th>
              <th class="px-4 py-2.5 font-medium">Type</th>
              <th class="px-4 py-2.5 font-medium">Time</th>
              <th class="px-4 py-2.5 font-medium hidden md:table-cell">Match</th>
              <th class="px-4 py-2.5 font-medium">Photo</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in records"
              :key="r.id"
              class="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/50"
            >
              <td class="px-4 py-2.5 font-medium">
                {{ r.attendance_employees?.name ?? r.employee_id }}
              </td>
              <td class="px-4 py-2.5">
                <span class="chip" :class="r.type === 'in' ? 'chip-success' : 'chip-warn'">
                  <LogIn v-if="r.type === 'in'" :size="11" />
                  <LogOut v-else :size="11" />
                  {{ r.type.toUpperCase() }}
                </span>
              </td>
              <td class="px-4 py-2.5 tabular-nums">{{ fmtDate(r.ts) }}</td>
              <td class="px-4 py-2.5 hidden md:table-cell text-[var(--color-text-dim)]">
                {{ r.match_score != null ? Math.round(Number(r.match_score) * 100) + '%' : '—' }}
              </td>
              <td class="px-4 py-2.5">
                <img
                  v-if="r.photo_url"
                  :src="r.photo_url"
                  class="h-9 w-9 rounded-md object-cover cursor-pointer border border-[var(--color-border)]"
                  @click="photoPreview = r.photo_url"
                />
                <span v-else class="text-[var(--color-text-dim)]">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ================= EMPLOYEES ================= -->
    <template v-if="tab === 'employees'">
      <div class="card p-3 flex flex-wrap items-center gap-2">
        <input
          v-model="newName"
          class="input !w-64"
          placeholder="Employee name"
          @keyup.enter="addEmployee"
        />
        <button class="btn btn-primary" :disabled="addingEmployee || !newName.trim()" @click="addEmployee">
          <Plus :size="15" />
          Add
        </button>
        <p class="text-xs text-[var(--color-text-dim)] w-full md:w-auto md:ml-2">
          After adding, the shop phone opens face enrollment for this person automatically.
        </p>
      </div>

      <div class="card overflow-hidden">
        <div v-if="loadingEmployees" class="p-8 text-center text-sm text-[var(--color-text-dim)]">
          Loading…
        </div>
        <div v-else-if="!employees.length" class="p-10 text-center text-[var(--color-text-dim)]">
          <Users :size="28" class="mx-auto mb-2 opacity-60" />
          No employees yet — add the first one above.
        </div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-[var(--color-text-dim)] border-b border-[var(--color-border)]">
              <th class="px-4 py-2.5 font-medium">Employee</th>
              <th class="px-4 py-2.5 font-medium">Face</th>
              <th class="px-4 py-2.5 font-medium">Status</th>
              <th class="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in employees"
              :key="e.id"
              class="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/50"
            >
              <td class="px-4 py-2.5">
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
              <td class="px-4 py-2.5">
                <span class="chip" :class="e.enroll_status === 'enrolled' ? 'chip-success' : 'chip-warn'">
                  <ScanFace :size="11" />
                  {{ e.enroll_status === 'enrolled' ? 'Enrolled' : 'Waiting for scan' }}
                </span>
              </td>
              <td class="px-4 py-2.5">
                <span class="chip" :class="e.status === 'active' ? 'chip-success' : 'chip-danger'">
                  {{ e.status === 'active' ? 'Active' : 'Disabled' }}
                </span>
              </td>
              <td class="px-4 py-2.5">
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
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ================= DEVICES ================= -->
    <template v-if="tab === 'devices'">
      <div class="card p-3 flex items-center gap-3">
        <button class="btn btn-primary" :disabled="creatingDevice" @click="createDevice">
          <Plus :size="15" />
          New activation code
        </button>
        <p class="text-xs text-[var(--color-text-dim)]">
          Enter the code once in the app on the shop's phone. One code = one phone.
        </p>
      </div>

      <div class="card overflow-hidden">
        <div v-if="loadingDevices" class="p-8 text-center text-sm text-[var(--color-text-dim)]">
          Loading…
        </div>
        <div v-else-if="!devices.length" class="p-10 text-center text-[var(--color-text-dim)]">
          <Smartphone :size="28" class="mx-auto mb-2 opacity-60" />
          No devices for this shop yet.
        </div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-[var(--color-text-dim)] border-b border-[var(--color-border)]">
              <th class="px-4 py-2.5 font-medium">Device</th>
              <th class="px-4 py-2.5 font-medium">Code</th>
              <th class="px-4 py-2.5 font-medium">Status</th>
              <th class="px-4 py-2.5 font-medium hidden md:table-cell">Last seen</th>
              <th class="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in devices"
              :key="d.id"
              class="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/50"
            >
              <td class="px-4 py-2.5">
                <p class="font-medium">{{ d.name || 'Shop phone' }}</p>
                <p class="text-xs text-[var(--color-text-dim)]">{{ d.device_info || '—' }}</p>
              </td>
              <td class="px-4 py-2.5">
                <button
                  v-if="d.status === 'unclaimed' && d.activation_code"
                  class="chip font-mono text-sm cursor-pointer hover:border-[var(--color-accent)]"
                  @click="copyCode(d.activation_code)"
                >
                  {{ d.activation_code }}
                  <CheckCircle2 v-if="copiedCode === d.activation_code" :size="12" class="text-green-400" />
                  <Copy v-else :size="12" />
                </button>
                <span v-else class="text-[var(--color-text-dim)]">used</span>
              </td>
              <td class="px-4 py-2.5">
                <span
                  class="chip"
                  :class="
                    d.status === 'disabled'
                      ? 'chip-danger'
                      : d.status === 'unclaimed'
                        ? 'chip-warn'
                        : isOnline(d)
                          ? 'chip-success'
                          : ''
                  "
                >
                  {{
                    d.status === 'disabled'
                      ? 'Deactivated'
                      : d.status === 'unclaimed'
                        ? 'Waiting for activation'
                        : isOnline(d)
                          ? 'Online'
                          : 'Offline'
                  }}
                </span>
              </td>
              <td class="px-4 py-2.5 hidden md:table-cell text-[var(--color-text-dim)] tabular-nums">
                {{ d.last_seen ? fmtDate(d.last_seen) : '—' }}
              </td>
              <td class="px-4 py-2.5">
                <div class="flex justify-end">
                  <button
                    v-if="d.status !== 'unclaimed'"
                    class="btn btn-ghost !py-1.5 !px-2.5 text-xs"
                    @click="toggleDevice(d)"
                  >
                    <Ban v-if="d.status !== 'disabled'" :size="13" />
                    <CheckCircle2 v-else :size="13" />
                    {{ d.status === 'disabled' ? 'Reactivate' : 'Deactivate' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

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
