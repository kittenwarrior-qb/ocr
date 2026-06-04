import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Card, Tag, message, Tooltip, Badge, Spin, Modal, Alert, Checkbox, Switch } from 'antd'
import {
  MailOutlined,
  FilePdfOutlined,
  ReloadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  getEmailOrders,
  getEmailOrder,
  getCrawlStatus,
  triggerCrawl,
  getCrawlerEmails,
  getCrawlerEmail,
  syncEmailToDB,
  convertAttachment,
  doneAttachment,
  bulkConvert,
  getAttachmentDownloadUrl,
  type EmailOrderListItem,
  type EmailOrder,
  type EmailAttachment,
  type CrawlStatus,
} from '@/api/emails'
import { uploadBatch, checkFilenames } from '@/api/orders'
import { decodeMimeName, groupEmailsByDomain } from '@/utils/emailUtils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Parse an ISO string from the backend.
 * Backend stores naive UTC datetimes and serializes them without a timezone
 * suffix (e.g. "2026-06-04T09:30:00"). JS would otherwise interpret such a
 * string as *local* time. We append "Z" when no timezone offset is present so
 * it is correctly read as UTC, then rendered in the user's local timezone.
 */
function parseBackendDate(iso: string): Date {
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso)
  return new Date(hasTz ? iso : `${iso}Z`)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = parseBackendDate(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusTag({ status }: { status: EmailAttachment['status'] }) {
  if (status === 'done')
    return <Tag icon={<CheckCircleOutlined />} color="success">Đã xong</Tag>
  if (status === 'processing')
    return <Tag icon={<SyncOutlined spin />} color="processing">Đang xử lý</Tag>
  return <Tag icon={<ClockCircleOutlined />} color="default">Chờ xử lý</Tag>
}

// ---- merge list items with loaded detail ----
type EmailMap = Map<number, EmailOrder>

export default function EmailOrdersPage() {
  const [listItems, setListItems] = useState<EmailOrderListItem[]>([])
  const [detailMap, setDetailMap] = useState<EmailMap>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus | null>(null)
  const [crawling, setCrawling] = useState(false)

  // multi-select: set of attachment ids
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)

  // per-attachment optimistic status override (so UI updates instantly)
  const [statusOverride, setStatusOverride] = useState<Map<number, EmailAttachment['status']>>(new Map())

  const [previewFile, setPreviewFile] = useState<{ filename: string; url: string } | null>(null)

  // company sidebar — null means "show all companies"
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)

  // auto-polling (webhook delivers to backend; FE polls our DB to pick up new rows)
  const [autoPoll, setAutoPoll] = useState(true)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const POLL_INTERVAL_MS = 60_000

  // ---- fetch list from our DB ----
  // `silent`: skip the full-screen spinner (used by auto-poll so the UI doesn't flicker)
  const fetchList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const items = await getEmailOrders(0, 50)
      const decoded = items.map(e => ({
        ...e,
        sender_name: e.sender_name ? decodeMimeName(e.sender_name) : e.sender_name,
        subject: e.subject ? decodeMimeName(e.subject) : e.subject,
      }))
      setListItems(prev => {
        // detect newly arrived emails to notify the user during silent polls
        if (silent && decoded.length > prev.length) {
          message.info(`Có ${decoded.length - prev.length} email mới`)
        }
        return decoded
      })
      setLastSyncAt(new Date())
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : 'Không thể tải danh sách email')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const fetchCrawlStatus = useCallback(async () => {
    try { setCrawlStatus(await getCrawlStatus()) } catch { /* non-critical */ }
  }, [])

  useEffect(() => { fetchList(); fetchCrawlStatus() }, [fetchList, fetchCrawlStatus])

  // ---- auto-poll our DB for emails delivered via webhook ----
  useEffect(() => {
    if (!autoPoll) return
    const id = setInterval(() => fetchList(true), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [autoPoll, fetchList])

  // ---- lazy-load attachment detail for one email ----
  async function loadDetail(emailId: number) {
    if (detailMap.has(emailId)) return
    try {
      const detail = await getEmailOrder(emailId)
      setDetailMap(prev => new Map(prev).set(emailId, detail))
    } catch {
      message.error('Không thể tải danh sách file đính kèm')
    }
  }

  // ---- crawl new emails from crawler service then sync to our DB ----
  async function handleFetchNew() {
    setCrawling(true)
    try {
      await triggerCrawl()
      message.info('Đang crawl email mới...')
      await new Promise(r => setTimeout(r, 2500))
      await fetchCrawlStatus()

      // pull latest emails from crawler and sync each one to our DB
      const res = await getCrawlerEmails({ size: 50 })
      await Promise.all(
        res.items.map(async crawlerEmail => {
          const full = await getCrawlerEmail(crawlerEmail.id)
          await syncEmailToDB(full)
        })
      )
      await fetchList()
      // clear detail cache so reloading shows fresh status
      setDetailMap(new Map())
      setStatusOverride(new Map())
      message.success('Đã đồng bộ email mới')
    } catch {
      message.error('Không thể lấy đơn hàng mới')
    } finally {
      setCrawling(false)
    }
  }

  // ---- single convert ----
  async function handleConvert(att: EmailAttachment) {
    if (att.status !== 'pending') return
    setStatusOverride(prev => new Map(prev).set(att.id, 'processing'))
    try {
      // 1. Check if this filename already exists in OCR
      const statusMap = await checkFilenames([att.filename])
      const ocrStatus = statusMap[att.filename]

      if (ocrStatus === 'pending' || ocrStatus === 'processing' || ocrStatus === 'done') {
        // Already in OCR pipeline — just mark our record as processing, skip upload
        message.info(`"${att.filename}" đã có trong hàng chờ OCR (${ocrStatus})`)
        await convertAttachment(att.id)
        return
      }

      // 2. Not in OCR yet (null) or previously failed → fetch blob and upload
      await convertAttachment(att.id)
      if (att.download_url) {
        const res = await fetch(att.download_url)
        if (!res.ok) throw new Error(`Không tải được file: HTTP ${res.status}`)
        const blob = await res.blob()
        const file = new File([blob], att.filename, { type: 'application/pdf' })
        await uploadBatch([file], true)
      }
      message.success(`Đã gửi "${att.filename}" vào hàng chờ OCR`)
    } catch (e: unknown) {
      setStatusOverride(prev => new Map(prev).set(att.id, 'pending'))
      message.error(e instanceof Error ? e.message : `Không thể convert "${att.filename}"`)
    }
  }

  // ---- single done ----
  async function handleDone(att: EmailAttachment) {
    if (att.status !== 'processing') return
    setStatusOverride(prev => new Map(prev).set(att.id, 'done'))
    try {
      await doneAttachment(att.id)
      // refresh list counts
      setListItems(prev =>
        prev.map(e =>
          e.id !== att.email_id ? e : {
            ...e,
            done_count: e.done_count + 1,
            pending_count: Math.max(0, e.pending_count - 1),
          }
        )
      )
    } catch {
      setStatusOverride(prev => new Map(prev).set(att.id, 'processing'))
      message.error('Không thể cập nhật trạng thái')
    }
  }

  // ---- bulk convert selected attachments ----
  async function handleBulkConvert() {
    if (selected.size === 0) return
    setBulkProcessing(true)
    const ids = [...selected]

    // collect attachment objects for the selected ids
    const selectedAtts = [...detailMap.values()]
      .flatMap(d => d.attachments)
      .filter(a => ids.includes(a.id))

    // optimistic UI
    setStatusOverride(prev => {
      const next = new Map(prev)
      ids.forEach(id => next.set(id, 'processing'))
      return next
    })
    setSelected(new Set())

    try {
      // 1. Bulk-mark as processing in our DB
      await bulkConvert(ids)

      // 2. Check which filenames are already in OCR
      const filenames = selectedAtts.map(a => a.filename)
      const statusMap = await checkFilenames(filenames)

      // 3. Only upload files that are not yet in OCR (null or failed)
      const toUpload = selectedAtts.filter(a => {
        const s = statusMap[a.filename]
        return s === null || s === 'failed'
      })

      const skipped = selectedAtts.length - toUpload.length
      if (skipped > 0) {
        message.info(`${skipped} file đã có trong hàng chờ OCR, bỏ qua`)
      }

      if (toUpload.length > 0) {
        const blobs = await Promise.all(
          toUpload.map(async a => {
            if (!a.download_url) return null
            const res = await fetch(a.download_url)
            if (!res.ok) return null
            const blob = await res.blob()
            return new File([blob], a.filename, { type: 'application/pdf' })
          })
        )
        const files = blobs.filter((f): f is File => f !== null)
        if (files.length > 0) await uploadBatch(files, true)
        message.success(`Đã gửi ${files.length} file vào hàng chờ OCR`)
      }
    } catch {
      // revert optimistic
      setStatusOverride(prev => {
        const next = new Map(prev)
        ids.forEach(id => next.set(id, 'pending'))
        return next
      })
      message.error('Không thể convert các file đã chọn')
    } finally {
      setBulkProcessing(false)
    }
  }

  function toggleSelect(attId: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(attId) ? next.delete(attId) : next.add(attId)
      return next
    })
  }

  // ---- derive groups from list items (for grouping header) ----
  const groups = useMemo(
    () => groupEmailsByDomain(listItems),
    [listItems]
  )

  // groups shown in the main panel — filtered by the selected company (if any)
  const visibleGroups = useMemo(
    () => (selectedDomain ? groups.filter(g => g.domain === selectedDomain) : groups),
    [groups, selectedDomain]
  )

  // if the selected company disappears (e.g. after refresh), fall back to "all"
  useEffect(() => {
    if (selectedDomain && !groups.some(g => g.domain === selectedDomain)) {
      setSelectedDomain(null)
    }
  }, [groups, selectedDomain])

  const pendingSelectedCount = selected.size

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MailOutlined className="text-blue-600 text-xl" />
          <h1 className="text-lg font-semibold text-gray-800 m-0">Đơn hàng qua Email</h1>
          {!loading && <Badge count={listItems.length} color="blue" />}
        </div>
        <div className="flex items-center gap-3">
          <Tooltip title="Tự động kiểm tra email mới mỗi 60 giây (webhook đẩy về DB)">
            <Switch
              size="small"
              checked={autoPoll}
              onChange={setAutoPoll}
              checkedChildren="Auto"
              unCheckedChildren="Off"
            />
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList()} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={crawling ? <SyncOutlined spin /> : <ReloadOutlined />}
            onClick={handleFetchNew}
            loading={crawling}
          >
            Lấy đơn hàng mới
          </Button>
        </div>
      </div>

      {/* Crawl status bar */}
      {crawlStatus && (
        <div className="mb-4 text-xs text-gray-500 flex items-center gap-3">
          {crawlStatus.is_running && (
            <span className="flex items-center gap-1 text-blue-500">
              <LoadingOutlined /> Đang crawl...
            </span>
          )}
          {crawlStatus.last_run_at && <span>Lần cuối: {formatDate(crawlStatus.last_run_at)}</span>}
          <span>Tổng: {crawlStatus.total_emails_processed} email đã xử lý</span>
          {crawlStatus.last_error && <span className="text-red-500">Lỗi: {crawlStatus.last_error}</span>}
          {lastSyncAt && (
            <span className="text-gray-400">
              · Đồng bộ lúc {lastSyncAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {/* Sync time even when crawlStatus is unavailable */}
      {!crawlStatus && lastSyncAt && (
        <div className="mb-4 text-xs text-gray-400">
          Đồng bộ lúc {lastSyncAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}

      {/* Bulk action bar — shows when items are selected */}
      {pendingSelectedCount > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 shadow-sm">
          <span className="text-sm text-blue-700 font-medium">
            Đã chọn {pendingSelectedCount} file
          </span>
          <div className="flex items-center gap-2">
            <Button size="small" onClick={() => setSelected(new Set())}>
              Bỏ chọn tất cả
            </Button>
            <Button
              size="small"
              type="primary"
              icon={bulkProcessing ? <SyncOutlined spin /> : <ThunderboltOutlined />}
              loading={bulkProcessing}
              onClick={handleBulkConvert}
            >
              Convert {pendingSelectedCount} file
            </Button>
          </div>
        </div>
      )}

      {error && (
        <Alert
          type="error"
          message={error}
          action={<Button size="small" onClick={() => fetchList()}>Thử lại</Button>}
          className="mb-4"
        />
      )}

      {loading && (
        <div className="flex justify-center py-20">
          <Spin size="large" />
        </div>
      )}

      {/* Two-column layout: company sidebar + email list */}
      {!loading && listItems.length > 0 && (
        <div className="flex gap-4 items-start">
          {/* Company sidebar */}
          <aside className="w-56 shrink-0 sticky top-4">
            <div className="bg-white border border-gray-200 rounded-xl p-2 shadow-sm">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-2 pt-1 pb-2 m-0">
                Công ty
              </p>
              <button
                onClick={() => setSelectedDomain(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedDomain === null
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>Tất cả</span>
                <Badge count={listItems.length} color={selectedDomain === null ? 'blue' : 'gray'} />
              </button>
              {groups.map(group => (
                <button
                  key={group.domain}
                  onClick={() => setSelectedDomain(group.domain)}
                  title={`@${group.domain}`}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedDomain === group.domain
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate text-left">{group.label}</span>
                  <Badge count={group.emails.length} color={selectedDomain === group.domain ? 'blue' : 'gray'} />
                </button>
              ))}
            </div>
          </aside>

          {/* Email list grouped by company domain */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            {visibleGroups.map(group => (
            <div key={group.domain}>
              {/* Hide the inline company header when filtering to a single company (sidebar already shows it) */}
              {!selectedDomain && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-700">{group.label}</span>
                  <span className="text-xs text-gray-400">@{group.domain}</span>
                  <Badge count={group.emails.length} color="gray" />
                </div>
              )}

              <div className="flex flex-col gap-3">
                {(group.emails as unknown as EmailOrderListItem[]).map(item => {
                  const detail = detailMap.get(item.id)
                  const allDone = item.attachment_count > 0 && item.done_count === item.attachment_count
                  const hasProcessing = detail?.attachments.some(
                    a => (statusOverride.get(a.id) ?? a.status) === 'processing'
                  )

                  return (
                    <Card
                      key={item.id}
                      className="shadow-sm border border-gray-200 rounded-xl"
                      bodyStyle={{ padding: 0 }}
                    >
                      {/* Email header */}
                      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-800 text-sm truncate">
                                {item.subject || '(Không có tiêu đề)'}
                              </span>
                              {allDone && <Tag color="success">Đã xử lý</Tag>}
                              {hasProcessing && (
                                <Tag icon={<SyncOutlined spin />} color="processing">Đang xử lý</Tag>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span className="font-medium text-gray-700">{item.sender_name}</span>
                              <span className="text-gray-400">&lt;{item.sender_email}&gt;</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-gray-400">{formatDate(item.received_at)}</span>
                            <span className="text-xs text-gray-400">
                              {item.done_count}/{item.attachment_count} file
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Attachments */}
                      <div className="px-5 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide m-0">
                            File PDF đính kèm ({item.attachment_count})
                          </p>
                          {!detail && (
                            <Button
                              size="small"
                              type="link"
                              className="p-0 h-auto text-xs"
                              onClick={() => loadDetail(item.id)}
                            >
                              Tải danh sách file
                            </Button>
                          )}
                        </div>

                        {detail && detail.attachments.length === 0 && (
                          <p className="text-xs text-gray-400">Không có file đính kèm</p>
                        )}

                        {detail && detail.attachments.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {detail.attachments.map(att => {
                              const status = statusOverride.get(att.id) ?? att.status
                              const isPending = status === 'pending'
                              const isProcessing = status === 'processing'
                              const isDone = status === 'done'
                              const downloadUrl = att.download_url ?? getAttachmentDownloadUrl(att.external_attachment_id ?? att.id)

                              return (
                                <div
                                  key={att.id}
                                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 border transition-colors ${
                                    selected.has(att.id)
                                      ? 'bg-blue-50 border-blue-300'
                                      : 'bg-gray-50 border-gray-100'
                                  }`}
                                >
                                  {/* Checkbox — only for pending */}
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {isPending ? (
                                      <Checkbox
                                        checked={selected.has(att.id)}
                                        onChange={() => toggleSelect(att.id)}
                                      />
                                    ) : isDone ? (
                                      <CheckCircleOutlined className="text-green-500" />
                                    ) : isProcessing ? (
                                      <SyncOutlined spin className="text-blue-500" />
                                    ) : (
                                      <ExclamationCircleOutlined className="text-gray-300" />
                                    )}
                                    <FilePdfOutlined className="text-red-400 text-base shrink-0" />
                                    <span className="text-sm text-gray-700 truncate">{att.filename}</span>
                                    {att.file_size && (
                                      <span className="text-xs text-gray-400 shrink-0">
                                        {formatBytes(att.file_size)}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <StatusTag status={status} />

                                    <Tooltip title="Xem file PDF">
                                      <Button
                                        size="small"
                                        icon={<EyeOutlined />}
                                        onClick={() =>
                                          setPreviewFile({ filename: att.filename, url: downloadUrl })
                                        }
                                      >
                                        Xem
                                      </Button>
                                    </Tooltip>

                                    {isPending && (
                                      <Tooltip title="Gửi file lên OCR để trích xuất đơn hàng">
                                        <Button
                                          size="small"
                                          type="primary"
                                          onClick={() => handleConvert(att)}
                                        >
                                          Convert
                                        </Button>
                                      </Tooltip>
                                    )}

                                    {isProcessing && (
                                      <Tooltip title="Xác nhận đã kiểm tra kết quả OCR">
                                        <Button
                                          size="small"
                                          type="default"
                                          icon={<CheckCircleOutlined />}
                                          onClick={() => handleDone(att)}
                                        >
                                          Done
                                        </Button>
                                      </Tooltip>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
            ))}

            {/* No emails for the selected company */}
            {visibleGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                <MailOutlined className="text-4xl mb-3" />
                <p className="text-base">Không có email cho công ty này</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state — no emails at all */}
      {!loading && !error && listItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <MailOutlined className="text-5xl mb-3" />
          <p className="text-base">Chưa có email nào. Nhấn "Lấy đơn hàng mới" để đồng bộ.</p>
        </div>
      )}

      {/* PDF Preview Modal */}
      <Modal
        open={!!previewFile}
        onCancel={() => setPreviewFile(null)}
        footer={null}
        title={
          <div className="flex items-center gap-2">
            <FilePdfOutlined className="text-red-400" />
            <span className="text-sm truncate">{previewFile?.filename}</span>
          </div>
        }
        width="80vw"
        styles={{ body: { padding: 0, height: '80vh' } }}
        centered
        destroyOnClose
      >
        {previewFile && (
          <iframe
            src={previewFile.url}
            title={previewFile.filename}
            className="w-full border-0"
            style={{ height: '80vh' }}
          />
        )}
      </Modal>
    </div>
  )
}
