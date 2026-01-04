import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { db } from './db'
import { calculateTotals, getPeriodByOffset, getPeriodRange, groupShiftsByDay, minutesBetween } from './lib/calculations'
import { generateInvoicePdf } from './lib/invoice'
import type { InvoiceProfile, Settings, Shift, ShiftForm } from './types'

const INITIAL_HOURLY_RATE = 25
const THEME_STORAGE_KEY = 'worktracker:theme'
const MENU_STORAGE_KEY = 'worktracker:menu-open'

const initialShifts: Shift[] = [
  {
    id: '1',
    date: '2025-07-21',
    start: '09:00',
    end: '17:30',
    lunchMinutes: 60,
    comment: 'Смена в офисе',
    hourlyRate: INITIAL_HOURLY_RATE,
  },
  {
    id: '2',
    date: '2025-07-20',
    start: '10:00',
    end: '18:15',
    lunchMinutes: 45,
    hourlyRate: INITIAL_HOURLY_RATE,
  },
  {
    id: '3',
    date: '2025-07-19',
    start: '08:30',
    end: '16:00',
    lunchMinutes: 30,
    comment: 'Удалённо',
    hourlyRate: INITIAL_HOURLY_RATE,
  },
]

const emptyForm = (): ShiftForm => {
  const today = new Date()
  const date = today.toISOString().slice(0, 10)
  return {
    date,
    start: '07:00',
    end: '17:00',
    lunchMinutes: 30,
    comment: '',
  }
}

const DEFAULT_SETTINGS: Settings = {
  period: 'weekly',
  weekStart: 'monday',
  hourlyRate: INITIAL_HOURLY_RATE,
  userEmail: '',
  accountantEmail: '',
}

