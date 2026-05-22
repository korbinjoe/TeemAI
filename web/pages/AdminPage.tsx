import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, ChevronLeft, ChevronRight, Table2, X, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { authFetch } from '@/config/api'

interface Column {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface TableData {
  tableName: string
  columns: Column[]
  rows: Record<string, unknown>[]
  pagination: Pagination
}

const API_BASE = '/api/admin'

const AdminPage = () => {
  const { t } = useTranslation('common')
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableData, setTableData] = useState<TableData | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [expandedCell, setExpandedCell] = useState<{ colName: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    authFetch(`${API_BASE}/tables`)
      .then((r) => r.json())
      .then((d) => {
        setTables(d.tables)
        if (d.tables.length > 0 && !selectedTable) {
          setSelectedTable(d.tables[0])
        }
      })
      .catch(console.error)
  }, [])

  const fetchTableData = useCallback(async (tableName: string, p: number) => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/tables/${tableName}?page=${p}&pageSize=50`)
      const data = await res.json()
      setTableData(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTable) {
      fetchTableData(selectedTable, page)
    }
  }, [selectedTable, page, fetchTableData])

  const handleSelectTable = (name: string) => {
    setSelectedTable(name)
    setPage(1)
  }

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  const truncate = (str: string, max: number) =>
    str.length > max ? str.slice(0, max) + '…' : str

  const prettyPrint = (str: string): string => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2)
    } catch {
      return str
    }
  }

  const handleCellClick = (colName: string, value: string) => {
    if (value === 'NULL' || value.length <= 100) return
    setExpandedCell({ colName, value })
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!expandedCell) return
    await navigator.clipboard.writeText(expandedCell.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center border-b border-border-subtle px-4">
        <Database size={14} className="text-text-secondary mr-1.5" />
        <span className="text-xs font-semibold text-text-primary">{t('admin.title')}</span>
        {tableData && (
          <span className="ml-2 text-xs text-text-tertiary">
            {tableData.tableName} · {t('admin.rows', { count: tableData.pagination.total })}
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 shrink-0 border-r border-border-subtle overflow-y-auto bg-bg-secondary">
          <div className="px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">
            {t('admin.tables')} ({tables.length})
          </div>
          {tables.map((name) => (
            <button
              key={name}
              onClick={() => handleSelectTable(name)}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                selectedTable === name
                  ? 'bg-bg-hover text-text-emphasis font-medium'
                  : 'text-text-secondary hover:bg-bg-hover-muted hover:text-text-primary',
              )}
            >
              <Table2 size={12} className="shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {!tableData ? (
            <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
              {t('admin.selectTable')}
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-border-subtle px-4 py-2 flex items-center gap-4 flex-wrap">
                {tableData.columns.map((col) => (
                  <span key={col.name} className="text-xs text-text-tertiary whitespace-nowrap">
                    <span className={cn('font-medium', col.pk ? 'text-amber-500' : 'text-text-secondary')}>
                      {col.name}
                    </span>
                    <span className="ml-1 opacity-60">{col.type || 'TEXT'}</span>
                    {col.pk ? <span className="ml-1 text-amber-500">PK</span> : null}
                    {col.notnull ? <span className="ml-1 opacity-40">NN</span> : null}
                  </span>
                ))}
              </div>

              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">
                    {t('action.loading')}
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-bg-secondary z-10">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium text-text-tertiary border-b border-border-subtle w-8">
                          #
                        </th>
                        {tableData.columns.map((col) => (
                          <th
                            key={col.name}
                            className="px-3 py-1.5 text-left font-medium text-text-tertiary border-b border-border-subtle whitespace-nowrap"
                          >
                            {col.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border-subtle hover:bg-bg-hover-muted transition-colors"
                        >
                          <td className="px-3 py-1 text-text-tertiary">
                            {(tableData.pagination.page - 1) * tableData.pagination.pageSize + i + 1}
                          </td>
                          {tableData.columns.map((col) => {
                            const raw = formatCellValue(row[col.name])
                            const isNull = raw === 'NULL'
                            const isLong = raw.length > 100
                            return (
                              <td
                                key={col.name}
                                className={cn(
                                  'px-3 py-1 max-w-[300px]',
                                  isNull ? 'text-text-tertiary italic' : 'text-text-primary',
                                  isLong && 'cursor-pointer hover:text-accent-brand',
                                )}
                                title={isLong ? t('admin.clickToExpand') : raw}
                                onClick={() => isLong && handleCellClick(col.name, raw)}
                              >
                                <span className="block truncate">
                                  {truncate(raw, 100)}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                      {tableData.rows.length === 0 && (
                        <tr>
                          <td
                            colSpan={tableData.columns.length + 1}
                            className="px-3 py-8 text-center text-text-tertiary"
                          >
                            {t('admin.emptyTable')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {tableData.pagination.totalPages > 1 && (
                <div className="shrink-0 border-t border-border-subtle px-4 py-2 flex items-center justify-between">
                  <span className="text-xs text-text-tertiary">
                    {t('admin.pagination', { page: tableData.pagination.page, total: tableData.pagination.totalPages })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-1 rounded hover:bg-bg-hover-muted disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed text-text-secondary"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(tableData.pagination.totalPages, p + 1))}
                      disabled={page >= tableData.pagination.totalPages}
                      className="p-1 rounded hover:bg-bg-hover-muted disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed text-text-secondary"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* FieldContentExpandPanel */}
      {expandedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setExpandedCell(null)}>
          <div
            className="bg-bg-elevated border border-border rounded-lg shadow-xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
              <span className="text-sm font-medium text-text-emphasis">{expandedCell.colName}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded hover:bg-bg-hover-muted text-text-secondary cursor-pointer"
                  title={t('admin.copy')}
                >
                  {copied ? <Check size={14} className="text-accent-green" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => setExpandedCell(null)}
                  className="p-1.5 rounded hover:bg-bg-hover-muted text-text-secondary cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto px-4 py-3 text-xs text-text-primary font-mono whitespace-pre-wrap break-all">
              {prettyPrint(expandedCell.value)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPage
