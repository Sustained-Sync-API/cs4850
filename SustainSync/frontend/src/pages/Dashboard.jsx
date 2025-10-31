import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Stack,
  Alert,
  Paper,
  Tabs,
  Tab,
  Chip,
  CircularProgress,
  Divider
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import DownloadIcon from '@mui/icons-material/Download'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import BoltIcon from '@mui/icons-material/Bolt'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import ReceiptIcon from '@mui/icons-material/Receipt'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt'
import InsightsIcon from '@mui/icons-material/Insights'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// Formatters
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const number = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const formatMonthLabel = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const formatValueLabel = (value, isCurrency = true) => {
  if (value === null || value === undefined) return '—'
  return isCurrency ? currency.format(value) : number.format(value)
}

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

// Simple line chart component
function SimpleLineChart({ actual = [], forecast = [], height = 220 }) {
  const padding = 36
  const width = 550

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
}// Visualise multiple utilities together with brand-coloured series.
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
  if (!text) return (
    <Alert severity="info">
      Insights will appear once data is available.
    </Alert>
  )

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
      <Stack spacing={2}>
        {items.map((item) => {
          if (item.type === 'heading') {
            return (
              <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                <TrendingUpIcon sx={{ color: 'warning.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {item.text}
                </Typography>
              </Box>
            )
          }
          
          return (
            <Box key={item.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1.25rem', mt: 0.25, flexShrink: 0 }} />
              <Typography variant="body1">
                {item.text}
              </Typography>
            </Box>
          )
        })}
      </Stack>
    )
  }

  return (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', pl: 0 }}>
      {lines.map((line, idx) => (
        <Box key={idx} component="li" sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1.25rem', mt: 0.25, flexShrink: 0 }} />
          <Typography variant="body1">
            {line.replace(/^[•\-*]\s*/, '').replace(/^\d+[\.)]\s*/, '')}
          </Typography>
        </Box>
      ))}
    </Stack>
  )
}

// Tab navigation component for switching between utilities
function TabPanel({ tabs = [], activeTab, onTabChange }) {
  const activeIndex = tabs.findIndex(tab => tab.key === activeTab)
  
  return (
    <Paper elevation={0} sx={{ borderRadius: 2, bgcolor: 'grey.50', p: 0.5 }}>
      <Tabs 
        value={activeIndex >= 0 ? activeIndex : 0} 
        onChange={(_, newValue) => onTabChange(tabs[newValue]?.key)}
        variant="scrollable"
        scrollButtons="auto"
        TabIndicatorProps={{
          style: { height: 3 }
        }}
        sx={{
          '& .MuiTab-root': {
            minHeight: 48,
            textTransform: 'none',
            fontSize: '0.95rem',
            fontWeight: 500,
            borderRadius: 1.5,
            mx: 0.25,
            '&.Mui-selected': {
              bgcolor: 'background.paper',
              color: 'primary.main',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }
          }
        }}
      >
        {tabs.map((tab) => (
          <Tab key={tab.key} label={tab.label} />
        ))}
      </Tabs>
    </Paper>
  )
}

