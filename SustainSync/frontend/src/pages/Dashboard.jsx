import { useEffect, useMemo, useState } from 'react'
import '../App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const number = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

// Formatters shared across charts and summary cards.
const formatMonthLabel = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const formatValueLabel = (value, isCurrency = false) => {
  if (value === null || value === undefined) return '—'
  return isCurrency ? currency.format(value) : number.format(value)
}

// Build a simple 12-month cost breakdown table component
function MonthlyBreakdownTable({ monthlySeries = [], forecastData = null }) {
  // Build an array of the most recent 12 months (labels)
  const months = useMemo(() => {
    const list = monthlySeries.map((m) => m.month).filter(Boolean)
    // last 12 months
    const last12 = list.slice(-12)
    return last12
  }, [monthlySeries])

  // Gather per-utility cost by month from forecastData.breakdown histories
  const rows = useMemo(() => {
    const breakdown = (forecastData?.breakdown || []).filter(Boolean)
    const utilities = breakdown.map((b) => b.bill_type)

    const monthKeys = months
    const table = utilities.map((util) => {
      const entry = breakdown.find((b) => b.bill_type === util)
      const history = (entry?.history || []).reduce((acc, h) => {
        acc[h.date] = h.value ?? 0
        return acc
      }, {})
      const cells = monthKeys.map((m) => history[m] ?? 0)
      const total = cells.reduce((s, v) => s + (v || 0), 0)
      return { utility: util, cells, total }
    })

    // Add totals row from monthlySeries as fallback
    const totals = monthKeys.map((m) => {
      const found = monthlySeries.find((s) => s.month === m)
      return found ? found.total_cost : 0
    })

    // Filter out utilities that are all zeros to avoid noisy rows
    const utilitiesFiltered = table.filter((r) => r.total && r.total !== 0)

    return { utilities: utilitiesFiltered, months: monthKeys, totals, hasBreakdown: utilitiesFiltered.length > 0 }
  }, [forecastData, months, monthlySeries])

  if (!rows.months || rows.months.length === 0) {
    return <div className="empty-state">Not enough historical monthly data to show a breakdown.</div>
  }

  // If there is no per-utility breakdown (all utilities sum to zero), show totals-only with a note
  if (!rows.hasBreakdown) {
    return (
      <div className="monthly-breakdown">
        <div className="empty-state">Per-utility breakdown is unavailable for the selected months. Showing totals only.</div>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              {rows.months.map((m) => (
                <th key={m}>{formatMonthLabel(m)}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Total</strong></td>
              {rows.totals.map((t, idx) => (
                <td key={idx}>{formatValueLabel(t, true)}</td>
              ))}
              <td>{formatValueLabel(rows.totals.reduce((s, v) => s + (v || 0), 0), true)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="monthly-breakdown">
      <table>
        <thead>
          <tr>
            <th>Utility</th>
            {rows.months.map((m) => (
              <th key={m}>{formatMonthLabel(m)}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.utilities.map((r) => (
            <tr key={r.utility}>
              <td>{r.utility}</td>
              {r.cells.map((c, idx) => (
                <td key={idx}>{formatValueLabel(c, true)}</td>
              ))}
              <td>{formatValueLabel(r.total, true)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            {rows.totals.map((t, idx) => (
              <td key={idx}><strong>{formatValueLabel(t, true)}</strong></td>
            ))}
            <td><strong>{formatValueLabel(rows.totals.reduce((s, v) => s + (v || 0), 0), true)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// Aggregate last 12 months into 4 calendar quarters and render a breakdown table
function QuarterlyBreakdownTable({ monthlySeries = [], forecastData = null }) {
  const months = useMemo(() => {
    const list = monthlySeries.map((m) => m.month).filter(Boolean)
    return list.slice(-12)
  }, [monthlySeries])

  // Map months to quarter labels e.g. Q1 2024
  const quarters = useMemo(() => {
    // Group months into 3-month windows aligned to calendar quarters
    const qMap = {}
    months.forEach((m) => {
      const d = new Date(m)
      const q = Math.floor(d.getMonth() / 3) + 1
      const label = `Q${q} ${d.getFullYear()}`
      if (!qMap[label]) qMap[label] = []
      qMap[label].push(m)
    })
    // Keep order of appearance and only most recent 4 quarters
    const ordered = Object.keys(qMap)
    return ordered.slice(-4).map((label) => ({ label, months: qMap[label] }))
  }, [months])

  // Build per-utility aggregated costs per quarter
  const rows = useMemo(() => {
    const breakdown = (forecastData?.breakdown || []).filter(Boolean)
    const utilities = breakdown.map((b) => b.bill_type)

    const table = utilities.map((util) => {
      const entry = breakdown.find((b) => b.bill_type === util)
      const history = (entry?.history || []).reduce((acc, h) => {
        acc[h.date] = h.value ?? 0
        return acc
      }, {})

      const cells = quarters.map((q) => {
        return q.months.reduce((sum, m) => sum + (history[m] ?? 0), 0)
      })
      const total = cells.reduce((s, v) => s + v, 0)
      return { utility: util, cells, total }
    })

    // Totals per quarter from monthlySeries
    const totals = quarters.map((q) =>
      q.months.reduce((s, m) => {
        const found = monthlySeries.find((s2) => s2.month === m)
        return s + (found ? found.total_cost : 0)
      }, 0)
    )

    // Filter empty utilities
    const utilitiesFiltered = table.filter((r) => r.total && r.total !== 0)
    return { utilities: utilitiesFiltered, quarters, totals, hasBreakdown: utilitiesFiltered.length > 0 }
  }, [forecastData, quarters, monthlySeries])

  if (!rows.quarters || rows.quarters.length === 0) {
    return <div className="empty-state">Not enough historical data to display quarterly breakdown.</div>
  }

  if (!rows.hasBreakdown) {
    return (
      <div className="monthly-breakdown">
        <div className="empty-state">Per-utility breakdown is unavailable for the selected quarters. Showing totals only.</div>
        <table>
          <thead>
            <tr>
              <th>Quarter</th>
              {rows.quarters.map((q) => (
                <th key={q.label}>{q.label}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Total</strong></td>
              {rows.totals.map((t, idx) => (
                <td key={idx}>{formatValueLabel(t, true)}</td>
              ))}
              <td>{formatValueLabel(rows.totals.reduce((s, v) => s + (v || 0), 0), true)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="monthly-breakdown">
      <table>
        <thead>
          <tr>
            <th>Utility</th>
            {rows.quarters.map((q) => (
              <th key={q.label}>{q.label}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.utilities.map((r) => (
            <tr key={r.utility}>
              <td>{r.utility}</td>
              {r.cells.map((c, idx) => (
                <td key={idx}>{formatValueLabel(c, true)}</td>
              ))}
              <td>{formatValueLabel(r.total, true)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            {rows.totals.map((t, idx) => (
              <td key={idx}><strong>{formatValueLabel(t, true)}</strong></td>
            ))}
            <td><strong>{formatValueLabel(rows.totals.reduce((s, v) => s + (v || 0), 0), true)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// Filter history to show only the last 3 years
const filterLast3Years = (history = []) => {
  if (history.length === 0) return []
  
  const threeYearsAgo = new Date()
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
  
  return history.filter(item => {
    const itemDate = new Date(item.date)
    return itemDate >= threeYearsAgo
  })
}

// Convert API history entries into the structure used by charts.
const mapHistoryToSeries = (history = []) =>
  filterLast3Years(history).map((item) => ({
    label: formatMonthLabel(item.date),
    date: item.date,
    value: item.usage ?? item.value ?? 0,
  }))

const mapHistoryToCostSeries = (history = []) =>
  filterLast3Years(history).map((item) => ({
    label: formatMonthLabel(item.date),
    date: item.date,
    value: item.value ?? 0,
  }))

const mapForecastToSeries = (series = []) =>
  series.map((item) => ({
    label: formatMonthLabel(item.date),
    date: item.date,
    value: item.yhat_usage ?? item.yhat ?? 0,
  }))

const mapForecastToCostSeries = (series = []) =>
  series.map((item) => ({
    label: formatMonthLabel(item.date),
    date: item.date,
    value: item.yhat ?? 0,
  }))

// Shared hook for loading states so individual sections can toggle flags.
const useAsyncState = (initialValue) => {
  const [state, setState] = useState(initialValue)
  const update = (patch) => setState((prev) => ({ ...prev, ...patch }))
  return [state, update]
}

// Render a simple single-line chart for totals or breakdown cards.
function SimpleLineChart({ actual = [], forecast = [], height = 240, responsive = false, units = 'units', dataLabel = 'Value' }) {
  const padding = 70
  const rightPadding = 30
  const width = responsive ? 580 : 500

  const combined = actual
    .map((entry, idx) => ({ ...entry, index: idx, type: 'actual' }))
    .concat(
      forecast.map((entry, idx) => ({
        ...entry,
        index: actual.length + idx,
        type: 'forecast',
      }))
    )

  if (combined.length === 0) {
    return <div className="chart-empty">No data available yet.</div>
  }

  const maxValue = combined.reduce((max, entry) => Math.max(max, entry.value || 0), 0)
  const minValue = Math.min(0, ...combined.map((entry) => entry.value || 0))
  const yRange = maxValue - minValue || 1

  const xForIndex = (index) => {
    if (combined.length === 1) return width / 2
    return padding + (index / (combined.length - 1)) * (width - padding - rightPadding)
  }

  const yForValue = (value) => {
    const normalized = (value - minValue) / yRange
    const chartHeight = height - padding * 1.2
    return height - padding * 0.4 - normalized * chartHeight
  }

  const makePoints = (dataset) =>
    dataset
      .map((entry) => `${xForIndex(entry.index).toFixed(2)},${yForValue(entry.value || 0).toFixed(2)}`)
      .join(' ')

  const actualPoints = makePoints(actual.map((entry, idx) => ({ ...entry, index: idx })))
  const forecastPoints = makePoints(
    forecast.map((entry, idx) => ({ ...entry, index: actual.length + idx }))
  )

  const gridSteps = 4
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const value = minValue + (yRange / gridSteps) * i
    const y = yForValue(value)
    return { value, y }
  })

  const labelStride = Math.max(1, Math.floor(combined.length / 6))

  return (
    <div className={`chart-wrapper ${responsive ? 'chart-wrapper--responsive' : ''}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Chart" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="forecastGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(140, 195, 66, 0.35)" />
            <stop offset="100%" stopColor="rgba(140, 195, 66, 0)" />
          </linearGradient>
        </defs>

        {gridLines.map(({ y }, idx) => (
          <line key={idx} x1={padding} x2={width - padding} y1={y} y2={y} className="chart-grid" />
        ))}

        <line x1={padding} x2={padding} y1={padding * 0.4} y2={height - padding * 0.4} className="chart-axis" />
        <line
          x1={padding}
          x2={width - padding}
          y1={height - padding * 0.4}
          y2={height - padding * 0.4}
          className="chart-axis"
        />

        {gridLines.map(({ value, y }, idx) => (
          <text key={idx} x={padding - 8} y={y + 4} className="chart-tick">
            {formatValueLabel(value)}
          </text>
        ))}

        {combined.map((entry, idx) => {
          if (idx % labelStride !== 0) return null
          const x = xForIndex(entry.index)
          return (
            <text key={`label-${idx}`} x={x} y={height - 8} className="chart-label">
              {entry.label}
            </text>
          )
        })}

        {forecast.length > 0 && (
          <polygon
            className="chart-forecast-area"
            points={
              forecastPoints && `${forecastPoints} ${xForIndex(actual.length + forecast.length - 1)},${height - padding * 0.4} ${xForIndex(actual.length)},${height - padding * 0.4}`
            }
          />
        )}

        {actualPoints && <polyline className="chart-line" points={actualPoints} />}
        {forecastPoints && <polyline className="chart-line--forecast" points={forecastPoints} />}
      </svg>

      <div className="chart-legend">
        <div className="chart-key">
          <strong>Showing:</strong> {dataLabel} ({units})
        </div>
        <div className="legend-item">
          <span className="legend-swatch legend-swatch--actual" /> Actuals
        </div>
        {forecast.length > 0 && (
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--forecast" /> Forecast
          </div>
        )}
      </div>
    </div>
  )
}

// Visualise multiple utilities together with brand-coloured series.
function MultiSeriesForecastChart({ datasets = [], timeline = [], height = 280, dataLabel = 'Value', units = 'units' }) {
  if (!datasets.length || !timeline.length) {
    return <div className="chart-empty">Forecast will appear once at least one utility has history.</div>
  }

  const padding = 70
  const rightPadding = 30
  const width = 600

  const seen = new Set()
  const orderedTimeline = []
  timeline.forEach((entry) => {
    if (!entry || !entry.date || seen.has(entry.date)) return
    seen.add(entry.date)
    orderedTimeline.push(entry)
  })

  const labelToIndex = new Map(orderedTimeline.map((entry, idx) => [entry.date, idx]))
  const combinedValues = []

  datasets.forEach((dataset) => {
    [...(dataset.actual || []), ...(dataset.forecast || [])]
      .filter((point) => point && labelToIndex.has(point.date))
      .forEach((point) => combinedValues.push(point.value || 0))
  })

  if (!orderedTimeline.length) {
    return <div className="chart-empty">Forecast will appear once at least one utility has history.</div>
  }

  const maxValue = combinedValues.length ? Math.max(...combinedValues) : 0
  const minValue = combinedValues.length ? Math.min(0, ...combinedValues) : 0
  const yRange = maxValue - minValue || 1

  const yForValue = (value) => {
    const normalized = (value - minValue) / yRange
    const chartHeight = height - padding * 1.2
    return height - padding * 0.4 - normalized * chartHeight
  }

  const xForIndex = (index) => {
    if (orderedTimeline.length === 1) return width / 2
    return padding + (index / (orderedTimeline.length - 1)) * (width - padding - rightPadding)
  }

  const buildPath = (series) =>
    series
      .filter((point) => point && labelToIndex.has(point.date))
      .map((point) => {
        const index = labelToIndex.get(point.date)
        const x = xForIndex(index)
        const y = yForValue(point.value || 0)
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')

  const gridSteps = 4
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const value = minValue + (yRange / gridSteps) * i
    const y = yForValue(value)
    return { value, y }
  })

  const labelStride = Math.max(1, Math.floor(orderedTimeline.length / 6))

  return (
    <div className="chart-wrapper">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Utility comparison chart">
        {gridLines.map(({ y }, idx) => (
          <line key={idx} x1={padding} x2={width - rightPadding} y1={y} y2={y} className="chart-grid" />
        ))}

        <line x1={padding} x2={padding} y1={padding * 0.4} y2={height - padding * 0.4} className="chart-axis" />
        <line
          x1={padding}
          x2={width - rightPadding}
          y1={height - padding * 0.4}
          y2={height - padding * 0.4}
          className="chart-axis"
        />

        {gridLines.map(({ value, y }, idx) => (
          <text key={idx} x={padding - 8} y={y + 4} className="chart-tick">
            {formatValueLabel(value, false)}
          </text>
        ))}

        {orderedTimeline.map((entry, idx) => {
          if (idx % labelStride !== 0) return null
          const x = xForIndex(idx)
          return (
            <text key={entry.date} x={x} y={height - 10} className="chart-label">
              {entry.label}
            </text>
          )
        })}

        {datasets.map((dataset) => {
          const actualPath = buildPath(dataset.actual || [])
          const forecastPath = buildPath(dataset.forecast || [])
          return (
            <g key={dataset.key} className={`multi-line multi-line--${dataset.key}`}>
              {actualPath && <polyline className="multi-line__actual" points={actualPath} />}
              {forecastPath && <polyline className="multi-line__forecast" points={forecastPath} />}
            </g>
          )
        })}
      </svg>

      <div className="chart-legend">
        <div className="chart-key">
          <strong>Showing:</strong> {dataLabel} ({units})
        </div>
        {datasets.map((dataset) => (
          <div className="legend-item" key={dataset.key}>
            <span className={`legend-swatch legend-swatch--${dataset.key}`} /> {dataset.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// Convert newline-delimited LLM responses into bullet points with enhanced formatting.
function BulletList({ text, enhanced = false }) {
  if (!text) return <p className="empty-state">Insights will appear once data is available.</p>

  // Split by multiple newlines or bullet patterns to handle various AI response formats
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (enhanced) {
    const items = []
    let currentSection = null

    lines.forEach((line, idx) => {
      // Remove common bullet markers and numbering
      const cleanLine = line
        .replace(/^[•\-*►▸▹◦⦿⦾]\s*/, '')
        .replace(/^\d+[\.)]\s*/, '')
        .replace(/^#+\s*/, '')
        .trim()

      if (!cleanLine) return

      // Detect headings: short lines ending with colon, bold markers, or all caps phrases
      const isHeading = 
        cleanLine.endsWith(':') || 
        (cleanLine.length < 60 && /^[A-Z\s]+$/.test(cleanLine)) ||
        cleanLine.startsWith('**') ||
        line.startsWith('#')

      if (isHeading) {
        currentSection = cleanLine.replace(/[:*]/g, '').trim()
        items.push({
          type: 'heading',
          text: currentSection,
          key: `heading-${idx}`
        })
      } else {
        // Split long paragraphs into sentences for better readability
        const sentences = cleanLine.split(/(?<=[.!?])\s+(?=[A-Z])/)
        sentences.forEach((sentence, sIdx) => {
          const trimmedSentence = sentence.trim()
          if (trimmedSentence) {
            items.push({
              type: 'item',
              text: trimmedSentence,
              section: currentSection,
              key: `item-${idx}-${sIdx}`
            })
          }
        })
      }
    })

    return (
      <div className="recommendations-enhanced">
        {items.map((item) => {
          if (item.type === 'heading') {
            return (
              <div key={item.key} className="recommendation-section">
                <div className="recommendation-heading">
                  <span className="heading-icon">💡</span>
                  <h4>{item.text}</h4>
                </div>
              </div>
            )
          }
          
          return (
            <div key={item.key} className="recommendation-item">
              <span className="recommendation-icon">✓</span>
              <div className="recommendation-content">
                <p className="recommendation-text">{item.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <ul className="recommendations">
      {lines.map((line, idx) => (
        <li key={idx}>{line.replace(/^[•\-*]\s*/, '').replace(/^\d+[\.)]\s*/, '')}</li>
      ))}
    </ul>
  )
}

// Tab navigation component for switching between utilities
function TabPanel({ tabs = [], activeTab, onTabChange }) {
  return (
    <div className="tab-panel">
      <div className="tab-list" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tab-button ${activeTab === tab.key ? 'tab-button--active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Dashboard() {
  const [metrics, setMetrics] = useState(null)
  const [monthlySeries, setMonthlySeries] = useState([])
  const [forecastData, setForecastData] = useState(null)
  const [recommendations, setRecommendations] = useState('')
  const [recommendationWarning, setRecommendationWarning] = useState('')
  const [uploadResult, setUploadResult] = useState(null)
  const [activeUtilityTab, setActiveUtilityTab] = useState('overview')
  const [loading, setLoading] = useAsyncState({
    metrics: true,
    monthly: true,
    forecast: true,
    recommendations: true,
  })

  const fetchMetrics = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/dashboard/metrics/`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load metrics')
      setMetrics(data)
    } catch (error) {
      setMetrics({ error: error.message })
    } finally {
      setLoading({ metrics: false })
    }
  }

  const fetchMonthly = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/dashboard/monthly/`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load monthly data')
      setMonthlySeries(data.series || [])
    } catch (error) {
      setMonthlySeries([])
    } finally {
      setLoading({ monthly: false })
    }
  }

  const fetchForecast = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/forecast/?periods=12`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load forecast')
      setForecastData(data)
    } catch (error) {
      setForecastData({ error: error.message })
    } finally {
      setLoading({ forecast: false })
    }
  }

  const fetchRecommendations = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/recommendations/`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || data.warning || 'Unable to load recommendations')
      setRecommendations(data.recommendations || '')
      if (data.warning) setRecommendationWarning(data.warning)
    } catch (error) {
      setRecommendations('')
      setRecommendationWarning(error.message)
    } finally {
      setLoading({ recommendations: false })
    }
  }

  useEffect(() => {
    fetchMetrics()
    fetchMonthly()
    fetchForecast()
    fetchRecommendations()
  }, [])

  const actualForecastSeries = useMemo(() => {
    if (!forecastData || forecastData.error) {
      return { actual: [], forecast: [] }
    }
    return {
      actual: mapHistoryToSeries(forecastData.history || []),
      forecast: mapForecastToSeries(forecastData.series || []),
    }
  }, [forecastData])

  const actualForecastCostSeries = useMemo(() => {
    if (!forecastData || forecastData.error) {
      return { actual: [], forecast: [] }
    }
    return {
      actual: mapHistoryToCostSeries(forecastData.history || []),
      forecast: mapForecastToCostSeries(forecastData.series || []),
    }
  }, [forecastData])

  const forecastTimeline = useMemo(() => {
    const combined = [...actualForecastSeries.actual, ...actualForecastSeries.forecast]
    const seen = new Set()
    return combined.filter((entry) => {
      if (seen.has(entry.date)) return false
      seen.add(entry.date)
      return true
    })
  }, [actualForecastSeries])

  const multiSeriesDatasets = useMemo(() => {
    if (!forecastData || forecastData.error) return []
    const datasets = []
    
    const breakdown = (forecastData.breakdown || []).filter((entry) => !entry.error)
    breakdown.forEach((entry) => {
      const key = entry.bill_type.toLowerCase()
      datasets.push({
        key,
        label: entry.bill_type,
        actual: mapHistoryToCostSeries(entry.history || []),
        forecast: mapForecastToCostSeries(entry.series || []),
      })
    })

    return datasets
  }, [forecastData])

  const monthlyCostSeries = useMemo(
    () =>
      monthlySeries.map((entry) => ({
        label: formatMonthLabel(entry.month),
        value: entry.total_cost,
      })),
    [monthlySeries]
  )

  const handleFileUpload = async (event) => {
    const [file] = event.target.files
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    setUploadResult({ status: 'uploading', filename: file.name })

    try {
      const response = await fetch(`${API_BASE}/api/bills/upload/`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Upload failed')
      setUploadResult({ ...data, filename: file.name })

      if (!data.errors?.length) {
        setLoading({ metrics: true, monthly: true, forecast: true })
        fetchMetrics()
        fetchMonthly()
        fetchForecast()
      }
    } catch (error) {
      setUploadResult({ status: 'error', error: error.message, filename: file.name })
    } finally {
      event.target.value = ''
    }
  }

  const totals = metrics?.totals || {}
  const summaries = forecastData?.summaries || {}

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1>SustainSync Insight Center</h1>
          <p>Track branded sustainability metrics, forecast costs, and surface AI guidance in one cohesive hub.</p>
        </div>
        <div className="header-actions">
          <a className="ghost" href="#data-entry">
            Open Data Entry Workspace
          </a>
          <button className="primary" onClick={() => window.open(`${API_BASE}/api/bills/template/`, '_blank')}>
            Download CSV Template
          </button>
          <label className="upload-control">
            <input type="file" accept=".csv" onChange={handleFileUpload} />
            <span>Quick Upload</span>
          </label>
        </div>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Total Spend</span>
          <span className="metric-value">
            {loading.metrics ? 'Loading…' : formatValueLabel(totals.cost || 0)}
          </span>
          <span className="metric-subtitle">Across all utility bills</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Consumption</span>
          <span className="metric-value">
            {loading.metrics ? 'Loading…' : `${number.format(totals.consumption || 0)} units`}
          </span>
          <span className="metric-subtitle">Energy and water combined</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Average Bill</span>
          <span className="metric-value">
            {loading.metrics ? 'Loading…' : formatValueLabel(totals.average_bill || 0)}
          </span>
          <span className="metric-subtitle">Per invoice in the system</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Latest Billing Period</span>
          <span className="metric-value metric-value--small">
            {loading.metrics || !totals.last_updated ? 'Loading…' : formatMonthLabel(totals.last_updated)}
          </span>
          <span className="metric-subtitle">Automatically refreshed after each upload</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Quarterly Spend Trends</h2>
          <p>Visualize how actual utility costs evolve quarter over quarter (last 4 quarters).</p>
        </div>
        {/* New: show last 4 quarters per-utility cost breakdown */}
        <QuarterlyBreakdownTable monthlySeries={monthlySeries} forecastData={forecastData} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>12-Month Prophet Forecast by Utility</h2>
          <p>Select a utility to view detailed forecasts and AI-powered insights.</p>
        </div>
        {forecastData?.error ? (
          <div className="error-banner">{forecastData.error}</div>
        ) : (
          <>
            <TabPanel
              tabs={[
                { key: 'overview', label: 'All Utilities' },
                ...(forecastData?.breakdown || []).map((entry) => ({
                  key: entry.bill_type.toLowerCase(),
                  label: entry.bill_type,
                })),
              ]}
              activeTab={activeUtilityTab}
              onTabChange={setActiveUtilityTab}
            />

            {activeUtilityTab === 'overview' ? (
              <div className="tab-content">
                <div className="forecast-chart-container">
                  <MultiSeriesForecastChart 
                    datasets={multiSeriesDatasets} 
                    timeline={forecastTimeline} 
                    height={240}
                    dataLabel="Total Cost"
                    units="USD ($)"
                  />
                </div>
                <div className="forecast-insights">
                  <h3>Overall Portfolio Insights</h3>
                  <BulletList text={summaries.total} enhanced={true} />
                </div>
              </div>
            ) : (
              (() => {
                const utilityData = (forecastData?.breakdown || []).find(
                  (entry) => entry.bill_type.toLowerCase() === activeUtilityTab
                )
                if (!utilityData) return <div className="empty-state">No data available for this utility.</div>

                // Determine units based on bill type
                const getUnitsForUtility = (billType) => {
                  const type = billType.toLowerCase()
                  if (type.includes('power') || type.includes('electric')) return 'kWh'
                  if (type.includes('gas')) return 'therms'
                  if (type.includes('water')) return 'gallons'
                  return 'units'
                }

                // Generate insights about the data
                const generateDataInsights = (utilityData) => {
                  const history = utilityData.history || []
                  const forecast = utilityData.series || []
                  
                  if (history.length === 0 && forecast.length === 0) {
                    return 'No data available'
                  }

                  const totalDataPoints = history.length + forecast.length
                  const historicalMonths = history.length
                  const forecastMonths = forecast.length

                  let dateRange = ''
                  if (history.length > 0) {
                    const firstDate = new Date(history[0].date)
                    const lastDate = new Date(history[history.length - 1].date)
                    const startMonth = firstDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    const endMonth = lastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    dateRange = `${startMonth} - ${endMonth}`
                  }

                  let insight = `Showing ${historicalMonths} month${historicalMonths !== 1 ? 's' : ''} of historical data`
                  if (dateRange) insight += ` (${dateRange})`
                  if (forecastMonths > 0) {
                    insight += ` with ${forecastMonths} month${forecastMonths !== 1 ? 's' : ''} forecasted`
                  }

                  return insight
                }

                return (
                  <div className="tab-content">
                    <div className="utility-header">
                      <div>
                        <h3>{utilityData.bill_type}</h3>
                        <span className="forecast-model">
                          {generateDataInsights(utilityData)}
                        </span>
                      </div>
                      {utilityData.warning && <span className="pill pill--warning">{utilityData.warning}</span>}
                      {utilityData.error && <span className="pill pill--error">{utilityData.error}</span>}
                    </div>
                    {!utilityData.error ? (
                      <>
                        <div className="forecast-chart-container">
                          <SimpleLineChart
                            actual={mapHistoryToSeries(utilityData.history || [])}
                            forecast={mapForecastToSeries(utilityData.series || [])}
                            height={220}
                            responsive={true}
                            units={getUnitsForUtility(utilityData.bill_type)}
                            dataLabel="Consumption"
                          />
                        </div>
                        <div className="forecast-insights">
                          <h3>AI Insights & Recommendations for {utilityData.bill_type}</h3>
                          <BulletList text={summaries[utilityData.bill_type]} enhanced={true} />
                        </div>
                      </>
                    ) : (
                      <div className="empty-state">
                        Add more {utilityData.bill_type.toLowerCase()} records to generate a forecast.
                      </div>
                    )}
                  </div>
                )
              })()
            )}
          </>
        )}
        {forecastData?.warning && <div className="warning-banner">{forecastData.warning}</div>}
      </section>

      <section className="layout-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>AI Sustainability Recommendations</h2>
            <p>Generated from the contextual RAG pipeline using live database records.</p>
          </div>
          {recommendationWarning && <div className="warning-banner">{recommendationWarning}</div>}
          {loading.recommendations ? <p>Loading recommendations…</p> : <BulletList text={recommendations} enhanced={true} />}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Upload Status &amp; Validation</h2>
            <p>Track the latest CSV ingestion with detailed validation feedback.</p>
          </div>
          {!uploadResult && <p className="empty-state">Use the quick uploader or the workspace to add new utility bills.</p>}
          {uploadResult && (
            <div className="upload-summary">
              <div className="upload-row">
                <span>File</span>
                <span>{uploadResult.filename}</span>
              </div>
              <div className="upload-row">
                <span>Status</span>
                <span className={`status-pill status-pill--${uploadResult.status || 'idle'}`}>
                  {uploadResult.status?.replace(/_/g, ' ') || 'idle'}
                </span>
              </div>
              {'inserted' in uploadResult && (
                <div className="upload-row">
                  <span>Inserted</span>
                  <span>{uploadResult.inserted}</span>
                </div>
              )}
              {'updated' in uploadResult && (
                <div className="upload-row">
                  <span>Updated</span>
                  <span>{uploadResult.updated}</span>
                </div>
              )}
              {uploadResult.error && <div className="error-banner">{uploadResult.error}</div>}
              {uploadResult.errors?.length > 0 && (
                <div className="validation-errors">
                  <h3>Validation issues</h3>
                  <ul>
                    {uploadResult.errors.map((issue, idx) => (
                      <li key={idx}>
                        Row {issue.row}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Cost Breakdown by Utility</h2>
          <p>Compare proportional spend across power, gas, and water services.</p>
        </div>
        <div className="breakdown-grid">
          {(metrics?.by_type || []).map((entry) => (
            <div key={entry.bill_type} className="breakdown-card">
              <header>
                <h3>{entry.bill_type}</h3>
                <span>{formatValueLabel(entry.total_cost)}</span>
              </header>
              <div className="progress">
                <div
                  className="progress-bar"
                  style={{
                    width: `${Math.min(100, (entry.total_cost / (totals.cost || 1)) * 100)}%`,
                  }}
                />
              </div>
              <p>{number.format(entry.total_consumption || 0)} units consumed</p>
            </div>
          ))}
          {(!metrics?.by_type || metrics.by_type.length === 0) && (
            <p className="empty-state">Upload billing data to unlock the utility breakdown.</p>
          )}
        </div>
      </section>

      <footer className="app-footer">
        <small>
          SustainSync keeps analytics, Prophet forecasting, and AI insights unified in one workspace. Upload fresh utility data anytime to refresh all panels instantly.
        </small>
      </footer>
    </div>
  )
}

export default Dashboard
