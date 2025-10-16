import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const number = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

function formatMonthLabel(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function formatValueLabel(value, isCurrency = true) {
  if (value === null || value === undefined) return '—'
  return isCurrency ? currency.format(value) : number.format(value)
}

function SimpleLineChart({ actual = [], forecast = [], height = 220 }) {
  const padding = 48
  const width = 720

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
    return padding + (index / (combined.length - 1)) * (width - padding * 2)
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
    <div className="chart-wrapper">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Chart">
        <defs>
          <linearGradient id="forecastGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(76, 132, 255, 0.4)" />
            <stop offset="100%" stopColor="rgba(76, 132, 255, 0)" />
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
          <text key={idx} x={padding - 12} y={y + 4} className="chart-tick">
            {formatValueLabel(value)}
          </text>
        ))}

        {combined.map((entry, idx) => {
          if (idx % labelStride !== 0) return null
          const x = xForIndex(entry.index)
          return (
            <text key={`label-${idx}`} x={x} y={height - padding * 0.1} className="chart-label">
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

function RecommendationBlock({ text }) {
  if (!text) return <p className="empty-state">Recommendations will appear here once data is available.</p>

  const bullets = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <ul className="recommendations">
      {bullets.map((line, idx) => (
        <li key={idx}>{line.replace(/^•\s*/, '')}</li>
      ))}
    </ul>
  )
}

function useAsyncState(initialValue) {
  const [state, setState] = useState(initialValue)
  const update = (patch) => setState((prev) => ({ ...prev, ...patch }))
  return [state, update]
}

function App() {
  const [metrics, setMetrics] = useState(null)
  const [monthlySeries, setMonthlySeries] = useState([])
  const [forecastData, setForecastData] = useState(null)
  const [recommendations, setRecommendations] = useState('')
  const [recommendationWarning, setRecommendationWarning] = useState('')
  const [uploadResult, setUploadResult] = useState(null)
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
    const actual = (forecastData.history || []).map((item) => ({
      label: formatMonthLabel(item.date),
      value: item.value,
    }))
    const forecast = (forecastData.series || []).map((item) => ({
      label: formatMonthLabel(item.date),
      value: item.yhat,
    }))
    return { actual, forecast }
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

      // Refresh dashboard data after a successful upload
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>SustainSync Insight Center</h1>
          <p>Track utility performance, forecast costs with Prophet, and surface AI-powered sustainability actions.</p>
        </div>
        <div className="header-actions">
          <button className="primary" onClick={() => window.open(`${API_BASE}/api/bills/template/`, '_blank')}>
            Download CSV Template
          </button>
          <label className="upload-control">
            <input type="file" accept=".csv" onChange={handleFileUpload} />
            <span>Upload Completed Template</span>
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
            {loading.metrics || !totals.last_updated
              ? 'Loading…'
              : formatMonthLabel(totals.last_updated)}
          </span>
          <span className="metric-subtitle">Automatically refreshed after each upload</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Monthly Spend Trends</h2>
          <p>Visualize how actual utility costs evolve month over month.</p>
        </div>
        <SimpleLineChart actual={monthlyCostSeries} forecast={[]} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>12-Month Prophet Forecast</h2>
          <p>Prophet projects the next year of spend based on historical patterns. Forecasts fall back to linear trends if Prophet is unavailable.</p>
        </div>
        {forecastData?.error ? (
          <div className="error-banner">{forecastData.error}</div>
        ) : (
          <SimpleLineChart actual={actualForecastSeries.actual} forecast={actualForecastSeries.forecast} />
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
          {loading.recommendations ? <p>Loading recommendations…</p> : <RecommendationBlock text={recommendations} />}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Upload Status &amp; Validation</h2>
            <p>Track the latest CSV ingestion with detailed validation feedback.</p>
          </div>
          {!uploadResult && <p className="empty-state">Use the uploader above to add new utility bills.</p>}
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

export default App
