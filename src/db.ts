import Dexie, { type Table } from 'dexie'
import type { Settings, Shift } from './types'

export type ShiftRow = Shift & { updatedAt: string }
export type SettingsRow = Settings & { key: 'main'; updatedAt: string }

class WorkTrackerDB extends Dexie {
  shifts!: Table<ShiftRow, string>
  settings!: Table<SettingsRow, string>

  constructor() {
    super('WorkTrackerDB')
    this.version(1).stores({
      shifts: 'id, date',
      settings: 'key',
    })
  }
}

export const db = new WorkTrackerDB()
