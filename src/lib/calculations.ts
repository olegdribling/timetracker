import type { Settings, Shift } from '../types'

export type PeriodRange = { start: string; end: string }

const iso = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}


export function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMinRaw = eh * 60 + em
  const endMin = endMinRaw < startMin ? endMinRaw + 24 * 60 : endMinRaw
  return Math.max(endMin - startMin, 0)
}

export function getPeriodRange(settings: Settings, todayInput: Date = new Date()): PeriodRange | null {
  const today = new Date(todayInput)
  today.setHours(0, 0, 0, 0)

  if (settings.period === 'monthly') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { start: iso(start), end: iso(end) }
  }

  if (settings.period === 'weekly') {
    const map: Record<Settings['weekStart'], number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    }
    const target = map[settings.weekStart]
    const current = today.getDay()
    const diff = (current - target + 7) % 7
    const start = new Date(today)
    start.setDate(today.getDate() - diff)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start: iso(start), end: iso(end) }
  }

  // Custom dates: not yet implemented, so we use full range (no filtering).
  return null
}

export function calculateTotals(shifts: Shift[], periodRange: PeriodRange | null) {
  const source = periodRange
    ? shifts.filter((shift) => shift.date >= periodRange.start && shift.date <= periodRange.end)
    : shifts

  return source.reduce(
    (acc, shift) => {
      const workMinutes = minutesBetween(shift.start, shift.end) - shift.lunchMinutes
      const safeMinutes = Math.max(workMinutes, 0)
      const hours = safeMinutes / 60
      acc.pay += hours * shift.hourlyRate
      acc.durationMinutes += safeMinutes
      return acc
    },
    { pay: 0, durationMinutes: 0 },
  )
}

export function getPeriodByOffset(
  settings: Settings,
  offset: number,
  todayInput: Date = new Date(),
): PeriodRange | null {
  const base = getPeriodRange(settings, todayInput)
  if (!base) return null

  if (settings.period === 'weekly') {
    const start = new Date(base.start)
    start.setDate(start.getDate() + offset * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start: iso(start), end: iso(end) }
  }

  if (settings.period === 'monthly') {
    const start = new Date(base.start)
    start.setMonth(start.getMonth() + offset)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    return { start: iso(start), end: iso(end) }
  }

  return base
}

export function groupShiftsByDay(shifts: Shift[], periodRange: PeriodRange | null) {
  const source = periodRange
    ? shifts.filter((shift) => shift.date >= periodRange.start && shift.date <= periodRange.end)
    : shifts

  const map = new Map<
    string,
    {
      durationMinutes: number
      pay: number
    }
  >()

  source.forEach((shift) => {
    const existing = map.get(shift.date) ?? { durationMinutes: 0, pay: 0 }
    const workMinutes = minutesBetween(shift.start, shift.end) - shift.lunchMinutes
    const safeMinutes = Math.max(workMinutes, 0)
    const hours = safeMinutes / 60
    map.set(shift.date, {
      durationMinutes: existing.durationMinutes + safeMinutes,
      pay: existing.pay + hours * shift.hourlyRate,
    })
  })

  return [...map.entries()]
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => b.date.localeCompare(a.date))
}