function Dashboard() {
  const [metrics, setMetrics] = useState(null)
  const [forecastData, setForecastData] = useState(null)
  const [recommendations, setRecommendations] = useState('')
  const [uploadResult, setUploadResult] = useState(null)
  const [activeUtilityTab, setActiveUtilityTab] = useState('all')
  const [loading, setLoading] = useState({
    metrics: true,
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
      setLoading(prev => ({ ...prev, metrics: false }))
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
      setLoading(prev => ({ ...prev, forecast: false }))
    }
  }

  const fetchRecommendations = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/recommendations/`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load recommendations')
      setRecommendations(data.recommendations || '')
    } catch (error) {
      setRecommendations('')
    } finally {
      setLoading(prev => ({ ...prev, recommendations: false }))
    }
  }

  useEffect(() => {
    fetchMetrics()
    fetchForecast()
    fetchRecommendations()
  }, [])

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
        setLoading({ metrics: true, forecast: true, recommendations: true })
        fetchMetrics()
        fetchForecast()
        fetchRecommendations()
      }
    } catch (error) {
      setUploadResult({ status: 'error', error: error.message, filename: file.name })
    } finally {
      event.target.value = ''
    }
  }

  const handleDownloadCSV = () => {
    window.open(`${API_BASE}/api/bills/template/`, '_blank')
  }

  const totals = metrics?.totals || {}
  const byType = metrics?.by_type || []

  // Get average monthly cost by bill type
  const getAverageMonthlyCost = (billType) => {
    const typeData = byType.find(t => t.bill_type === billType)
    if (!typeData) return 0
    // This is simplified - in reality you'd want to calculate from monthly data
    return typeData.total_cost
  }

  // Get utility tabs
  const utilityTabs = useMemo(() => {
    const tabs = [
      { key: 'all', label: 'All Utilities', icon: <BoltIcon /> }
    ]
    
    if (forecastData?.breakdown) {
      forecastData.breakdown.forEach(item => {
        const icon = item.bill_type === 'Power' ? <ElectricBoltIcon /> :
                     item.bill_type === 'Gas' ? <LocalFireDepartmentIcon /> :
                     <WaterDropIcon />
        tabs.push({
          key: item.bill_type.toLowerCase(),
          label: item.bill_type,
          icon
        })
      })
    }
    
    return tabs
  }, [forecastData])

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h3" sx={{ mb: 1, fontWeight: 700 }}>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Track your utility consumption, costs, and sustainability insights
          </Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadCSV}
          >
            Download CSV
          </Button>
          <Button
            variant="contained"
            component="label"
            startIcon={<CloudUploadIcon />}
          >
            Quick Upload
            <input type="file" accept=".csv" onChange={handleFileUpload} hidden />
          </Button>
        </Stack>
      </Box>

      {/* Top Metrics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AttachMoneyIcon color="primary" />
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Total Spend
                  </Typography>
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {loading.metrics ? <CircularProgress size={24} /> : formatValueLabel(totals.cost || 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All utilities combined
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BoltIcon color="primary" />
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Total Consumption
                  </Typography>
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {loading.metrics ? <CircularProgress size={24} /> : `${number.format(totals.consumption || 0)} units`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Energy and water
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUpIcon color="primary" />
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Average Monthly Cost
                  </Typography>
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {loading.metrics ? <CircularProgress size={24} /> : formatValueLabel(totals.average_bill || 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Per bill statement
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CalendarTodayIcon color="primary" />
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Latest Statement
                  </Typography>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, py: 0.75 }}>
                  {loading.metrics || !totals.last_updated ? <CircularProgress size={24} /> : formatMonthLabel(totals.last_updated)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Most recent billing
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Average Monthly Cost by Bill Type */}
      {byType.length > 0 && (
        <Card elevation={2} sx={{ mb: 4 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
              <ReceiptIcon color="primary" />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Average Monthly Cost by Bill Type
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {byType.map((item) => (
                <Grid item xs={12} md={4} key={item.bill_type}>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 2.5, 
                      border: '1px solid', 
                      borderColor: 'divider',
                      borderRadius: 2,
                      transition: 'all 0.2s',
                      '&:hover': {
                        boxShadow: 2,
                        borderColor: 'primary.main',
                      }
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {item.bill_type === 'Power' && <ElectricBoltIcon color="primary" />}
                        {item.bill_type === 'Gas' && <LocalFireDepartmentIcon color="warning" />}
                        {item.bill_type === 'Water' && <WaterDropIcon color="info" />}
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {item.bill_type}
                        </Typography>
                      </Box>
                      <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>
                        {formatValueLabel(item.total_cost)}
                      </Typography>
                      <Divider />
                      <Typography variant="body2" color="text.secondary">
                        {number.format(item.total_consumption || 0)} units consumed
                      </Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* 12-Month Prophet Forecast */}
      <Card elevation={2} sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
              12-Month Prophet Forecast
            </Typography>
            <Typography variant="body2" color="text.secondary">
              View forecasts for all utilities or select a specific type
            </Typography>
          </Box>

          {forecastData?.error ? (
            <Alert severity="error">{forecastData.error}</Alert>
          ) : (
            <>
              <TabPanel
                tabs={utilityTabs}
                activeTab={activeUtilityTab}
                onTabChange={setActiveUtilityTab}
              />

              <Box sx={{ mt: 3 }}>
                {activeUtilityTab === 'all' ? (
                  // All utilities view
                  <Box>
                    {forecastData?.history && forecastData?.series && (
                      <Box sx={{ 
                        bgcolor: 'grey.50', 
                        borderRadius: 2, 
                        p: 3,
                        mb: 3
                      }}>
                        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                          Total Forecast
                        </Typography>
                        <SimpleLineChart
                          actual={mapHistoryToSeries(forecastData.history || [])}
                          forecast={mapForecastToSeries(forecastData.series || [])}
                          height={240}
                        />
                      </Box>
                    )}

                    <Grid container spacing={3}>
                      {(forecastData?.breakdown || []).map((utilityData) => {
                        if (utilityData.error) {
                          return (
                            <Grid item xs={12} md={6} lg={4} key={utilityData.bill_type}>
                              <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="h6" sx={{ mb: 1 }}>
                                  {utilityData.bill_type}
                                </Typography>
                                <Alert severity="info">{utilityData.error}</Alert>
                              </Paper>
                            </Grid>
                          )
                        }

                        return (
                          <Grid item xs={12} md={6} lg={4} key={utilityData.bill_type}>
                            <Paper 
                              elevation={0} 
                              sx={{ 
                                p: 2.5, 
                                border: '1px solid', 
                                borderColor: 'divider',
                                height: '100%',
                                transition: 'all 0.2s',
                                '&:hover': {
                                  boxShadow: 3,
                                  borderColor: 'primary.main',
                                }
                              }}
                            >
                              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                                {utilityData.bill_type}
                              </Typography>
                              <SimpleLineChart
                                actual={mapHistoryToSeries(utilityData.history || [])}
                                forecast={mapForecastToSeries(utilityData.series || [])}
                                height={180}
                              />
                            </Paper>
                          </Grid>
                        )
                      })}
                    </Grid>
                  </Box>
                ) : (
                  // Individual utility view
                  (() => {
                    const utilityData = (forecastData?.breakdown || []).find(
                      (entry) => entry.bill_type.toLowerCase() === activeUtilityTab
                    )
                    
                    if (!utilityData) return (
                      <Alert severity="info">
                        No data available for this utility.
                      </Alert>
                    )

                    if (utilityData.error) return (
                      <Alert severity="info">
                        {utilityData.error}
                      </Alert>
                    )

                    return (
                      <Box>
                        <Box sx={{ 
                          bgcolor: 'grey.50', 
                          borderRadius: 2, 
                          p: 3,
                          mb: 3
                        }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                            <Box>
                              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                {utilityData.bill_type} Forecast
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {utilityData.model ? `Model: ${utilityData.model}` : 'Model unavailable'}
                              </Typography>
                            </Box>
                            {utilityData.warning && (
                              <Chip 
                                label={utilityData.warning} 
                                color="warning" 
                                size="small" 
                              />
                            )}
                          </Box>
                          <SimpleLineChart
                            actual={mapHistoryToSeries(utilityData.history || [])}
                            forecast={mapForecastToSeries(utilityData.series || [])}
                            height={260}
                          />
                        </Box>
                      </Box>
                    )
                  })()
                )}
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* AI Recommendations */}
      <Card elevation={2} sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <InsightsIcon color="primary" />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              AI-Powered Sustainability Recommendations
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Based on your consumption patterns and forecast data
          </Typography>
          
          {loading.recommendations ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3, 
                bgcolor: 'grey.50',
                borderRadius: 2
              }}
            >
              <BulletList text={recommendations} enhanced={true} />
            </Paper>
          )}
        </CardContent>
      </Card>

      {/* Upload Status (if there's an upload) */}
      {uploadResult && (
        <Card elevation={2}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Upload Status
            </Typography>
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">File</Typography>
                    <Typography variant="body2">{uploadResult.filename}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Status</Typography>
                    <Chip 
                      label={uploadResult.status?.replace(/_/g, ' ') || 'idle'} 
                      color={
                        uploadResult.status === 'success' ? 'success' :
                        uploadResult.status === 'error' ? 'error' :
                        uploadResult.status === 'uploading' ? 'warning' :
                        'default'
                      }
                      size="small"
                    />
                  </Box>
                  {'inserted' in uploadResult && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">Inserted</Typography>
                      <Typography variant="body2">{uploadResult.inserted}</Typography>
                    </Box>
                  )}
                  {'updated' in uploadResult && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">Updated</Typography>
                      <Typography variant="body2">{uploadResult.updated}</Typography>
                    </Box>
                  )}
                </Stack>
              </Paper>
              
              {uploadResult.error && (
                <Alert severity="error">{uploadResult.error}</Alert>
              )}
              
              {uploadResult.errors?.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Validation issues
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, maxHeight: 200, overflow: 'auto' }}>
                    <Stack spacing={0.5} component="ul" sx={{ listStyle: 'none', pl: 0, m: 0 }}>
                      {uploadResult.errors.map((issue, idx) => (
                        <Typography key={idx} variant="body2" component="li">
                          Row {issue.row}: {issue.message}
                        </Typography>
                      ))}
                    </Stack>
                  </Paper>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}

export default Dashboard
