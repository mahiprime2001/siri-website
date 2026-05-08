import { format, parseISO } from 'date-fns'

export function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(v)
}

export function fmtDate(s: string | null | undefined, withTime = true): string {
  if (!s) return '—'
  try {
    const d = typeof s === 'string' ? parseISO(s) : new Date(s)
    return format(d, withTime ? 'dd MMM yyyy, hh:mm a' : 'dd MMM yyyy')
  } catch {
    return '—'
  }
}

export function fmtDateInput(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}
