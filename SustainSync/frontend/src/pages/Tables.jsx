import { useCallback, useEffect, useMemo, useState } from 'react'
import '../App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const UTILITY_OPTIONS = ['Power', 'Gas', 'Water']
const PAGE_SIZE_OPTIONS = [20, 50, 100]
const DEFAULT_PAGE_SIZE = 20
const UNITS_OPTIONS = ['kWh', 'therms', 'CCF']

const TABLE_COLUMNS = [
  { key: 'bill_date', label: 'Bill Date', sortType: 'date', defaultDirection: 'desc' },
  { key: 'service_period', label: 'Service Period', sortType: 'date', defaultDirection: 'desc' },
  { key: 'consumption', label: 'Consumption', sortType: 'number', defaultDirection: 'desc' },
  { key: 'cost', label: 'Cost', sortType: 'number', defaultDirection: 'desc' },
  { key: 'provider', label: 'Provider', sortType: 'string', defaultDirection: 'asc' },
  { key: 'location', label: 'Location', sortType: 'string', defaultDirection: 'asc' },
  { key: 'timestamp_upload', label: 'Uploaded', sortType: 'date', defaultDirection: 'desc' },
]

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const number = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const toInputValue = (value) => {
  if (value === null || value === undefined) return ''
  return `${value}`
}

