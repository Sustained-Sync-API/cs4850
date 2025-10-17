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

const formatValueLabel = (value, isCurrency = true) => {
  if (value === null || value === undefined) return '—'
  return isCurrency ? currency.format(value) : number.format(value)
}

// Convert API history entries into the structure used by charts.
const mapHistoryToSeries = (history = []) =>
  history.map((item) => ({
    label: formatMonthLabel(item.date),
    date: item.date,
    value: item.value ?? 0,
  }))

const mapForecastToSeries = (series = []) =>
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
function SimpleLineChart({ actual = [], forecast = [], height = 220, responsive = false }) {
  const padding = 36
  const width = responsive ? 550 : 480

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

// Visualise multiple utilities together with brand-coloured series.
function MultiSeriesForecastChart({ datasets = [], timeline = [], height = 260 }) {
  if (!datasets.length || !timeline.length) {
    return <div className="chart-empty">Forecast will appear once at least one utility has history.</div>
  }

  const padding = 40
  const width = 550

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
    return padding + (index / (orderedTimeline.length - 1)) * (width - padding * 2)
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

        {orderedTimeline.map((entry, idx) => {
          if (idx % labelStride !== 0) return null
          const x = xForIndex(idx)
          return (
            <text key={entry.date} x={x} y={height - padding * 0.1} className="chart-label">
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
    if (actualForecastSeries.actual.length || actualForecastSeries.forecast.length) {
      datasets.push({ key: 'total', label: 'Total', actual: actualForecastSeries.actual, forecast: actualForecastSeries.forecast })
    }

    const breakdown = (forecastData.breakdown || []).filter((entry) => !entry.error)
    breakdown.forEach((entry) => {
      const key = entry.bill_type.toLowerCase()
      datasets.push({
        key,
        label: entry.bill_type,
        actual: mapHistoryToSeries(entry.history || []),
        forecast: mapForecastToSeries(entry.series || []),
      })
    })

    return datasets
  }, [forecastData, actualForecastSeries])

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
          <h2>Monthly Spend Trends</h2>
          <p>Visualize how actual utility costs evolve month over month.</p>
        </div>
        <SimpleLineChart actual={monthlyCostSeries} forecast={[]} />
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
                    datasets={multiSeriesDatasets.filter(ds => ds.key !== 'total')} 
                    timeline={forecastTimeline} 
                    height={240}
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

                return (
                  <div className="tab-content">
                    <div className="utility-header">
                      <div>
                        <h3>{utilityData.bill_type}</h3>
                        <span className="forecast-model">
                          {utilityData.model ? `Model: ${utilityData.model}` : 'Model unavailable'}
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
