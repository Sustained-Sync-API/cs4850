import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  Pagination,
  Divider,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { EditOutlined } from '@mui/icons-material'
import '../App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const UTILITY_OPTIONS = ['Power', 'Gas', 'Water']
const PAGE_SIZE_OPTIONS = [20, 50, 100]
const DEFAULT_PAGE_SIZE = 20
const UNITS_OPTIONS = ['kWh', 'therms', 'CCF']

const TABLE_COLUMNS = [
  { key: 'bill_date', label: 'Bill Date', sortType: 'date', minWidth: 140, defaultDirection: 'desc' },
  { key: 'service_period', label: 'Service Period', sortType: 'date', minWidth: 200, defaultDirection: 'desc' },
  { key: 'consumption', label: 'Consumption', sortType: 'number', minWidth: 150, defaultDirection: 'desc' },
  { key: 'cost', label: 'Cost', sortType: 'number', minWidth: 120, defaultDirection: 'desc' },
  { key: 'provider', label: 'Provider', sortType: 'string', minWidth: 180, defaultDirection: 'asc' },
  { key: 'location', label: 'Location', sortType: 'string', minWidth: 200, defaultDirection: 'asc' },
  { key: 'timestamp_upload', label: 'Uploaded', sortType: 'date', minWidth: 160, defaultDirection: 'desc' },
]

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const number = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const parseDateValue = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? null : time
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const isoDateMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  const date = isoDateMatch ? new Date(`${trimmed}T00:00:00Z`) : new Date(trimmed)
  const time = date.getTime()
  return Number.isNaN(time) ? null : time
}

const formatMonthYear = (value) => {
  const time = parseDateValue(value)
  if (time === null) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(time))
}

const formatFullDate = (value) => {
  const time = parseDateValue(value)
  if (time === null) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time))
}

const toInputValue = (value) => {
  if (value === null || value === undefined) return ''
  return `${value}`
}