function Tables() {
  const [utility, setUtility] = useState(UTILITY_OPTIONS[0])
  const [rows, setRows] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [formState, setFormState] = useState({})
  const [saveError, setSaveError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [sortConfig, setSortConfig] = useState(null)

  const collator = useMemo(() => new Intl.Collator('en', { sensitivity: 'base', numeric: false }), [])

  useEffect(() => {
    setPage(1)
  }, [utility])

  useEffect(() => {
    setEditingId(null)
    setFormState({})
    setSaveError('')
  }, [utility, page, pageSize])

  const loadBills = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatusMessage('')
    try {
      const params = new URLSearchParams({
        bill_type: utility,
        page: String(page),
        page_size: String(pageSize),
      })
      const response = await fetch(`${API_BASE}/api/bills/?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load bills')
      }
      setRows(Array.isArray(data.results) ? data.results : [])
      setTotalCount(typeof data.count === 'number' ? data.count : 0)
      const resolvedPages = Math.max(1, Number(data.total_pages) || 1)
      setTotalPages(resolvedPages)
      if (page > resolvedPages) {
        setPage(resolvedPages)
      }
    } catch (err) {
      setRows([])
      setTotalCount(0)
      setTotalPages(1)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [utility, page, pageSize])

  useEffect(() => {
    loadBills()
  }, [loadBills])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.cost += Number(row.cost || 0)
        acc.consumption += Number(row.consumption || 0)
        return acc
      },
      { cost: 0, consumption: 0 }
    )
  }, [rows])

  const startEdit = (row) => {
    setEditingId(row.bill_id)
    setFormState({
      bill_type: row.bill_type,
      bill_date: row.bill_date || '',
      service_start: row.service_start || '',
      service_end: row.service_end || '',
      consumption: toInputValue(row.consumption),
      cost: toInputValue(row.cost),
      provider: row.provider || '',
      city: row.city || '',
      state: row.state || '',
      zip: row.zip || '',
      units_of_measure: row.units_of_measure || '',
    })
    setSaveError('')
    setStatusMessage('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormState({})
    setSaveError('')
  }

  const handleFieldChange = (event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    if (!editingId) return
    setSaving(true)
    setSaveError('')
    setStatusMessage('')

    const payload = {}
    for (const [key, value] of Object.entries(formState)) {
      if (value === '' || value === null) {
        payload[key] = ''
      } else if (key === 'state') {
        payload[key] = value.toUpperCase()
      } else {
        payload[key] = value
      }
    }

    try {
      const response = await fetch(`${API_BASE}/api/bills/${editingId}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to update bill')
      }
      setEditingId(null)
      setFormState({})
      await loadBills()
      setStatusMessage('Bill updated successfully.')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const getSortValue = (row, columnKey) => {
    switch (columnKey) {
      case 'bill_date':
        return row.bill_date
      case 'service_period':
        return row.service_start || row.service_end || row.bill_date
      case 'consumption':
        return row.consumption
      case 'cost':
        return row.cost
      case 'provider':
        return row.provider
      case 'location':
        return [row.city, row.state, row.zip].filter(Boolean).join(' ')
      case 'timestamp_upload':
        return row.timestamp_upload
      default:
        return ''
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortConfig) return rows
    const column = TABLE_COLUMNS.find((entry) => entry.key === sortConfig.key)
    if (!column) return rows
    const direction = sortConfig.direction === 'asc' ? 1 : -1

    const normaliseDate = (value) => {
      if (!value) return null
      const time = new Date(value).getTime()
      return Number.isNaN(time) ? null : time
    }

    return [...rows].sort((a, b) => {
      const valueA = getSortValue(a, column.key)
      const valueB = getSortValue(b, column.key)

      if (column.sortType === 'number') {
        const numberA = Number(valueA)
        const numberB = Number(valueB)
        const hasNumberA = !Number.isNaN(numberA)
        const hasNumberB = !Number.isNaN(numberB)
        if (!hasNumberA && !hasNumberB) return 0
        const fallback = direction === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
        const resolvedA = hasNumberA ? numberA : fallback
        const resolvedB = hasNumberB ? numberB : fallback
        if (resolvedA === resolvedB) return 0
        const comparison = resolvedA - resolvedB
        return comparison === 0 ? 0 : comparison * direction
      }

      if (column.sortType === 'date') {
        const timeA = normaliseDate(valueA)
        const timeB = normaliseDate(valueB)
        if (timeA === null && timeB === null) return 0
        if (timeA === null) return 1
        if (timeB === null) return -1
        if (timeA === timeB) return 0
        const comparison = timeA - timeB
        return comparison === 0 ? 0 : comparison * direction
      }

      const textA = String(valueA ?? '').trim()
      const textB = String(valueB ?? '').trim()
      const comparison = collator.compare(textA, textB)
      if (comparison === 0) return 0
      return comparison * direction
    })
  }, [rows, sortConfig, collator])

  const handleSort = (columnKey) => {
    const column = TABLE_COLUMNS.find((entry) => entry.key === columnKey)
    setSortConfig((current) => {
      if (current?.key === columnKey) {
        const nextDirection = current.direction === 'asc' ? 'desc' : 'asc'
        return { key: columnKey, direction: nextDirection }
      }
      return {
        key: columnKey,
        direction: column?.defaultDirection ?? 'asc',
      }
    })
  }

  const renderCell = (columnKey, row, isEditing) => {
    switch (columnKey) {
      case 'bill_date':
        return isEditing ? (
          <input type="date" name="bill_date" value={formState.bill_date ?? ''} onChange={handleFieldChange} />
        ) : (
          formatDate(row.bill_date)
        )
      case 'service_period':
        return isEditing ? (
          <div className="table-edit-group">
            <input
              type="date"
              name="service_start"
              value={formState.service_start ?? ''}
              onChange={handleFieldChange}
              aria-label="Service period start"
            />
            <span>→</span>
            <input
              type="date"
              name="service_end"
              value={formState.service_end ?? ''}
              onChange={handleFieldChange}
              aria-label="Service period end"
            />
          </div>
        ) : row.service_start || row.service_end ? (
          `${formatDate(row.service_start)} – ${formatDate(row.service_end)}`
        ) : (
          '—'
        )
      case 'consumption':
        return isEditing ? (
          <div className="table-edit-group">
            <input
              type="number"
              name="consumption"
              value={formState.consumption ?? ''}
              onChange={handleFieldChange}
              step="0.01"
              min="0"
            />
            <select name="units_of_measure" value={formState.units_of_measure ?? ''} onChange={handleFieldChange}>
              <option value="">Units</option>
              {UNITS_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            {number.format(row.consumption ?? 0)}{' '}
            {row.units_of_measure ? <span className="pill pill--ongoing">{row.units_of_measure}</span> : null}
          </>
        )
      case 'cost':
        return isEditing ? (
          <input type="number" name="cost" value={formState.cost ?? ''} onChange={handleFieldChange} step="0.01" min="0" />
        ) : (
          currency.format(row.cost ?? 0)
        )
      case 'provider':
        return isEditing ? (
          <div className="table-edit-group">
            <select name="bill_type" value={formState.bill_type ?? utility} onChange={handleFieldChange}>
              {UTILITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input type="text" name="provider" value={formState.provider ?? ''} onChange={handleFieldChange} placeholder="Provider" />
          </div>
        ) : (
          row.provider || '—'
        )
      case 'location': {
        if (isEditing) {
          return (
            <div className="table-edit-group">
              <input type="text" name="city" value={formState.city ?? ''} onChange={handleFieldChange} placeholder="City" />
              <input
                type="text"
                name="state"
                value={formState.state ?? ''}
                onChange={handleFieldChange}
                placeholder="State"
                maxLength={8}
              />
              <input type="text" name="zip" value={formState.zip ?? ''} onChange={handleFieldChange} placeholder="ZIP" />
            </div>
          )
        }
        const cityState =
          row.city || row.state ? `${row.city ?? ''}${row.city && row.state ? ', ' : ''}${row.state ?? ''}`.trim() : ''
        const locationParts = []
        if (cityState) locationParts.push(cityState)
        if (row.zip) locationParts.push(row.zip)
        return locationParts.length > 0 ? locationParts.join(' ') : '—'
      }
      case 'timestamp_upload':
        return row.timestamp_upload
          ? new Date(row.timestamp_upload).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : '—'
      default:
        return '—'
    }
  }

  const recordsStart = rows.length > 0 ? (page - 1) * pageSize + 1 : 0
  const recordsEnd = rows.length > 0 ? (page - 1) * pageSize + rows.length : 0

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1>Utility Tables</h1>
          <p>Dive into historical billing records by utility. Switch between power, gas, and water to inspect costs and consumption.</p>
        </div>
        <div className="header-actions" style={{ gap: '12px' }}>
          {UTILITY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={utility === option ? 'primary' : 'ghost'}
              onClick={() => setUtility(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div className="panel-header-row" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <h2>{utility} Billing Records</h2>
                <p>
                  Showing {pageSize} records per page. Click any column header to sort and edit entries directly to keep your dataset focused and accurate.
                </p>
              </div>
              <div className="table-summary" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end' }}>
                <span className="pill">Total records: {totalCount.toLocaleString('en-US')}</span>
                <span className="pill">Page: {page} / {totalPages}</span>
                <span className="pill">Visible: {rows.length.toLocaleString('en-US')}</span>
                <span className="pill">Cost: {currency.format(totals.cost)}</span>
                <span className="pill">Consumption: {number.format(totals.consumption)}</span>
              </div>
            </div>
          </div>
        </div>

        {loading && <div className="goals-manager-loading">Loading {utility.toLowerCase()} bills...</div>}
        {error && !loading && <div className="warning-banner">{error}</div>}
        {statusMessage && !loading && !error && <div className="status-banner">{statusMessage}</div>}
        {saveError && !loading && <div className="error-banner">{saveError}</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="empty-state-large">
            <div className="empty-state-icon">📄</div>
            <h3>No records yet</h3>
            <p>Upload {utility.toLowerCase()} bills to populate this table.</p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="table-scroller">
              <table className="data-table">
                <thead>
                  <tr>
                    {TABLE_COLUMNS.map((column) => {
                      const isActive = sortConfig?.key === column.key
                      const direction = isActive ? sortConfig.direction : null
                      const ariaSort = isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                      const icon = !isActive ? '↕' : direction === 'asc' ? '▲' : '▼'
                      return (
                        <th key={column.key} aria-sort={ariaSort}>
                          <button
                            type="button"
                            className={`data-table__sort${isActive ? ` data-table__sort--active data-table__sort--${direction}` : ''}`}
                            onClick={() => handleSort(column.key)}
                            aria-label={`Sort by ${column.label}`}
                          >
                            <span>{column.label}</span>
                            <span className="data-table__sort-icon" aria-hidden="true">
                              {icon}
                            </span>
                          </button>
                        </th>
                      )
                    })}
                    <th aria-label="Row actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const isEditing = editingId === row.bill_id
                    return (
                      <tr key={row.bill_id} className={isEditing ? 'table-row--editing' : ''}>
                        {TABLE_COLUMNS.map((column) => (
                          <td key={column.key}>{renderCell(column.key, row, isEditing)}</td>
                        ))}
                        <td>
                          {isEditing ? (
                            <div className="table-edit-actions">
                              <button type="button" className="ghost" onClick={cancelEdit} disabled={saving}>
                                Cancel
                              </button>
                              <button type="button" className="primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="ghost" onClick={() => startEdit(row)}>
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <footer className="table-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
              <div>
                Showing {recordsStart.toLocaleString('en-US')} - {recordsEnd.toLocaleString('en-US')} of {totalCount.toLocaleString('en-US')} records
              </div>
              <div className="table-pagination" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label className="input-control input-control--select table-pagination__pagesize" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}>
                  <span>Rows per page</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value))
                      setPage(1)
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ghost" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

export default Tables
