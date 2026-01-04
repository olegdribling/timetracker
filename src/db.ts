import Dexie, { type Table } from 'dexie'
import type { InvoiceProfile, Settings, Shift } from './types'

export type ShiftRow = Shift & { updatedAt: string }
export type SettingsRow = Settings & { key: 'main'; updatedAt: string }
export type InvoiceProfileRow = InvoiceProfile & { key: 'main'; updatedAt: string }

class WorkTrackerDB extends Dexie {
  shifts!: Table<ShiftRow, string>
  settings!: Table<SettingsRow, string>
  invoiceProfile!: Table<InvoiceProfileRow, string>

  constructor() {
    super('WorkTrackerDB')
    this.version(1).stores({
      shifts: 'id, date',
      settings: 'key',
    })

    this.version(2).stores({
      shifts: 'id, date',
      settings: 'key',
      invoiceProfile: 'key',
    })

    this.version(3)
      .stores({
        shifts: 'id, date',
        settings: 'key',
        invoiceProfile: 'key',
      })
      .upgrade((tx) => {
        return tx.table('invoiceProfile').toCollection().modify((row: InvoiceProfileRow & Partial<InvoiceProfile>) => {
          if (row.chargeGst === undefined) {
            row.chargeGst = false
          }
        })
      })
  }
}

export const db = new WorkTrackerDB()
