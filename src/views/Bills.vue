<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { animate } from 'animejs'
import {
  Search,
  Calendar,
  ChevronDown,
  ChevronRight,
  Store as StoreIcon,
  Receipt,
  CreditCard,
  User as UserIcon,
  Phone,
  Mail,
  RefreshCw,
  Inbox,
  AlertCircle,
} from 'lucide-vue-next'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtMoney, fmtDateInput } from '../lib/format'
import type { Bill, BillItem, Store } from '../lib/types'

const PAGE_SIZE = 25

const stores = ref<Store[]>([])
const loadingStores = ref(false)
const storesError = ref<string | null>(null)

const selectedStoreId = ref<string>('')
const search = ref('')
const dateFrom = ref('')
const dateTo = ref('')

const bills = ref<Bill[]>([])
const totalCount = ref(0)
const loadingBills = ref(false)
const billsError = ref<string | null>(null)
const page = ref(1)

const expanded = ref<Record<string, boolean>>({})
const itemsByBill = ref<Record<string, BillItem[]>>({})
const loadingItems = ref<Record<string, boolean>>({})

const todayTotal = ref(0)
const todayDiscount = ref(0)
const todayCount = ref(0)
const loadingToday = ref(false)

const tableEl = ref<HTMLElement | null>(null)
const summary = computed(() => {
  const list = bills.value
  return {
    count: totalCount.value,
    total: list.reduce((s, b) => s + Number(b.total ?? 0), 0),
  }
})
const selectedStore = computed(() =>
  stores.value.find((s) => s.id === selectedStoreId.value)
)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE))
)

onMounted(async () => {
  await loadStores()
})

async function loadStores() {
  loadingStores.value = true
  storesError.value = null
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, address, phone, status, storecode')
      .order('name', { ascending: true })
    if (error) throw error
    stores.value = (data ?? []) as Store[]
    if (!selectedStoreId.value && stores.value.length) {
      selectedStoreId.value = stores.value[0].id
    }
  } catch (e: unknown) {
    storesError.value = e instanceof Error ? e.message : 'Failed to load stores'
  } finally {
    loadingStores.value = false
  }
}

watch(
  [selectedStoreId, search, dateFrom, dateTo],
  () => {
    page.value = 1
    loadBills()
  },
  { flush: 'post' }
)

watch(selectedStoreId, () => loadTodayStats(), { immediate: false })

watch(page, () => loadBills())

async function loadTodayStats() {
  if (!selectedStoreId.value) {
    todayTotal.value = 0
    todayDiscount.value = 0
    todayCount.value = 0
    return
  }
  loadingToday.value = true
  try {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const { data, error } = await supabase
      .from('bills')
      .select('total, discount_amount')
      .eq('storeid', selectedStoreId.value)
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
    if (error) throw error
    const rows = data ?? []
    todayCount.value = rows.length
    todayTotal.value = rows.reduce(
      (s, r) => s + Number((r as { total?: number }).total ?? 0),
      0
    )
    todayDiscount.value = rows.reduce(
      (s, r) =>
        s + Number((r as { discount_amount?: number }).discount_amount ?? 0),
      0
    )
  } catch (e) {
    console.error('Failed to load today stats', e)
    todayTotal.value = 0
    todayDiscount.value = 0
    todayCount.value = 0
  } finally {
    loadingToday.value = false
  }
}

