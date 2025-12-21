import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { db } from './db'
import type { Settings, Shift, ShiftForm } from './types'

const INITIAL_HOURLY_RATE = 25

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

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  return Math.max(endMin - startMin, 0)
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

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

const nowIso = () => new Date().toISOString()

function getPeriodRange(settings: Settings) {
  const today = new Date()
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

  useEffect(() => {
    const index = Math.max(
      0,
      options.findIndex((item) => item.value === value),
    )
    if (ref.current) {
      const target = Math.max(0, viewportPadding - itemHeight + index * itemHeight)
      ref.current.scrollTo({
        top: target,
        behavior: 'smooth',
      })
    }
  }, [value, options, itemHeight, viewportPadding])

  const snapToNearest = () => {
    if (!ref.current) return
    const { scrollTop } = ref.current
    const relative = scrollTop - (viewportPadding - itemHeight)
    const index = Math.round(relative / itemHeight)
    const clamped = Math.min(options.length - 1, Math.max(0, index))
    const target = Math.max(0, viewportPadding - itemHeight + clamped * itemHeight)
    ref.current.scrollTo({ top: target, behavior: 'smooth' })
    const selected = options[clamped]
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
        {options.map((option) => (
          <div
            key={option.value}
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
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [form, setForm] = useState<ShiftForm>(emptyForm)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState<Settings>(DEFAULT_SETTINGS)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [shiftRows, settingsRow] = await Promise.all([
          db.shifts.toArray(),
          db.settings.get('main'),
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

  const totals = useMemo(() => {
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
  }, [shifts, periodRange])

  const totalPay = totals.pay
  const totalDurationMinutes = totals.durationMinutes

  const periodLabel = useMemo(() => {
    if (!periodRange) return 'All time'
    return `${formatDate(periodRange.start)} — ${formatDate(periodRange.end)}`
  }, [periodRange])

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
    try {
      await db.settings.put({ key: 'main', ...settingsDraft, updatedAt: nowIso() })
    } catch (error) {
      console.error('Failed to save settings', error)
    }
    closeSettings()
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
          <button className="menu-item action" onClick={openSettings}>
            Settings
          </button>
        </div>
      )}

      <main className="content">
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
      </main>

      <button className="floating-btn" onClick={openCreate}>
        Add work time
      </button>

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
    </div>
  )
}

export default App