const DEFAULT_INVOICE_PROFILE: InvoiceProfile = {
  fullName: '',
  address: '',
  abn: '',
  speciality: '',
  accountBankName: '',
  bsb: '',
  accountNumber: '',
  nextInvoiceNumber: 1,
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function money(amount: number) {
  return amount.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDuration(minutes: number) {
  const safe = Math.max(minutes, 0)
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

const nowIso = () => new Date().toISOString()

type Option = {
  value: string
  label: string
}

type WheelPickerProps = {
  options: Option[]
  value: string
  onChange: (value: string) => void
  itemHeight?: number
}

const WheelPicker = ({ options, value, onChange, itemHeight = 44 }: WheelPickerProps) => {
  const ref = useRef<HTMLDivElement | null>(null)
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportPadding = itemHeight
  const wheelHeight = itemHeight * 3
  const loopedOptions = useMemo(() => [...options, ...options, ...options], [options])
  const baseCount = options.length
  const middleOffset = baseCount

  useEffect(() => {
    if (!baseCount) return
    const index = Math.max(0, options.findIndex((item) => item.value === value))
    const targetIndex = middleOffset + index
    if (ref.current) {
      const target = Math.max(0, viewportPadding - itemHeight + targetIndex * itemHeight)
      ref.current.scrollTo({
        top: target,
        behavior: 'smooth',
      })
    }
  }, [value, options, itemHeight, viewportPadding, baseCount, middleOffset])

  const snapToNearest = () => {
    if (!ref.current || !baseCount) return
    const { scrollTop } = ref.current
    const relative = scrollTop - (viewportPadding - itemHeight)
    const index = Math.round(relative / itemHeight)
    const normalized = ((index % baseCount) + baseCount) % baseCount
    const targetIndex = middleOffset + normalized
    const target = Math.max(0, viewportPadding - itemHeight + targetIndex * itemHeight)
    ref.current.scrollTo({ top: target, behavior: 'smooth' })
    const selected = options[normalized]
    if (selected && selected.value !== value) {
      onChange(selected.value)
    }
  }

  const handleScroll = () => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
    scrollTimeout.current = setTimeout(snapToNearest, 120)
  }

  return (
    <div className="wheel" style={{ height: wheelHeight }}>
      <div className="wheel__mask" />
      <div
        className="wheel__viewport"
        ref={ref}
        onScroll={handleScroll}
        style={{
          paddingTop: viewportPadding,
          paddingBottom: viewportPadding,
        }}
      >
        {loopedOptions.map((option, idx) => (
          <div
            key={`${option.value}-${idx}`}
            className={`wheel__item ${option.value === value ? 'is-active' : ''}`}
            style={{ height: itemHeight }}
          >
            {option.label}
          </div>
        ))}
      </div>
      <div className="wheel__highlight" style={{ height: itemHeight }} />
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') return stored
    } catch (error) {
      console.error('Failed to read stored theme', error)
    }
    return 'light'
  })
  const [shifts, setShifts] = useState<Shift[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(() => {
    try {
      return localStorage.getItem(MENU_STORAGE_KEY) === 'true'
    } catch (error) {
      console.error('Failed to read stored menu state', error)
      return false
    }
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [isInvoiceScreenOpen, setIsInvoiceScreenOpen] = useState(false)
  const [isInvoiceEditing, setIsInvoiceEditing] = useState(false)
  const [showEmailPrompt, setShowEmailPrompt] = useState(false)
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<number | null>(null)
  const [form, setForm] = useState<ShiftForm>(emptyForm)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState<Settings>(DEFAULT_SETTINGS)
  const [invoiceProfile, setInvoiceProfile] = useState<InvoiceProfile>(DEFAULT_INVOICE_PROFILE)
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceProfile>(DEFAULT_INVOICE_PROFILE)
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: 1,
    rate: INITIAL_HOURLY_RATE,
    durationMinutes: 0,
    total: 0,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'home' | 'reports'>('home')
  const [periodOffset, setPeriodOffset] = useState(0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch (error) {
      console.error('Failed to persist theme', error)
    }
  }, [theme])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [shiftRows, settingsRow, invoiceRow] = await Promise.all([
          db.shifts.toArray(),
          db.settings.get('main'),
          db.invoiceProfile.get('main').catch(() => null),
        ])

        if (cancelled) return

        if (settingsRow) {
          setSettings(settingsRow)
          setSettingsDraft(settingsRow)
        } else {
          setSettings(DEFAULT_SETTINGS)
          setSettingsDraft(DEFAULT_SETTINGS)
          await db.settings.put({ key: 'main', ...DEFAULT_SETTINGS, updatedAt: nowIso() })
        }

        if (invoiceRow) {
          setInvoiceProfile(invoiceRow)
          setInvoiceDraft(invoiceRow)
        } else {
          setInvoiceProfile(DEFAULT_INVOICE_PROFILE)
          setInvoiceDraft(DEFAULT_INVOICE_PROFILE)
          await db.invoiceProfile.put({ key: 'main', ...DEFAULT_INVOICE_PROFILE, updatedAt: nowIso() })
        }

        if (!shiftRows.length) {
          setShifts(initialShifts)
          await db.shifts.bulkPut(
            initialShifts.map((shift) => ({
              ...shift,
              updatedAt: nowIso(),
            })),
          )
        } else {
          setShifts(shiftRows)
        }
      } catch (error) {
        console.error('Failed to load data', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(MENU_STORAGE_KEY, String(isMenuOpen))
    } catch (error) {
      console.error('Failed to persist menu preference', error)
    }
  }, [isMenuOpen])

  const todayLabel = useMemo(() => {
    const now = new Date()
    return new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now)
  }, [])

  const parseDateParts = (value: string) => {
    const [y, m, d] = value.split('-').map(Number)
    return { year: y, month: m, day: d }
  }

  const monthOptions = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    const months: Option[] = []
    for (let i = 0; i < 48; i++) {
      const date = new Date(start.getFullYear(), start.getMonth() + i, 1)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const label = new Intl.DateTimeFormat('en-AU', {
        month: 'long',
        year: 'numeric',
      }).format(date)
      months.push({ value: `${year}-${String(month).padStart(2, '0')}`, label })
    }
    return months
  }, [])

  const selectedDate = useMemo(() => parseDateParts(form.date), [form.date])

  const dayOptions = useMemo(() => {
    const daysInMonth = new Date(selectedDate.year, selectedDate.month, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      return { value: String(day).padStart(2, '0'), label: String(day) }
    })
  }, [selectedDate])

  const hourOptions = useMemo<Option[]>(
    () => Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: String(i) })),
    [],
  )

  const minuteOptions = useMemo<Option[]>(
    () =>
      Array.from({ length: 12 }, (_, i) => i * 5).map((m) => ({
        value: String(m).padStart(2, '0'),
        label: String(m).padStart(2, '0'),
      })),
    [],
  )

  const lunchOptions = useMemo<Option[]>(
    () =>
      Array.from({ length: 25 }, (_, i) => i * 5).map((m) => ({
        value: String(m),
        label: String(m),
      })),
    [],
  )

  const updateDateByMonth = (monthValue: string) => {
    const [yearStr, monthStr] = monthValue.split('-')
    const { day } = selectedDate
    const year = Number(yearStr)
    const month = Number(monthStr)
    const daysInNewMonth = new Date(year, month, 0).getDate()
    const newDay = Math.min(day, daysInNewMonth)
    const newDate = `${yearStr}-${monthStr}-${String(newDay).padStart(2, '0')}`
    setForm((prev) => ({ ...prev, date: newDate }))
  }

  const updateDateByDay = (dayValue: string) => {
    const { year, month } = selectedDate
    const newDate = `${year}-${String(month).padStart(2, '0')}-${dayValue}`
    setForm((prev) => ({ ...prev, date: newDate }))
  }

  const updateTime = (field: 'start' | 'end', part: 'hour' | 'minute', value: string) => {
    setForm((prev) => {
      const [h, m] = prev[field].split(':')
      const next = part === 'hour' ? `${value}:${m}` : `${h}:${value}`
      return { ...prev, [field]: next }
    })
  }

  const sortedShifts = useMemo(
    () =>
      [...shifts].sort((a, b) =>
        a.date === b.date ? b.start.localeCompare(a.start) : b.date.localeCompare(a.date),
      ),
    [shifts],
  )

  const periodRange = useMemo(() => getPeriodRange(settings), [settings])

  const totals = useMemo(
    () => calculateTotals(shifts, periodRange),
    [shifts, periodRange],
  )

  const reportRange = useMemo(
    () => getPeriodByOffset(settings, periodOffset),
    [settings, periodOffset],
  )

  const reportDays = useMemo(
    () => groupShiftsByDay(shifts, reportRange),
    [shifts, reportRange],
  )

  const reportTotals = useMemo(
    () => calculateTotals(shifts, reportRange),
    [shifts, reportRange],
  )

  const totalPay = totals.pay
  const totalDurationMinutes = totals.durationMinutes

  const periodLabel = useMemo(() => {
    if (!periodRange) return 'All time'
    return `${formatDate(periodRange.start)} — ${formatDate(periodRange.end)}`
  }, [periodRange])

  const reportPeriodLabel = useMemo(() => {
    if (!reportRange) return 'All time'
    return `${formatDate(reportRange.start)} — ${formatDate(reportRange.end)}`
  }, [reportRange])

  const canNavigateReports = settings.period !== 'custom'

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setIsAddOpen(true)
    setIsMenuOpen(false)
  }

  const openEdit = (shift: Shift) => {
    setEditingId(shift.id)
    setForm({
      date: shift.date,
      start: shift.start,
      end: shift.end,
      lunchMinutes: shift.lunchMinutes,
      comment: shift.comment ?? '',
    })
    setIsAddOpen(true)
    setIsMenuOpen(false)
  }

  const closeModal = () => {
    setIsAddOpen(false)
    setEditingId(null)
  }

  const openSettings = () => {
    setSettingsDraft(settings)
    setIsSettingsOpen(true)
    setIsMenuOpen(false)
  }

  const openReports = () => {
    setActiveView('reports')
    setIsMenuOpen(false)
    setPeriodOffset(0)
  }

  const goHome = () => {
    setActiveView('home')
    setIsMenuOpen(false)
  }

  const goPrevPeriod = () => {
    if (!canNavigateReports) return
    setPeriodOffset((prev) => prev - 1)
  }

  const goNextPeriod = () => {
    if (!canNavigateReports) return
    setPeriodOffset((prev) => prev + 1)
  }

  const closeSettings = () => {
    setIsSettingsOpen(false)
  }

  const handleDelete = async (id: string) => {
    const ok = window.confirm('Delete this shift?')
    if (!ok) return
    setShifts((prev) => prev.filter((shift) => shift.id !== id))
    try {
      await db.shifts.delete(id)
    } catch (error) {
      console.error('Failed to delete shift', error)
    }
  }

  const handleSave = async () => {
    const workMinutes = minutesBetween(form.start, form.end) - form.lunchMinutes
    if (workMinutes < 0) {
      alert('End time must be after start time (minus lunch).')
      return
    }

    if (editingId) {
      const current = shifts.find((s) => s.id === editingId)
      const updated: Shift = {
        ...(current ?? {
          id: editingId,
          date: form.date,
          start: form.start,
          end: form.end,
          lunchMinutes: form.lunchMinutes,
          comment: form.comment.trim(),
          hourlyRate: settings.hourlyRate,
        }),
        date: form.date,
        start: form.start,
        end: form.end,
        lunchMinutes: form.lunchMinutes,
        comment: form.comment.trim(),
      }
      setShifts((prev) =>
        prev.map((shift) =>
          shift.id === editingId ? updated : shift,
        ),
      )
      try {
        await db.shifts.put({ ...updated, updatedAt: nowIso() })
      } catch (error) {
        console.error('Failed to update shift', error)
      }
    } else {
      const newShift: Shift = {
        id: crypto.randomUUID(),
        date: form.date,
        start: form.start,
        end: form.end,
        lunchMinutes: form.lunchMinutes,
        comment: form.comment.trim(),
        hourlyRate: settings.hourlyRate,
      }
      setShifts((prev) => [...prev, newShift])
      try {
        await db.shifts.put({ ...newShift, updatedAt: nowIso() })
      } catch (error) {
        console.error('Failed to add shift', error)
      }
    }

    closeModal()
  }

  const saveSettings = async () => {
    setSettings(settingsDraft)
    setPeriodOffset(0)
    try {
      await db.settings.put({ key: 'main', ...settingsDraft, updatedAt: nowIso() })
    } catch (error) {
      console.error('Failed to save settings', error)
    }
    closeSettings()
  }

  const openInvoiceModal = () => {
    setInvoiceDraft(invoiceProfile)
    setIsInvoiceModalOpen(true)
    setIsMenuOpen(false)
  }

  const closeInvoiceModal = () => {
    setIsInvoiceModalOpen(false)
  }

  const saveInvoiceProfile = async () => {
    setInvoiceProfile(invoiceDraft)
    try {
      await db.invoiceProfile.put({ key: 'main', ...invoiceDraft, updatedAt: nowIso() })
    } catch (error) {
      console.error('Failed to save invoice profile', error)
    }
    closeInvoiceModal()
  }

  const hasInvoiceCoreFields = invoiceProfile.fullName.trim() !== '' && invoiceProfile.accountNumber.trim() !== ''

  const openInvoiceScreen = () => {
    if (!reportRange) {
      alert('Select a reporting period first.')
      return
    }
    if (!hasInvoiceCoreFields) {
      alert('Fill invoice details first (Full Name and Account number at minimum).')
      return
    }
    setInvoiceForm({
      invoiceNumber: invoiceProfile.nextInvoiceNumber,
      rate: settings.hourlyRate,
      durationMinutes: reportTotals.durationMinutes,
      total: reportTotals.pay,
    })
    setIsInvoiceEditing(false)
    setShowEmailPrompt(false)
    setIsInvoiceScreenOpen(true)
  }

  const closeInvoiceScreen = () => {
    setIsInvoiceScreenOpen(false)
    setIsInvoiceEditing(false)
    setShowEmailPrompt(false)
  }

  const saveInvoicePdf = async () => {
    if (!reportRange) return
    const lineItem = invoiceProfile.speciality || 'Service'
    const invoiceNumber = invoiceForm.invoiceNumber
    try {
      await generateInvoicePdf({
        profile: invoiceProfile,
        period: reportRange,
        invoiceNumber,
        itemLabel: lineItem,
        unitPrice: invoiceForm.rate,
        quantityMinutes: invoiceForm.durationMinutes,
        subtotal: invoiceForm.total,
        gst: 0,
        balanceDue: invoiceForm.total,
      })
      const nextNumber =
        invoiceNumber > invoiceProfile.nextInvoiceNumber
          ? invoiceNumber + 1
          : invoiceProfile.nextInvoiceNumber + 1
      const updated: InvoiceProfile = { ...invoiceProfile, nextInvoiceNumber: nextNumber }
      setInvoiceProfile(updated)
      setInvoiceDraft(updated)
      await db.invoiceProfile.put({ key: 'main', ...updated, updatedAt: nowIso() })
      setLastInvoiceNumber(invoiceNumber)
      closeInvoiceScreen()
      setShowEmailPrompt(true)
    } catch (error) {
      console.error('Failed to generate invoice', error)
      alert('Failed to generate invoice. See console for details.')
    }
  }

  const openEmailDraft = () => {
    if (!reportRange) {
      alert('Select a reporting period first.')
      return
    }
    if (!settings.accountantEmail) {
      alert('Fill accountant email in Settings first.')
      return
    }
    const invNumber = lastInvoiceNumber ?? invoiceForm.invoiceNumber
    const subject = `Invoice #${invNumber} - ${invoiceProfile.fullName || 'Invoice'}`
    const mailto = `mailto:${encodeURIComponent(settings.accountantEmail)}?subject=${encodeURIComponent(subject)}`
    window.location.href = mailto
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="date-block">
          <div className="today-label">Today</div>
          <div className="today-value">{todayLabel}</div>
        </div>
        <div className="actions">
          <button
            className="icon-button"
            aria-label="Переключить тему"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <button
            className="burger"
            aria-label="Меню"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      {isMenuOpen && (
        <div className="menu-sheet">
          <div className="menu-item">
            <div className="menu-title">User</div>
            <div className="menu-sub">user@example.com</div>
          </div>
          <button className="menu-item action" onClick={goHome}>
            Dashboard
          </button>
          <button className="menu-item action" onClick={openReports}>
            Reports
          </button>
          <button className="menu-item action" onClick={openInvoiceModal}>
            Invoice details
          </button>
          <button className="menu-item action" onClick={openSettings}>
            Settings
          </button>
        </div>
      )}

      {isInvoiceScreenOpen && (
        <div className="modal-backdrop" onClick={closeInvoiceScreen}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header end">
              <button className="ghost-button" onClick={closeInvoiceScreen}>
                Close
              </button>
              <button
                className="ghost-button"
                onClick={() => setIsInvoiceEditing((prev) => !prev)}
              >
                {isInvoiceEditing ? 'Lock' : 'Edit'}
              </button>
            </div>

            <div className="form-grid">
              <div className="field">
                <span className="label">Invoice number</span>
                <input
                  type="number"
                  min={1}
                  value={invoiceForm.invoiceNumber}
                  disabled={!isInvoiceEditing}
                  onChange={(e) =>
                    setInvoiceForm((prev) => ({ ...prev, invoiceNumber: Math.max(1, Number(e.target.value) || 1) }))
                  }
                />
              </div>

              <div className="double">
                <label className="field">
                  <span className="label">Total duration</span>
                  <input
                    type="text"
                    value={`${Math.floor(invoiceForm.durationMinutes / 60)}h ${invoiceForm.durationMinutes % 60}m`}
                    disabled
                  />
                </label>
                <label className="field">
                  <span className="label">Hourly rate</span>
                  <input
                    type="number"
                    min={0}
                    value={invoiceForm.rate}
                    disabled={!isInvoiceEditing}
                    onChange={(e) =>
                      setInvoiceForm((prev) => ({ ...prev, rate: Number(e.target.value) || 0 }))
                    }
                  />
                </label>
              </div>

              <label className="field">
                <span className="label">Total amount</span>
                <input
                  type="number"
                  min={0}
                  value={invoiceForm.total}
                  disabled={!isInvoiceEditing}
                  onChange={(e) =>
                    setInvoiceForm((prev) => ({ ...prev, total: Number(e.target.value) || 0 }))
                  }
                />
              </label>
            </div>

            <div className="actions-row center">
              <button className="primary-btn" onClick={saveInvoicePdf}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmailPrompt && (
        <div className="modal-backdrop" onClick={() => { setShowEmailPrompt(false); setActiveView('home') }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Send invoice</div>
            </div>
            <div className="actions-row">
              <button className="ghost-button" onClick={openEmailDraft}>
                Open email draft
              </button>
              <button
                className="primary-btn"
                onClick={() => {
                  setShowEmailPrompt(false)
                  setActiveView('home')
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="content">
        {activeView === 'home' ? (
          <>
            <section className="overview">
              <div className="overview-label">Total payout</div>
              <div className="overview-period">{periodLabel}</div>
              <div className="overview-value">${money(totalPay)} AUD</div>
              <div className="overview-sub">Duration: {formatDuration(totalDurationMinutes)}</div>
              <div className="overview-sub">Rate: {settings.hourlyRate} AUD/hr</div>
            </section>

            <section className="shift-list">
              {sortedShifts.map((shift) => {
                const workedMinutes = minutesBetween(shift.start, shift.end) - shift.lunchMinutes
                const hours = Math.max(workedMinutes, 0) / 60
                const salary = hours * shift.hourlyRate
                return (
                  <article key={shift.id} className="shift-card">
                    <div className="shift-card__header">
                      <div className="shift-date">{formatDate(shift.date)}</div>
                      <div className="shift-actions">
                        <button className="ghost-button danger" onClick={() => handleDelete(shift.id)}>
                          Delete
                        </button>
                        <button className="ghost-button" onClick={() => openEdit(shift)}>
                          Edit
                        </button>
                      </div>
                    </div>
                    <div className="shift-grid">
                      <div>
                        <div className="label">Start</div>
                        <div className="value">{shift.start}</div>
                      </div>
                      <div>
                        <div className="label">End</div>
                        <div className="value">{shift.end}</div>
                      </div>
                      <div>
                        <div className="label">Lunch</div>
                        <div className="value">{shift.lunchMinutes} min</div>
                      </div>
                      <div>
                        <div className="label">Duration</div>
                        <div className="value">{formatDuration(workedMinutes)}</div>
                      </div>
                      <div>
                        <div className="label">Pay</div>
                        <div className="value accent">${money(salary)} AUD</div>
                      </div>
                    </div>
                    {shift.comment && <div className="comment">“{shift.comment}”</div>}
                  </article>
                )
              })}
            </section>
          </>
        ) : (
          <section className="reports-card">
            <div className="reports-header">
              <button className="nav-btn" onClick={goPrevPeriod} disabled={!canNavigateReports}>
                ‹
              </button>
              <div className="reports-range">{reportPeriodLabel}</div>
              <button className="nav-btn" onClick={goNextPeriod} disabled={!canNavigateReports}>
                ›
              </button>
            </div>

            <div className="reports-list">
              {reportDays.map((day) => (
                <div key={day.date} className="report-row">
                  <div className="report-date">{formatDate(day.date)}</div>
                  <div className="report-meta">
                    <div className="value">{formatDuration(day.durationMinutes)}</div>
                  </div>
                  <div className="report-meta">
                    <div className="value accent">${money(day.pay)}</div>
                  </div>
                </div>
              ))}
              {reportDays.length === 0 && (
                <div className="report-row empty">No shifts in this period</div>
              )}
            </div>

            <div className="reports-total">
              <div className="label">Total payout</div>
              <div className="value accent">${money(reportTotals.pay)}</div>
            </div>

            <div className="reports-actions">
              {!hasInvoiceCoreFields && (
                <div className="hint">Fill invoice details to enable invoicing.</div>
              )}
              <button
                className="primary-btn"
                onClick={openInvoiceScreen}
                disabled={!hasInvoiceCoreFields || reportDays.length === 0}
              >
                Create invoice
              </button>
            </div>
          </section>
        )}
      </main>

      {activeView === 'home' && (
        <button className="floating-btn" onClick={openCreate}>
          Add work time
        </button>
      )}

      {isAddOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="ghost-button" onClick={closeModal}>
                Close
              </button>
              <div className="modal-title">
                {editingId ? 'Edit shift' : 'New shift'}
              </div>
            </div>

            <div className="form-grid">
              <div className="picker-group">
                <div className="picker-title">Date</div>
                <div className="picker-row">
                  <WheelPicker
                    options={dayOptions}
                    value={String(selectedDate.day).padStart(2, '0')}
                    onChange={updateDateByDay}
                  />
                  <WheelPicker options={monthOptions} value={`${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}`} onChange={updateDateByMonth} />
                </div>
              </div>

              <div className="picker-group">
                <div className="picker-title">Start</div>
                <div className="picker-row">
                  <WheelPicker
                    options={hourOptions}
                    value={form.start.split(':')[0]}
                    onChange={(val) => updateTime('start', 'hour', val)}
                  />
                  <WheelPicker
                    options={minuteOptions}
                    value={form.start.split(':')[1]}
                    onChange={(val) => updateTime('start', 'minute', val)}
                  />
                </div>
              </div>

              <div className="picker-group">
                <div className="picker-title">End</div>
                <div className="picker-row">
                  <WheelPicker
                    options={hourOptions}
                    value={form.end.split(':')[0]}
                    onChange={(val) => updateTime('end', 'hour', val)}
                  />
                  <WheelPicker
                    options={minuteOptions}
                    value={form.end.split(':')[1]}
                    onChange={(val) => updateTime('end', 'minute', val)}
                  />
                </div>
              </div>

              <div className="picker-group">
                <div className="picker-title">Lunch (min)</div>
                <div className="picker-row single">
                  <WheelPicker
                    options={lunchOptions}
                    value={String(form.lunchMinutes)}
                    onChange={(val) => setForm((prev) => ({ ...prev, lunchMinutes: Number(val) }))}
                  />
                </div>
              </div>

              <label className="field">
                <span className="label">Comment</span>
                <textarea
                  rows={3}
                  placeholder="Optional"
                  value={form.comment}
                  onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                />
              </label>
            </div>

            <button className="primary-btn" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-backdrop" onClick={closeSettings}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="ghost-button" onClick={closeSettings}>
                Close
              </button>
              <div className="modal-title">Settings</div>
            </div>

            <div className="form-grid">
              <div className="field">
                <span className="label">Reporting period</span>
                <div className="segment">
                  {[
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'custom', label: 'Custom dates' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      className={`segment-btn ${settingsDraft.period === opt.value ? 'is-active' : ''}`}
                      onClick={() => setSettingsDraft((prev) => ({ ...prev, period: opt.value as Settings['period'] }))}
                      type="button"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {settingsDraft.period === 'weekly' && (
                <div className="field">
                  <span className="label">Week starts on</span>
                  <div className="segment">
                    {[
                      'monday',
                      'tuesday',
                      'wednesday',
                      'thursday',
                      'friday',
                      'saturday',
                      'sunday',
                    ].map((day) => (
                      <button
                        key={day}
                        className={`segment-btn compact ${settingsDraft.weekStart === day ? 'is-active' : ''}`}
                        onClick={() =>
                          setSettingsDraft((prev) => ({ ...prev, weekStart: day as Settings['weekStart'] }))
                        }
                        type="button"
                      >
                        {day === 'monday'
                          ? 'Mon'
                          : day === 'tuesday'
                            ? 'Tue'
                            : day === 'wednesday'
                              ? 'Wed'
                              : day === 'thursday'
                                ? 'Thu'
                                : day === 'friday'
                                  ? 'Fri'
                                  : day === 'saturday'
                                    ? 'Sat'
                                    : 'Sun'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="field">
                <span className="label">Hourly rate (AUD)</span>
                <input
                  type="number"
                  min={0}
                  value={settingsDraft.hourlyRate}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, hourlyRate: Number(e.target.value) || 0 }))
                  }
                />
              </label>

              <label className="field">
                <span className="label">Your email</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={settingsDraft.userEmail}
                  onChange={(e) => setSettingsDraft((prev) => ({ ...prev, userEmail: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="label">Accountant email</span>
                <input
                  type="email"
                  placeholder="accountant@example.com"
                  value={settingsDraft.accountantEmail}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, accountantEmail: e.target.value }))
                  }
                />
              </label>
            </div>

            <button className="primary-btn" onClick={saveSettings}>
              Save
            </button>
          </div>
        </div>
      )}

      {isInvoiceModalOpen && (
        <div className="modal-backdrop" onClick={closeInvoiceModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="ghost-button" onClick={closeInvoiceModal}>
                Close
              </button>
              <div className="modal-title">Invoice details</div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span className="label">Full Name</span>
                <input
                  type="text"
                  value={invoiceDraft.fullName}
                  onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="label">Address</span>
                <input
                  type="text"
                  value={invoiceDraft.address}
                  onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, address: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="label">ABN</span>
                <input
                  type="text"
                  value={invoiceDraft.abn}
                  onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, abn: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="label">Speciality</span>
                <input
                  type="text"
                  value={invoiceDraft.speciality}
                  onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, speciality: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="label">Account Bank Name</span>
                <input
                  type="text"
                  value={invoiceDraft.accountBankName}
                  onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, accountBankName: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="label">BSB</span>
                <input
                  type="text"
                  value={invoiceDraft.bsb}
                  onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, bsb: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="label">Account number</span>
                <input
                  type="text"
                  value={invoiceDraft.accountNumber}
                  onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, accountNumber: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="label">Next invoice number</span>
                <input
                  type="number"
                  min={1}
                  value={invoiceDraft.nextInvoiceNumber}
                  onChange={(e) =>
                    setInvoiceDraft((prev) => ({
                      ...prev,
                      nextInvoiceNumber: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </label>
            </div>

            <button className="primary-btn" onClick={saveInvoiceProfile}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