function Tables() {
  const theme = useTheme()
  const isSmDown = useMediaQuery(theme.breakpoints.down('sm'))

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
  const [sortConfig, setSortConfig] = useState({ key: 'bill_date', direction: 'desc' })

  const sortKey = sortConfig?.key ?? 'bill_date'
  const sortDirection = sortConfig?.direction ?? 'desc'

  const collator = useMemo(() => new Intl.Collator('en', { sensitivity: 'base', numeric: false }), [])

  useEffect(() => {
    setPage(1)
  }, [utility])

  useEffect(() => {
    setEditingId(null)
    setFormState({})
    setSaveError('')
  }, [utility, page, pageSize, sortKey, sortDirection])

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
      if (sortKey) {
        params.set('sort_by', sortKey)
      }
      if (sortDirection) {
        params.set('sort_direction', sortDirection)
      }
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
  }, [utility, page, pageSize, sortKey, sortDirection])

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

  const updateFormField = (name, value) => {
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const startEdit = (row) => {
    setEditingId(row.bill_id)
    setFormState({
      bill_type: row.bill_type || utility,
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
      timestamp_upload: row.timestamp_upload || '',
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
    updateFormField(name, value)
  }

  const handleSave = async () => {
    if (!editingId) return
    setSaving(true)
    setSaveError('')
    setStatusMessage('')

    const payload = {}
    for (const [key, value] of Object.entries(formState)) {
      if (key === 'timestamp_upload') {
        continue
      }
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

  const getDateSortValue = (row, key) => {
    switch (key) {
      case 'bill_date':
        return parseDateValue(row.bill_date)
      case 'service_period': {
        const primary = parseDateValue(row.service_start) ?? parseDateValue(row.service_end)
        return primary ?? parseDateValue(row.bill_date)
      }
      case 'timestamp_upload':
        return parseDateValue(row.timestamp_upload)
      default:
        return null
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortConfig) return rows
    const column = TABLE_COLUMNS.find((entry) => entry.key === sortConfig.key)
    if (!column) return rows
    const direction = sortConfig.direction === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (column.sortType === 'number') {
        const numberA = Number(a[column.key])
        const numberB = Number(b[column.key])
        const hasNumberA = Number.isFinite(numberA)
        const hasNumberB = Number.isFinite(numberB)
        if (!hasNumberA && !hasNumberB) return 0
        if (!hasNumberA) return 1
        if (!hasNumberB) return -1
        if (numberA === numberB) return 0
        return (numberA - numberB) * direction
      }

      if (column.sortType === 'date') {
        const timeA = getDateSortValue(a, column.key)
        const timeB = getDateSortValue(b, column.key)

        if (timeA === null && timeB === null) return 0
        if (timeA === null) return 1
        if (timeB === null) return -1

        if (timeA === timeB && column.key === 'service_period') {
          const endA = parseDateValue(a.service_end)
          const endB = parseDateValue(b.service_end)
          if (endA !== endB) {
            if (endA === null) return 1
            if (endB === null) return -1
            return (endA - endB) * direction
          }
        }

        if (timeA === timeB) return 0
        return (timeA - timeB) * direction
      }

      const textA = String(
        column.key === 'location'
          ? [a.city, a.state, a.zip].filter(Boolean).join(' ')
          : a[column.key] ?? ''
      ).trim()
      const textB = String(
        column.key === 'location'
          ? [b.city, b.state, b.zip].filter(Boolean).join(' ')
          : b[column.key] ?? ''
      ).trim()
      const comparison = collator.compare(textA, textB)
      return comparison * direction
    })
  }, [rows, sortConfig, collator])

  const handleSort = (columnKey) => {
    const column = TABLE_COLUMNS.find((entry) => entry.key === columnKey)
    if (!column) return
    setSortConfig((current) => {
      if (current?.key === columnKey) {
        const nextDirection = current.direction === 'asc' ? 'desc' : 'asc'
        return { key: columnKey, direction: nextDirection }
      }
      return {
        key: columnKey,
        direction: column.defaultDirection ?? 'asc',
      }
    })
    setPage(1)
  }

  const recordsStart = rows.length > 0 ? (page - 1) * pageSize + 1 : 0
  const recordsEnd = rows.length > 0 ? (page - 1) * pageSize + rows.length : 0

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 3,
        }}
      >
        <Box>
          <Typography variant="h3" sx={{ color: 'text.primary' }}>
            Utility Tables
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560 }}>
            Explore detailed billing history by utility type. Switch between power, gas, and water records and drill
            into costs, usage, upload dates, and providers in one place.
          </Typography>
        </Box>
        <ToggleButtonGroup
          exclusive
          size={isSmDown ? 'small' : 'medium'}
          value={utility}
          onChange={(_, value) => {
            if (value) setUtility(value)
          }}
          sx={{
            backgroundColor: 'background.paper',
            borderRadius: 2,
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.12)',
          }}
        >
          {UTILITY_OPTIONS.map((option) => (
            <ToggleButton
              key={option}
              value={option}
              sx={{
                px: 3,
                fontWeight: 600,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                },
              }}
            >
              {option}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', gap: 2 }}>
              <Box>
                <Typography variant="h4">{utility} Billing Records</Typography>
                <Typography variant="body2" color="text.secondary">
                  Showing {pageSize} records per page. Use the column headers to sort and click edit to update a bill in
                  a focused dialog.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  color="primary"
                  variant="outlined"
                  label={`Total: ${totalCount.toLocaleString('en-US')}`}
                  sx={{ bgcolor: 'primary.light', borderColor: 'transparent', color: 'primary.contrastText' }}
                />
                <Chip
                  color="secondary"
                  variant="outlined"
                  label={`Visible: ${rows.length.toLocaleString('en-US')}`}
                  sx={{ bgcolor: 'secondary.light', borderColor: 'transparent', color: 'secondary.contrastText' }}
                />
                <Chip
                  variant="outlined"
                  label={`Cost: ${currency.format(totals.cost)}`}
                  sx={{ borderRadius: 2 }}
                />
                <Chip
                  variant="outlined"
                  label={`Consumption: ${number.format(totals.consumption)}`}
                  sx={{ borderRadius: 2 }}
                />
              </Stack>
            </Box>
            {loading && <LinearProgress color="primary" />}
          </Stack>
        </Box>

        <Box sx={{ px: { xs: 1.5, md: 3 }, py: 3 }}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {statusMessage && !error && <Alert severity="success">{statusMessage}</Alert>}
            {saveError && !error && <Alert severity="warning">{saveError}</Alert>}

            {!error && rows.length === 0 && !loading && (
              <Paper
                variant="outlined"
                sx={{
                  py: 8,
                  px: 4,
                  textAlign: 'center',
                  borderRadius: 3,
                  borderStyle: 'dashed',
                  color: 'text.secondary',
                }}
              >
                <Typography variant="h5" gutterBottom>
                  No records yet
                </Typography>
                <Typography variant="body2">
                  Upload {utility.toLowerCase()} bills to populate this table and start analyzing trends.
                </Typography>
              </Paper>
            )}

            {!error && rows.length > 0 && (
              <TableContainer
                sx={{
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  backgroundColor: 'background.paper',
                  maxHeight: '60vh',
                }}
              >
                <Table stickyHeader aria-label="utility billing records">
                  <TableHead>
                    <TableRow>
                      {TABLE_COLUMNS.map((column) => (
                        <TableCell key={column.key} sortDirection={sortConfig.key === column.key ? sortConfig.direction : false} sx={{ minWidth: column.minWidth }}>
                          <TableSortLabel
                            active={sortConfig.key === column.key}
                            direction={sortConfig.key === column.key ? sortConfig.direction : 'asc'}
                            onClick={() => handleSort(column.key)}
                          >
                            {column.label}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                      <TableCell align="center" sx={{ minWidth: 120 }}>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedRows.map((row) => (
                      <TableRow key={row.bill_id} hover>
                        <TableCell>{formatMonthYear(row.bill_date)}</TableCell>
                        <TableCell>
                          {row.service_start || row.service_end ? (
                            <Typography variant="body2" color="text.primary">
                              {(() => {
                                const startLabel = formatFullDate(row.service_start)
                                const endLabel = formatFullDate(row.service_end)
                                const parts = [startLabel, endLabel].filter((label) => label !== '—')
                                if (parts.length === 2) return `${parts[0]} – ${parts[1]}`
                                if (parts.length === 1) return parts[0]
                                return '—'
                              })()}
                            </Typography>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="text.primary">
                              {number.format(row.consumption ?? 0)}
                            </Typography>
                            {row.units_of_measure ? (
                              <Chip
                                size="small"
                                label={row.units_of_measure}
                                color="secondary"
                                variant="outlined"
                                sx={{ bgcolor: 'secondary.light', borderColor: 'transparent', color: 'secondary.contrastText' }}
                              />
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell>{currency.format(row.cost ?? 0)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.primary" fontWeight={500}>
                            {row.provider || '—'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.bill_type}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {row.city || row.state || row.zip ? (
                            <Typography variant="body2" color="text.primary">
                              {[row.city, row.state].filter(Boolean).join(', ')} {row.zip ? ` ${row.zip}` : ''}
                            </Typography>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>{formatFullDate(row.timestamp_upload)}</TableCell>
                        <TableCell align="center">
                          <Tooltip title="Edit bill">
                            <IconButton color="primary" onClick={() => startEdit(row)}>
                              <EditOutlined />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {rows.length > 0 && (
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', md: 'center' }}
                justifyContent="space-between"
              >
                <Typography variant="body2" color="text.secondary">
                  Showing {recordsStart.toLocaleString('en-US')} - {recordsEnd.toLocaleString('en-US')} of{' '}
                  {totalCount.toLocaleString('en-US')} records
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id="rows-per-page-label">Rows per page</InputLabel>
                    <Select
                      labelId="rows-per-page-label"
                      label="Rows per page"
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value))
                        setPage(1)
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Pagination
                    color="primary"
                    shape="rounded"
                    page={page}
                    count={totalPages}
                    onChange={(_, value) => setPage(value)}
                  />
                </Stack>
              </Stack>
            )}
          </Stack>
        </Box>
      </Paper>

      <Dialog
        open={Boolean(editingId)}
        onClose={cancelEdit}
        fullWidth
        maxWidth="sm"
        aria-labelledby="edit-bill-dialog-title"
      >
        <DialogTitle id="edit-bill-dialog-title">Edit bill details</DialogTitle>
        <DialogContent dividers sx={{ maxHeight: { xs: '70vh', md: '65vh' }, overflowY: 'auto' }}>
          <Stack spacing={3}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="bill-type-label">Utility</InputLabel>
                <Select
                  labelId="bill-type-label"
                  value={formState.bill_type ?? utility}
                  label="Utility"
                  onChange={(event) => updateFormField('bill_type', event.target.value)}
                >
                  {UTILITY_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Provider"
                name="provider"
                value={formState.provider ?? ''}
                onChange={handleFieldChange}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Bill Date"
                type="date"
                name="bill_date"
                value={formState.bill_date ?? ''}
                onChange={handleFieldChange}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                label="Uploaded"
                value={formatFullDate(formState.timestamp_upload)}
                InputProps={{ readOnly: true }}
                disabled
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Service Start"
                type="date"
                name="service_start"
                value={formState.service_start ?? ''}
                onChange={handleFieldChange}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                label="Service End"
                type="date"
                name="service_end"
                value={formState.service_end ?? ''}
                onChange={handleFieldChange}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>

            <Divider flexItem />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Consumption"
                type="number"
                name="consumption"
                value={formState.consumption ?? ''}
                onChange={handleFieldChange}
                inputProps={{ step: '0.01', min: 0 }}
              />
              <FormControl fullWidth>
                <InputLabel id="units-label">Units</InputLabel>
                <Select
                  labelId="units-label"
                  value={formState.units_of_measure ?? ''}
                  label="Units"
                  onChange={(event) => updateFormField('units_of_measure', event.target.value)}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {UNITS_OPTIONS.map((unit) => (
                    <MenuItem key={unit} value={unit}>
                      {unit}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <TextField
              fullWidth
              label="Cost"
              type="number"
              name="cost"
              value={formState.cost ?? ''}
              onChange={handleFieldChange}
              inputProps={{ step: '0.01', min: 0 }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="City"
                name="city"
                value={formState.city ?? ''}
                onChange={handleFieldChange}
              />
              <TextField
                fullWidth
                label="State"
                name="state"
                value={formState.state ?? ''}
                onChange={handleFieldChange}
                inputProps={{ maxLength: 8, style: { textTransform: 'uppercase' } }}
              />
              <TextField
                fullWidth
                label="ZIP"
                name="zip"
                value={formState.zip ?? ''}
                onChange={handleFieldChange}
              />
            </Stack>

            {saveError && (
              <Alert severity="error">{saveError}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={cancelEdit} color="inherit" disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}>
            {saving ? 'Saving' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Tables