async function loadBills() {
  if (!selectedStoreId.value) {
    bills.value = []
    totalCount.value = 0
    return
  }
  loadingBills.value = true
  billsError.value = null
  expanded.value = {}
  try {
    const from = (page.value - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabase
      .from('bills')
      .select(
        `id, subtotal, total, paymentmethod, timestamp, status,
         discount_amount, discount_percentage,
         storeid, customerid, userid, createdby, created_at,
         customers:customerid ( id, name, phone, email, address ),
         users:userid ( id, name, email, role )`,
        { count: 'exact' }
      )
      .eq('storeid', selectedStoreId.value)
      .order('timestamp', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (search.value.trim()) {
      const s = search.value.trim()
      q = q.or(`id.ilike.%${s}%,paymentmethod.ilike.%${s}%`)
    }
    if (dateFrom.value) {
      q = q.gte('timestamp', `${dateFrom.value}T00:00:00`)
    }
    if (dateTo.value) {
      q = q.lte('timestamp', `${dateTo.value}T23:59:59`)
    }

    const { data, error, count } = await q
    if (error) throw error
    bills.value = (data ?? []) as unknown as Bill[]
    totalCount.value = count ?? bills.value.length

    if (tableEl.value) {
      animate(tableEl.value.querySelectorAll('[data-row]'), {
        opacity: [0, 1],
        translateY: [6, 0],
        duration: 350,
        delay: (_el: Element, i: number) => i * 18,
        ease: 'out(2)',
      })
    }
  } catch (e: unknown) {
    billsError.value = e instanceof Error ? e.message : 'Failed to load bills'
    bills.value = []
    totalCount.value = 0
  } finally {
    loadingBills.value = false
  }
}

async function toggleExpand(bill: Bill) {
  const open = !expanded.value[bill.id]
  expanded.value = { ...expanded.value, [bill.id]: open }
  if (open && !itemsByBill.value[bill.id]) {
    await loadItems(bill.id)
  }
}

async function loadItems(billId: string) {
  loadingItems.value = { ...loadingItems.value, [billId]: true }
  try {
    const { data, error } = await supabase
      .from('billitems')
      .select(
        `id, billid, productid, quantity, price, total,
         products:productid ( id, name, price, selling_price, barcode )`
      )
      .eq('billid', billId)
      .order('id', { ascending: true })
    if (error) throw error
    itemsByBill.value = {
      ...itemsByBill.value,
      [billId]: (data ?? []) as unknown as BillItem[],
    }
  } catch (e: unknown) {
    itemsByBill.value = { ...itemsByBill.value, [billId]: [] }
    console.error('Failed to load bill items', e)
  } finally {
    loadingItems.value = { ...loadingItems.value, [billId]: false }
  }
}

function statusClass(status: string | null) {
  const s = (status ?? '').toLowerCase()
  if (s === 'completed' || s === 'paid' || s === 'success')
    return 'chip chip-success'
  if (s === 'pending' || s === 'partial') return 'chip chip-warn'
  if (s === 'cancelled' || s === 'refunded' || s === 'failed')
    return 'chip chip-danger'
  return 'chip'
}

function setQuickRange(days: number | null) {
  if (days === null) {
    dateFrom.value = ''
    dateTo.value = ''
    return
  }
  const today = new Date()
  const start = new Date()
  start.setDate(today.getDate() - days + 1)
  dateFrom.value = fmtDateInput(start)
  dateTo.value = fmtDateInput(today)
}

function clearFilters() {
  search.value = ''
  dateFrom.value = ''
  dateTo.value = ''
}
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 max-w-[1400px] mx-auto">
    <header class="mb-5 sm:mb-6 flex items-end justify-between gap-3 flex-wrap">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-semibold text-white tracking-tight">
          Bills
        </h1>
        <p class="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
          Browse every bill issued at a store, with full line-item detail.
        </p>
      </div>
      <button
        class="btn btn-ghost"
        @click="() => { loadBills(); loadTodayStats() }"
        :disabled="loadingBills"
      >
        <RefreshCw :size="14" :class="{ 'animate-spin': loadingBills }" />
        <span>Refresh</span>
      </button>
    </header>

    <section class="card p-4 md:p-5 mb-5">
      <div class="grid gap-4 md:grid-cols-12">
        <div class="md:col-span-4">
          <label
            class="text-xs text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1.5"
          >
            <StoreIcon :size="12" /> Store
          </label>
          <div class="relative">
            <select
              v-model="selectedStoreId"
              class="input appearance-none pr-9"
              :disabled="loadingStores"
            >
              <option v-if="!stores.length" value="">No stores</option>
              <option v-for="s in stores" :key="s.id" :value="s.id">
                {{ s.name || s.id
                }}{{ s.storecode ? ` · ${s.storecode}` : '' }}
              </option>
            </select>
            <ChevronDown
              :size="14"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] pointer-events-none"
            />
          </div>
          <p
            v-if="storesError"
            class="text-xs text-[#fca5a5] mt-1.5 flex items-center gap-1"
          >
            <AlertCircle :size="12" /> {{ storesError }}
          </p>
        </div>

        <div class="md:col-span-4">
          <label
            class="text-xs text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1.5"
          >
            <Search :size="12" /> Search
          </label>
          <input
            v-model="search"
            type="text"
            class="input"
            placeholder="Bill ID or payment method"
          />
        </div>

        <div class="md:col-span-4">
          <label
            class="text-xs text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1.5"
          >
            <Calendar :size="12" /> Date range
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="min-w-0">
              <span
                class="block text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1 sm:hidden"
                >From</span
              >
              <input
                v-model="dateFrom"
                type="date"
                class="input date-input"
                aria-label="From date"
              />
            </div>
            <div class="min-w-0">
              <span
                class="block text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1 sm:hidden"
                >To</span
              >
              <input
                v-model="dateTo"
                type="date"
                class="input date-input"
                aria-label="To date"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-[var(--color-border-soft)]">
        <span class="text-xs text-[var(--color-text-dim)] mr-1">Quick:</span>
        <button class="chip hover:text-white transition" @click="setQuickRange(1)">
          Today
        </button>
        <button class="chip hover:text-white transition" @click="setQuickRange(7)">
          Last 7 days
        </button>
        <button class="chip hover:text-white transition" @click="setQuickRange(30)">
          Last 30 days
        </button>
        <button class="chip hover:text-white transition" @click="setQuickRange(null)">
          All time
        </button>
        <div class="flex-1"></div>
        <button
          v-if="search || dateFrom || dateTo"
          class="text-xs text-[var(--color-text-muted)] hover:text-white transition"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>
    </section>

    <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-5">
      <div class="card p-4">
        <p class="text-xs text-[var(--color-text-muted)]">Bills</p>
        <p class="text-2xl font-semibold text-white mt-1 tabular-nums">
          {{ summary.count.toLocaleString() }}
        </p>
        <p class="text-xs text-[var(--color-text-dim)] mt-0.5">
          Matching current filters
        </p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-[var(--color-text-muted)]">
          Total (this page)
        </p>
        <p class="text-2xl font-semibold text-white mt-1 tabular-nums">
          {{ fmtMoney(summary.total) }}
        </p>
        <p class="text-xs text-[var(--color-text-dim)] mt-0.5">
          Sum of {{ bills.length }} bills shown
        </p>
      </div>
      <div class="card p-4 relative overflow-hidden">
        <div
          class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/50 to-transparent"
        ></div>
        <p class="text-xs text-[var(--color-text-muted)]">Today's bills</p>
        <p class="text-2xl font-semibold text-white mt-1 tabular-nums">
          <span v-if="loadingToday" class="text-[var(--color-text-dim)]">…</span>
          <span v-else>{{ fmtMoney(todayTotal) }}</span>
        </p>
        <p class="text-xs text-[var(--color-text-dim)] mt-0.5">
          {{ todayCount }} bill{{ todayCount === 1 ? '' : 's' }} today
        </p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-[var(--color-text-muted)]">Today's discount</p>
        <p class="text-2xl font-semibold text-white mt-1 tabular-nums">
          <span v-if="loadingToday" class="text-[var(--color-text-dim)]">…</span>
          <span v-else>{{ fmtMoney(todayDiscount) }}</span>
        </p>
        <p class="text-xs text-[var(--color-text-dim)] mt-0.5">
          Total discount given today
        </p>
      </div>
    </section>

    <section class="card overflow-hidden">
      <div
        class="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <Receipt :size="16" class="text-[var(--color-accent)]" />
          <h2 class="text-sm font-medium">
            {{ selectedStore?.name || 'Bills' }}
            <span class="text-[var(--color-text-dim)]"
              >· {{ totalCount.toLocaleString() }} total</span
            >
          </h2>
        </div>
        <div
          class="text-xs text-[var(--color-text-dim)]"
          v-if="totalPages > 1"
        >
          Page {{ page }} of {{ totalPages }}
        </div>
      </div>

      <div ref="tableEl" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-dim)] border-b border-[var(--color-border)]"
            >
              <th class="px-3 sm:px-5 py-3 font-medium w-8"></th>
              <th class="px-3 py-3 font-medium">Bill ID</th>
              <th class="px-3 py-3 font-medium hidden sm:table-cell">Date</th>
              <th class="px-3 py-3 font-medium hidden md:table-cell">
                Customer
              </th>
              <th class="px-3 py-3 font-medium hidden xl:table-cell">
                Cashier
              </th>
              <th class="px-3 py-3 font-medium hidden lg:table-cell">
                Payment
              </th>
              <th class="px-3 py-3 font-medium text-right hidden md:table-cell">
                Subtotal
              </th>
              <th class="px-3 py-3 font-medium text-right hidden lg:table-cell">
                Discount
              </th>
              <th class="px-3 py-3 font-medium text-right">Total</th>
              <th class="px-3 py-3 font-medium hidden sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="loadingBills && !bills.length">
              <tr v-for="i in 6" :key="`sk-${i}`" class="border-b border-[var(--color-border-soft)]">
                <td colspan="10" class="px-4 sm:px-5 py-3">
                  <div class="h-4 w-full bg-[var(--color-surface-2)] rounded animate-pulse"></div>
                </td>
              </tr>
            </template>

            <template v-else-if="billsError">
              <tr>
                <td colspan="10" class="px-4 sm:px-5 py-12 text-center">
                  <AlertCircle :size="22" class="mx-auto text-[#fca5a5]" />
                  <p class="mt-2 text-sm text-[#fca5a5]">{{ billsError }}</p>
                </td>
              </tr>
            </template>

            <template v-else-if="!bills.length">
              <tr>
                <td colspan="10" class="px-4 sm:px-5 py-16 text-center">
                  <Inbox :size="28" class="mx-auto text-[var(--color-text-dim)]" />
                  <p class="mt-3 text-sm text-[var(--color-text-muted)]">
                    No bills found for this store and filters.
                  </p>
                </td>
              </tr>
            </template>

            <template v-else>
              <template v-for="b in bills" :key="b.id">
                <tr
                  data-row
                  class="border-b border-[var(--color-border-soft)] hover:bg-[var(--color-surface-2)]/60 cursor-pointer transition-colors"
                  @click="toggleExpand(b)"
                >
                  <td class="px-3 sm:px-5 py-3 text-[var(--color-text-dim)]">
                    <ChevronRight
                      :size="14"
                      class="transition-transform duration-200"
                      :class="{ 'rotate-90 text-[var(--color-accent)]': expanded[b.id] }"
                    />
                  </td>
                  <td class="px-3 py-3 font-mono text-[12px] sm:text-[12.5px] max-w-[140px] sm:max-w-none truncate">
                    {{ b.id }}
                    <div class="sm:hidden text-[10px] text-[var(--color-text-dim)] font-sans mt-0.5 truncate">
                      {{ fmtDate(b.timestamp || b.created_at, false) }}
                    </div>
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap hidden sm:table-cell">
                    {{ fmtDate(b.timestamp || b.created_at) }}
                  </td>
                  <td class="px-3 py-3 hidden md:table-cell">
                    <div v-if="b.customers" class="flex flex-col">
                      <span>{{ b.customers.name || '—' }}</span>
                      <span class="text-xs text-[var(--color-text-dim)]">
                        {{ b.customers.phone || '' }}
                      </span>
                    </div>
                    <span v-else class="text-[var(--color-text-dim)]">Walk-in</span>
                  </td>
                  <td class="px-3 py-3 hidden xl:table-cell">
                    <span class="text-[var(--color-text-muted)]">
                      {{ b.users?.name || b.createdby || '—' }}
                    </span>
                  </td>
                  <td class="px-3 py-3 hidden lg:table-cell">
                    <span class="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
                      <CreditCard :size="13" />
                      {{ b.paymentmethod || '—' }}
                    </span>
                  </td>
                  <td class="px-3 py-3 text-right tabular-nums hidden md:table-cell">
                    {{ fmtMoney(b.subtotal) }}
                  </td>
                  <td class="px-3 py-3 text-right tabular-nums text-[var(--color-text-muted)] hidden lg:table-cell">
                    {{
                      Number(b.discount_amount ?? 0) > 0
                        ? `−${fmtMoney(b.discount_amount)}`
                        : '—'
                    }}
                  </td>
                  <td class="px-3 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                    {{ fmtMoney(b.total) }}
                  </td>
                  <td class="px-3 py-3 hidden sm:table-cell">
                    <span :class="statusClass(b.status)">{{ b.status || 'unknown' }}</span>
                  </td>
                </tr>
                <tr v-if="expanded[b.id]" :key="`d-${b.id}`" class="bg-[var(--color-surface-2)]/40">
                  <td colspan="10" class="px-3 sm:px-5 py-4 sm:py-5">
                    <div class="sm:hidden mb-4">
                      <span :class="statusClass(b.status)">{{
                        b.status || 'unknown'
                      }}</span>
                    </div>
                    <div class="grid gap-5 md:grid-cols-3 mb-5">
                      <div>
                        <p class="text-[11px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1.5">
                          Customer
                        </p>
                        <div v-if="b.customers" class="space-y-1 text-sm">
                          <p class="flex items-center gap-2">
                            <UserIcon :size="13" class="text-[var(--color-text-dim)]" />
                            {{ b.customers.name || '—' }}
                          </p>
                          <p
                            v-if="b.customers.phone"
                            class="flex items-center gap-2 text-[var(--color-text-muted)]"
                          >
                            <Phone :size="13" class="text-[var(--color-text-dim)]" />
                            {{ b.customers.phone }}
                          </p>
                          <p
                            v-if="b.customers.email"
                            class="flex items-center gap-2 text-[var(--color-text-muted)]"
                          >
                            <Mail :size="13" class="text-[var(--color-text-dim)]" />
                            {{ b.customers.email }}
                          </p>
                          <p
                            v-if="b.customers.address"
                            class="text-[var(--color-text-muted)] text-xs leading-relaxed"
                          >
                            {{ b.customers.address }}
                          </p>
                        </div>
                        <p v-else class="text-sm text-[var(--color-text-dim)]">
                          Walk-in customer
                        </p>
                      </div>

                      <div>
                        <p class="text-[11px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1.5">
                          Cashier
                        </p>
                        <div class="space-y-1 text-sm">
                          <p>{{ b.users?.name || '—' }}</p>
                          <p class="text-[var(--color-text-muted)] text-xs">
                            {{ b.users?.email || '' }}
                          </p>
                          <p class="text-[var(--color-text-dim)] text-xs">
                            User ID: {{ b.userid || b.createdby || '—' }}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p class="text-[11px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1.5">
                          Bill meta
                        </p>
                        <div class="space-y-1 text-sm">
                          <p class="font-mono text-xs">{{ b.id }}</p>
                          <p class="text-[var(--color-text-muted)] text-xs">
                            Created {{ fmtDate(b.created_at) }}
                          </p>
                          <p
                            v-if="Number(b.discount_percentage ?? 0) > 0"
                            class="text-[var(--color-text-muted)] text-xs"
                          >
                            Discount applied: {{ b.discount_percentage }}%
                          </p>
                        </div>
                      </div>
                    </div>

                    <div class="rounded-lg border border-[var(--color-border)] overflow-hidden overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead>
                          <tr
                            class="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-dim)] bg-[var(--color-surface)]"
                          >
                            <th class="px-3 sm:px-4 py-2 font-medium">Product</th>
                            <th class="px-3 sm:px-4 py-2 font-medium hidden md:table-cell">
                              Barcode
                            </th>
                            <th class="px-3 sm:px-4 py-2 font-medium text-right">
                              Qty
                            </th>
                            <th class="px-3 sm:px-4 py-2 font-medium text-right hidden sm:table-cell">
                              Price
                            </th>
                            <th class="px-3 sm:px-4 py-2 font-medium text-right">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-if="loadingItems[b.id]">
                            <td colspan="5" class="px-4 py-6 text-center text-[var(--color-text-dim)]">
                              <span class="inline-flex items-center gap-2">
                                <span class="spinner" style="border-top-color: var(--color-accent); border-color: rgba(170,59,255,0.25)"></span>
                                Loading items…
                              </span>
                            </td>
                          </tr>
                          <tr
                            v-else-if="!itemsByBill[b.id] || !itemsByBill[b.id].length"
                          >
                            <td
                              colspan="5"
                              class="px-4 py-6 text-center text-sm text-[var(--color-text-dim)]"
                            >
                              No line items recorded.
                            </td>
                          </tr>
                          <tr
                            v-else
                            v-for="it in itemsByBill[b.id]"
                            :key="it.id"
                            class="border-t border-[var(--color-border-soft)]"
                          >
                            <td class="px-3 sm:px-4 py-2.5">
                              <div>
                                {{ it.products?.name || it.productid || '—' }}
                              </div>
                              <div
                                class="md:hidden font-mono text-[10px] text-[var(--color-text-dim)] mt-0.5"
                                v-if="it.products?.barcode"
                              >
                                {{ it.products.barcode }}
                              </div>
                              <div
                                class="sm:hidden text-[11px] text-[var(--color-text-muted)] mt-0.5 tabular-nums"
                              >
                                {{ fmtMoney(it.price) }} × {{ it.quantity }}
                              </div>
                            </td>
                            <td class="px-3 sm:px-4 py-2.5 font-mono text-xs text-[var(--color-text-muted)] hidden md:table-cell">
                              {{ it.products?.barcode || '—' }}
                            </td>
                            <td class="px-3 sm:px-4 py-2.5 text-right tabular-nums">
                              {{ it.quantity }}
                            </td>
                            <td class="px-3 sm:px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)] hidden sm:table-cell">
                              {{ fmtMoney(it.price) }}
                            </td>
                            <td class="px-3 sm:px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                              {{ fmtMoney(it.total) }}
                            </td>
                          </tr>
                        </tbody>
                        <tfoot v-if="itemsByBill[b.id]?.length">
                          <tr class="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                            <td class="px-4 py-2.5 text-[var(--color-text-muted)]" colspan="3">
                              Subtotal
                            </td>
                            <td></td>
                            <td class="px-4 py-2.5 text-right tabular-nums">
                              {{ fmtMoney(b.subtotal) }}
                            </td>
                          </tr>
                          <tr
                            v-if="Number(b.discount_amount ?? 0) > 0"
                            class="bg-[var(--color-surface)]"
                          >
                            <td class="px-4 py-2.5 text-[var(--color-text-muted)]" colspan="3">
                              Discount
                              <span
                                v-if="Number(b.discount_percentage ?? 0) > 0"
                                class="text-[var(--color-text-dim)]"
                              >
                                ({{ b.discount_percentage }}%)
                              </span>
                            </td>
                            <td></td>
                            <td class="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">
                              −{{ fmtMoney(b.discount_amount) }}
                            </td>
                          </tr>
                          <tr class="bg-[var(--color-surface)] border-t border-[var(--color-border)]">
                            <td class="px-4 py-2.5 font-medium" colspan="3">
                              Total
                            </td>
                            <td></td>
                            <td class="px-4 py-2.5 text-right font-semibold tabular-nums">
                              {{ fmtMoney(b.total) }}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <div
        v-if="totalPages > 1"
        class="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--color-border)]"
      >
        <p class="text-xs text-[var(--color-text-dim)]">
          Showing
          <span class="text-[var(--color-text-muted)]">
            {{ (page - 1) * PAGE_SIZE + 1 }}–{{
              Math.min(page * PAGE_SIZE, totalCount)
            }}
          </span>
          of {{ totalCount.toLocaleString() }}
        </p>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-ghost !py-1.5 !px-3"
            :disabled="page <= 1 || loadingBills"
            @click="page = Math.max(1, page - 1)"
          >
            Previous
          </button>
          <button
            class="btn btn-ghost !py-1.5 !px-3"
            :disabled="page >= totalPages || loadingBills"
            @click="page = Math.min(totalPages, page + 1)"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
