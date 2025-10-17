import { useMemo, useState } from 'react'
import '../App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const REQUIRED_FIELDS = ['bill_id', 'bill_type', 'bill_date', 'units_of_measure', 'consumption', 'cost']
const ALLOWED_TYPES = ['Power', 'Gas', 'Water']

// Minimal CSV parser that supports quoted fields and Windows/Mac line endings.
const parseCsv = (text) => {
  const rows = []
  let currentField = ''
  let currentRow = []
  let inQuotes = false

  const pushField = () => {
    currentRow.push(currentField)
    currentField = ''
  }

  const pushRow = () => {
    if (currentRow.length) {
      rows.push(currentRow)
    }
    currentRow = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      pushField()
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1
      }
      pushField()
      pushRow()
    } else {
      currentField += char
    }
  }

  pushField()
  pushRow()

  // Remove trailing empty rows
  while (rows.length && rows[rows.length - 1].every((value) => value === '')) {
    rows.pop()
  }

  const [headerRow = [], ...dataRows] = rows
  return { headers: headerRow, rows: dataRows }
}

const stringifyCsv = (headers, rows) => {
  const escapeCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  const headerLine = headers.map(escapeCell).join(',')
  const dataLines = rows.map((row) => headers.map((header) => escapeCell(row[header])).join(','))
  return [headerLine, ...dataLines].join('\n')
}

// Validate a set of rows and return structured issues for display.
const validateRows = (rows) => {
  const issues = []

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2 // account for header row in CSV template

    REQUIRED_FIELDS.forEach((field) => {
      if (row[field] === undefined || row[field] === null || String(row[field]).trim() === '') {
        issues.push({ row: rowNumber, message: `${field} is required` })
      }
    })

    if (row.bill_type && !ALLOWED_TYPES.includes(row.bill_type)) {
      issues.push({ row: rowNumber, message: `bill_type must be one of: ${ALLOWED_TYPES.join(', ')}` })
    }

    const numericFields = ['bill_id', 'consumption', 'cost']
    numericFields.forEach((field) => {
      const value = row[field]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        if (Number.isNaN(Number(value))) {
          issues.push({ row: rowNumber, message: `${field} must be numeric` })
        }
      }
    })
  })

  return issues
}

// Interactive workspace for reviewing and correcting CSV rows before upload.
function DataEntry() {
  const [headers, setHeaders] = useState(REQUIRED_FIELDS)
  const [rows, setRows] = useState([])
  const [issues, setIssues] = useState([])
  const [uploadState, setUploadState] = useState(null)
  const [fileName, setFileName] = useState('preview.csv')

  const handleTemplateDownload = () => {
    window.open(`${API_BASE}/api/bills/template/`, '_blank')
  }

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const { headers: parsedHeaders, rows: dataRows } = parseCsv(reader.result || '')
        const effectiveHeaders = parsedHeaders.length ? parsedHeaders : headers
        const sanitizedRows = dataRows
          .filter((row) => row.some((cell) => String(cell).trim() !== ''))
          .map((row) => {
            const record = {}
            effectiveHeaders.forEach((header, index) => {
              record[header] = row[index] ?? ''
            })
            return record
          })
        setHeaders(effectiveHeaders)
        setRows(sanitizedRows)
        setIssues(validateRows(sanitizedRows))
      } catch (error) {
        setRows([])
        setIssues([{ row: '-', message: `Parsing failed: ${error.message}` }])
      }
    }
    reader.onerror = () => {
      setRows([])
      setIssues([{ row: '-', message: 'Unable to read file' }])
    }
    reader.readAsText(file)
  }

  const handleCellChange = (rowIdx, field, value) => {
    setRows((prev) => {
      const next = prev.map((row, idx) => (idx === rowIdx ? { ...row, [field]: value } : row))
      setIssues(validateRows(next))
      return next
    })
  }

  const handleAddRow = () => {
    setRows((prev) => {
      const template = headers.reduce((acc, field) => ({ ...acc, [field]: '' }), {})
      const next = [...prev, template]
      setIssues(validateRows(next))
      return next
    })
  }

  const handleRemoveRow = (rowIdx) => {
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== rowIdx)
      setIssues(validateRows(next))
      return next
    })
  }

  const canSubmit = useMemo(() => rows.length > 0 && issues.length === 0, [rows, issues])

  const handleSubmit = async () => {
    const currentIssues = validateRows(rows)
    setIssues(currentIssues)
    if (currentIssues.length) return

    const csv = stringifyCsv(headers, rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const formData = new FormData()
    formData.append('file', blob, fileName || 'preview.csv')

    setUploadState({ status: 'uploading' })

    try {
      const response = await fetch(`${API_BASE}/api/bills/upload/`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Upload failed')
      setUploadState({ status: 'success', details: data })
    } catch (error) {
      setUploadState({ status: 'error', message: error.message })
    }
  }

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1>Data Entry Workspace</h1>
          <p>Preview, validate, and adjust your CSV data before committing it to SustainSync.</p>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={handleTemplateDownload}>
            Download Template
          </button>
          <label className="upload-control">
            <input type="file" accept=".csv" onChange={handleFileSelect} />
            <span>Load CSV</span>
          </label>
          <button className="primary" onClick={handleSubmit} disabled={!canSubmit}>
            Upload Verified Data
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Tabular Preview</h2>
          <p>Edit inline to fix typos, adjust bill types, or update consumption before upload.</p>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state">
            Load your completed template to start editing. The preview keeps all rows client-side until you submit.
          </div>
        ) : (
          <div className="table-scroller">
            <table className="data-table">
              <thead>
                <tr>
                  {headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                  <th className="data-table__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {headers.map((header) => (
                      <td key={header} data-label={header}>
                        <input
                          value={row[header] ?? ''}
                          onChange={(event) => handleCellChange(rowIdx, header, event.target.value)}
                        />
                      </td>
                    ))}
                    <td className="data-table__actions">
                      <button className="ghost" onClick={() => handleRemoveRow(rowIdx)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-toolbar">
          <button className="ghost" onClick={handleAddRow}>
            Add Empty Row
          </button>
          <span>{rows.length} rows loaded</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Validation</h2>
          <p>Resolve issues before upload to prevent re-processing or partial ingests.</p>
        </div>
        {issues.length === 0 ? (
          <div className="validation-ok">All required fields look good.</div>
        ) : (
          <ul className="validation-list">
            {issues.map((issue, idx) => (
              <li key={`${issue.row}-${idx}`}>
                Row {issue.row}: {issue.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {uploadState && (
        <section className="panel">
          <div className="panel-header">
            <h2>Upload Result</h2>
            <p>Review the API response after submitting your verified data.</p>
          </div>
          {uploadState.status === 'uploading' && <p>Uploading…</p>}
          {uploadState.status === 'error' && <div className="error-banner">{uploadState.message}</div>}
          {uploadState.status === 'success' && (
            <div className="upload-summary">
              <div className="upload-row">
                <span>Status</span>
                <span className="status-pill status-pill--success">Success</span>
              </div>
              <div className="upload-row">
                <span>Inserted</span>
                <span>{uploadState.details.inserted}</span>
              </div>
              <div className="upload-row">
                <span>Updated</span>
                <span>{uploadState.details.updated}</span>
              </div>
              {uploadState.details.errors?.length > 0 && (
                <div className="validation-errors">
                  <h3>API validation issues</h3>
                  <ul>
                    {uploadState.details.errors.map((issue, idx) => (
                      <li key={idx}>
                        Row {issue.row}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default DataEntry
