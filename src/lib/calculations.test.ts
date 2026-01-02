import { describe, expect, it } from 'vitest'
import type { Settings, Shift } from '../types'
import { calculateTotals, getPeriodByOffset, getPeriodRange, groupShiftsByDay, minutesBetween } from './calculations'

const baseSettings: Settings = {
  period: 'weekly',
  weekStart: 'monday',
  hourlyRate: 25,
  userEmail: '',
  accountantEmail: '',
}


describe('minutesBetween', () => {
  it('counts same-day durations', () => {
    expect(minutesBetween('09:00', '17:00')).toBe(480)
  })

  it('handles overnight spans across midnight', () => {
    expect(minutesBetween('22:30', '06:00')).toBe(450)
  })
})

describe('getPeriodRange', () => {
  it('returns weekly range based on configured week start', () => {
    const today = new Date('2025-01-15T00:00:00Z') // Wednesday
    const range = getPeriodRange(baseSettings, today)
    expect(range).toEqual({ start: '2025-01-13', end: '2025-01-19' })
  })

  it('returns monthly range for current month', () => {
    const today = new Date('2025-01-15T00:00:00Z')
    const range = getPeriodRange({ ...baseSettings, period: 'monthly' }, today)
    expect(range).toEqual({ start: '2025-01-01', end: '2025-01-31' })
  })
})

describe('getPeriodByOffset', () => {
  it('shifts weekly periods by offsets', () => {
    const today = new Date('2025-01-15T00:00:00Z')
    const prev = getPeriodByOffset(baseSettings, -1, today)
    const next = getPeriodByOffset(baseSettings, 1, today)
    expect(prev).toEqual({ start: '2025-01-06', end: '2025-01-12' })
    expect(next).toEqual({ start: '2025-01-20', end: '2025-01-26' })
  })

  it('shifts monthly periods by offsets', () => {
    const today = new Date('2025-01-15T00:00:00Z')
    const prev = getPeriodByOffset({ ...baseSettings, period: 'monthly' }, -1, today)
    const next = getPeriodByOffset({ ...baseSettings, period: 'monthly' }, 1, today)
    expect(prev).toEqual({ start: '2024-12-01', end: '2024-12-31' })
    expect(next).toEqual({ start: '2025-02-01', end: '2025-02-28' })
  })
})

describe('calculateTotals', () => {
  const shifts: Shift[] = [
    {
      id: '1',
      date: '2025-01-13',
      start: '22:00',
      end: '06:00',
      lunchMinutes: 30,
      comment: '',
      hourlyRate: 20,
    },
    {
      id: '2',
      date: '2025-01-10',
      start: '09:00',
      end: '17:00',
      lunchMinutes: 60,
      comment: '',
      hourlyRate: 25,
    },
  ]

  it('computes totals across all time', () => {
    const totals = calculateTotals(shifts, null)
    expect(totals.durationMinutes).toBe(870) // 7.5h + 7h
    expect(totals.pay).toBe(325) // 150 + 175
  })

  it('filters totals by period range', () => {
    const weeklyRange = { start: '2025-01-13', end: '2025-01-19' }
    const totals = calculateTotals(shifts, weeklyRange)
    expect(totals.durationMinutes).toBe(450)
    expect(totals.pay).toBe(150)
  })
})

describe('groupShiftsByDay', () => {
  const shifts: Shift[] = [
    {
      id: '1',
      date: '2025-01-13',
      start: '22:00',
      end: '06:00',
      lunchMinutes: 30,
      comment: '',
      hourlyRate: 20,
    },
    {
      id: '2',
      date: '2025-01-13',
      start: '10:00',
      end: '12:00',
      lunchMinutes: 0,
      comment: '',
      hourlyRate: 30,
    },
    {
      id: '3',
      date: '2025-01-14',
      start: '09:00',
      end: '17:00',
      lunchMinutes: 60,
      comment: '',
      hourlyRate: 25,
    },
  ]

  it('aggregates minutes and pay per day within period', () => {
    const days = groupShiftsByDay(shifts, { start: '2025-01-13', end: '2025-01-14' })
    expect(days).toEqual([
      { date: '2025-01-14', durationMinutes: 420, pay: 175 },
      { date: '2025-01-13', durationMinutes: 570, pay: 210 },
    ])
  })
})
