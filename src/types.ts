export type Shift = {
  id: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  end: string // HH:MM
  lunchMinutes: number
  comment?: string
  hourlyRate: number
}

export type ShiftForm = {
  date: string
  start: string
  end: string
  lunchMinutes: number
  comment: string
}

export type Settings = {
  period: 'weekly' | 'monthly' | 'custom'
  weekStart: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  hourlyRate: number
  userEmail: string
  accountantEmail: string
}
