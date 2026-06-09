import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Button,
  Tag,
  message,
  Tooltip,
  Badge,
  Spin,
  Modal,
  Alert,
  Checkbox,
  Switch,
  Input,
  Select,
  DatePicker,
} from "antd";
import type { Dayjs } from "dayjs";
import {
  MailOutlined,
  FilePdfOutlined,
  ReloadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  InboxOutlined,
  ExclamationCircleOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import {
  getEmailOrders,
  getEmailOrder,
  getCrawlStatus,
  backfillEmails,
  convertAttachment,
  doneAttachment,
  bulkConvert,
  getAttachmentDownloadUrl,
  getAttachmentViewUrl,
  type EmailOrderListItem,
  type EmailOrder,
  type EmailAttachment,
  type CrawlStatus,
} from "@/api/emails";
import { uploadBatch, checkFilenames } from "@/api/orders";
import {
  decodeMimeName,
  groupEmailsByDomain,
  groupEmailsByTime,
  getDomain,
} from "@/utils/emailUtils";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseBackendDate(iso: string): Date {
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasTz ? iso : `${iso}Z`);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = parseBackendDate(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateFull(iso: string | null): string {
  if (!iso) return "—";
  const d = parseBackendDate(iso);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusTag({ status }: { status: EmailAttachment["status"] }) {
  if (status === "done")
    return (
      <Tag icon={<CheckCircleOutlined />} color="success">
        Đã xong
      </Tag>
    );
  if (status === "processing")
    return (
      <Tag icon={<SyncOutlined spin />} color="processing">
        Đang xử lý
      </Tag>
    );
  return (
    <Tag icon={<ClockCircleOutlined />} color="default">
      Chờ xử lý
    </Tag>
  );
}

type EmailMap = Map<number, EmailOrder>;

const PAGE_SIZE = 20;

export default function EmailOrdersPage() {
  const [listItems, setListItems] = useState<EmailOrderListItem[]>([]);
  const [detailMap, setDetailMap] = useState<EmailMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus | null>(null);
  const [crawling, setCrawling] = useState(false);

  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [statusOverride, setStatusOverride] = useState<
    Map<number, EmailAttachment["status"]>
  >(new Map());

  const [previewFile, setPreviewFile] = useState<{
    filename: string;
    url: string;
  } | null>(null);

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(
    null,
  );
  const [filterState, setFilterState] = useState<"all" | "pending" | "done">(
    "all",
  );

  const [autoPoll, setAutoPoll] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const POLL_INTERVAL_MS = 60_000;

  // collapsed time-groups in sidebar (Set of group keys that are collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  // date filter — null means "all dates"
  const [filterDate, setFilterDate] = useState<Dayjs | null>(null);

  const sidebarRef = useRef<HTMLDivElement>(null);

  // ---- fetch list from DB ----
  const fetchList = useCallback(
    async (silent = false, resetPage = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const currentPage = resetPage ? 1 : page;
        const res = await getEmailOrders(currentPage, PAGE_SIZE);
        const decoded = res.items.map((e) => ({
          ...e,
          sender_name: e.sender_name
            ? decodeMimeName(e.sender_name)
            : e.sender_name,
          subject: e.subject ? decodeMimeName(e.subject) : e.subject,
        }));
        if (resetPage) {
          setListItems((prev) => {
            if (silent && decoded.length > 0) {
              const prevIds = new Set(prev.map((x) => x.id));
              const newCount = decoded.filter((x) => !prevIds.has(x.id)).length;
              if (newCount > 0) message.info(`Có ${newCount} email mới`);
            }
            return decoded;
          });
          setPage(1);
        } else {
          setListItems((prev) => {
            if (silent) {
              const prevIds = new Set(prev.map((x) => x.id));
              const newCount = decoded.filter((x) => !prevIds.has(x.id)).length;
              if (newCount > 0) message.info(`Có ${newCount} email mới`);
            }
            return decoded;
          });
        }
        setHasMore(res.page < res.pages);
        setLastSyncAt(new Date());
      } catch (e: unknown) {
        if (!silent)
          setError(
            e instanceof Error ? e.message : "Không thể tải danh sách email",
          );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page],
  );

  const fetchCrawlStatus = useCallback(async () => {
    try {
      setCrawlStatus(await getCrawlStatus());
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    fetchList(false, true);
    fetchCrawlStatus();
  }, [fetchCrawlStatus]);

  // auto-poll
  useEffect(() => {
    if (!autoPoll) return;
    const id = setInterval(() => fetchList(true, true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoPoll, fetchList]);

  // ---- infinite scroll ----
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    function onScroll() {
      if (!el || loadingMore || !hasMore) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
        loadMore();
      }
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadingMore, hasMore]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await getEmailOrders(nextPage, PAGE_SIZE);
      const decoded = res.items.map((e) => ({
        ...e,
        sender_name: e.sender_name
          ? decodeMimeName(e.sender_name)
          : e.sender_name,
        subject: e.subject ? decodeMimeName(e.subject) : e.subject,
      }));
      setListItems((prev) => {
        const existingIds = new Set(prev.map((x) => x.id));
        const fresh = decoded.filter((x) => !existingIds.has(x.id));
        return [...prev, ...fresh];
      });
      setPage(nextPage);
      setHasMore(res.page < res.pages);
    } catch {
      message.error("Không thể tải thêm email");
    } finally {
      setLoadingMore(false);
    }
  }

  // ---- load detail for selected email ----
  async function loadDetail(emailId: number) {
    if (detailMap.has(emailId)) return;
    setDetailLoading(true);
    try {
      const detail = await getEmailOrder(emailId);
      setDetailMap((prev) => new Map(prev).set(emailId, detail));
    } catch {
      message.error("Không thể tải chi tiết email");
    } finally {
      setDetailLoading(false);
    }
  }

  function selectEmail(id: number) {
    setSelectedEmailId(id);
    loadDetail(id);
  }

  // ---- backfill: backend pulls all emails from the Gateway into our DB ----
  async function handleFetchNew() {
    setCrawling(true);
    try {
      message.info("Đang đồng bộ email từ gateway...");
      const res = await backfillEmails();
      await fetchCrawlStatus();
      await fetchList(false, true);
      setDetailMap(new Map());
      setStatusOverride(new Map());
      message.success(`Đã đồng bộ ${res.synced} email`);
    } catch {
      message.error("Không thể lấy đơn hàng mới");
    } finally {
      setCrawling(false);
    }
  }

  // ---- single convert ----
  // `forceUpload`: bỏ qua việc bỏ-qua-khi-đã-done. Dùng cho "Convert lại" — người
  // dùng chủ ý muốn chạy lại (vd kết quả OCR cũ sai), nên luôn upload bản mới.
  // Vẫn skip nếu file đang chạy (pending/processing) để không đẩy trùng vào hàng chờ.
  async function handleConvert(att: EmailAttachment, forceUpload = false) {
    const current = statusOverride.get(att.id) ?? att.status;
    const wasDone = current === "done";
    setStatusOverride((prev) => new Map(prev).set(att.id, "processing"));
    if (wasDone) {
      setListItems((prev) =>
        prev.map((e) =>
          e.id !== att.email_id
            ? e
            : {
                ...e,
                done_count: Math.max(0, e.done_count - 1),
                pending_count: e.pending_count + 1,
              },
        ),
      );
    }
    try {
      const statusMap = await checkFilenames([att.filename]);
      const ocrStatus = statusMap[att.filename];
      // File đang trong hàng chờ OCR (chưa xong) → không đẩy trùng, dù force hay không.
      const isInFlight = ocrStatus === "pending" || ocrStatus === "processing";
      // File đã có kết quả cũ (done) → bình thường thì skip, nhưng "Convert lại"
      // (forceUpload) sẽ bỏ qua để upload bản mới đè lên.
      const skipBecauseDone = ocrStatus === "done" && !forceUpload;

      if (isInFlight || skipBecauseDone) {
        message.info(
          `"${att.filename}" đã có trong hàng chờ OCR (${ocrStatus})`,
        );
        await convertAttachment(att.id);
        return;
      }
      await convertAttachment(att.id);
      const downloadUrl =
        att.download_url ??
        getAttachmentDownloadUrl(att.external_attachment_id ?? att.id);
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Không tải được file: HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], att.filename, { type: "application/pdf" });
      await uploadBatch([file], true);
      message.success(`Đã gửi "${att.filename}" vào hàng chờ OCR`);
    } catch (e: unknown) {
      setStatusOverride((prev) =>
        new Map(prev).set(att.id, wasDone ? "done" : "pending"),
      );
      if (wasDone) {
        setListItems((prev) =>
          prev.map((em) =>
            em.id !== att.email_id
              ? em
              : {
                  ...em,
                  done_count: em.done_count + 1,
                  pending_count: Math.max(0, em.pending_count - 1),
                },
          ),
        );
      }
      message.error(
        e instanceof Error ? e.message : `Không thể convert "${att.filename}"`,
      );
    }
  }

  // ---- single done ----
  async function handleDone(att: EmailAttachment) {
    if (att.status !== "processing") return;
    setStatusOverride((prev) => new Map(prev).set(att.id, "done"));
    try {
      await doneAttachment(att.id);
      setListItems((prev) =>
        prev.map((e) =>
          e.id !== att.email_id
            ? e
            : {
                ...e,
                done_count: e.done_count + 1,
                pending_count: Math.max(0, e.pending_count - 1),
              },
        ),
      );
    } catch {
      setStatusOverride((prev) => new Map(prev).set(att.id, "processing"));
      message.error("Không thể cập nhật trạng thái");
    }
  }

  // ---- bulk convert ----
  async function handleBulkConvert() {
    if (selected.size === 0) return;
    setBulkProcessing(true);
    const ids = [...selected];
    const selectedAtts = [...detailMap.values()]
      .flatMap((d) => d.attachments)
      .filter((a) => ids.includes(a.id));
    setStatusOverride((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.set(id, "processing"));
      return next;
    });
    setSelected(new Set());
    try {
      await bulkConvert(ids);
      const filenames = selectedAtts.map((a) => a.filename);
      const statusMap = await checkFilenames(filenames);
      const toUpload = selectedAtts.filter((a) => {
        const s = statusMap[a.filename];
        return s === null || s === "failed";
      });
      const skipped = selectedAtts.length - toUpload.length;
      if (skipped > 0)
        message.info(`${skipped} file đã có trong hàng chờ OCR, bỏ qua`);
      if (toUpload.length > 0) {
        const blobs = await Promise.all(
          toUpload.map(async (a) => {
            const url =
              a.download_url ??
              getAttachmentDownloadUrl(a.external_attachment_id ?? a.id);
            const res = await fetch(url);
            if (!res.ok) return null;
            const blob = await res.blob();
            return new File([blob], a.filename, { type: "application/pdf" });
          }),
        );
        const files = blobs.filter((f): f is File => f !== null);
        if (files.length > 0) await uploadBatch(files, true);
        message.success(`Đã gửi ${files.length} file vào hàng chờ OCR`);
      }
    } catch {
      setStatusOverride((prev) => {
        const next = new Map(prev);
        ids.forEach((id) => next.set(id, "pending"));
        return next;
      });
      message.error("Không thể convert các file đã chọn");
    } finally {
      setBulkProcessing(false);
    }
  }

  function toggleSelect(attId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(attId) ? next.delete(attId) : next.add(attId);
      return next;
    });
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ---- derived data ----
  const filteredItems = useMemo(() => {
    let items = listItems;
    if (selectedRecipient)
      items = items.filter((e) => e.recipient_email === selectedRecipient);
    if (selectedDomain)
      items = items.filter((e) => getDomain(e.sender_email) === selectedDomain);
    if (filterState === "pending")
      items = items.filter((e) => e.pending_count > 0);
    if (filterState === "done")
      items = items.filter(
        (e) => e.attachment_count > 0 && e.done_count === e.attachment_count,
      );
    if (filterDate) {
      const dateStr = filterDate.format("YYYY-MM-DD");
      items = items.filter((e) => {
        const iso = e.received_at ?? e.created_at;
        if (!iso) return false;
        const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
        const d = new Date(hasTz ? iso : `${iso}Z`);
        return d.toISOString().slice(0, 10) === dateStr;
      });
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (e) =>
          (e.sender_name ?? "").toLowerCase().includes(q) ||
          e.sender_email.toLowerCase().includes(q) ||
          (e.recipient_email ?? "").toLowerCase().includes(q) ||
          (e.subject ?? "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [
    listItems,
    searchQuery,
    selectedRecipient,
    selectedDomain,
    filterState,
    filterDate,
  ]);

  const recipients = useMemo(() => {
    const set = new Set<string>();
    for (const e of listItems) {
      if (e.recipient_email) set.add(e.recipient_email);
    }
    return Array.from(set).sort();
  }, [listItems]);

  useEffect(() => {
    if (selectedRecipient && !recipients.includes(selectedRecipient))
      setSelectedRecipient(null);
  }, [recipients, selectedRecipient]);

  const domains = useMemo(() => groupEmailsByDomain(listItems), [listItems]);

  useEffect(() => {
    if (selectedDomain && !domains.some((g) => g.domain === selectedDomain))
      setSelectedDomain(null);
  }, [domains, selectedDomain]);

  const timeGroups = useMemo(
    () => groupEmailsByTime(filteredItems),
    [filteredItems],
  );

  const selectedEmail = selectedEmailId
    ? listItems.find((e) => e.id === selectedEmailId)
    : null;
  const selectedDetail = selectedEmailId
    ? detailMap.get(selectedEmailId)
    : null;

  const pendingSelectedCount = selected.size;

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <MailOutlined className="text-blue-600 text-lg" />
        <h1 className="text-base font-semibold text-gray-800 m-0 mr-2">
          Đơn hàng qua Email
        </h1>
        {!loading && <Badge count={listItems.length} color="blue" />}

        <Input
          allowClear
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder="Tên / email / tiêu đề..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-64"
          size="small"
        />

        <Select
          allowClear
          size="small"
          placeholder="Người nhận"
          value={selectedRecipient}
          onChange={(v) => setSelectedRecipient(v ?? null)}
          options={recipients.map((r) => ({ label: r, value: r }))}
          className="w-48"
          suffixIcon={<InboxOutlined className="text-gray-400" />}
        />

        <Select
          size="small"
          value={filterState}
          onChange={(v) => setFilterState(v)}
          className="w-36"
          options={[
            { label: "Tất cả trạng thái", value: "all" },
            { label: "Chờ xử lý", value: "pending" },
            { label: "Đã xong", value: "done" },
          ]}
        />

        <DatePicker
          size="small"
          allowClear
          placeholder="Lọc theo ngày"
          value={filterDate}
          onChange={(d) => setFilterDate(d)}
          format="DD/MM/YYYY"
          suffixIcon={<CalendarOutlined className="text-gray-400" />}
          className="w-38"
        />

        <div className="ml-auto flex items-center gap-2">
          <Tooltip title="Tự động kiểm tra email mới mỗi 60 giây">
            <Switch
              size="small"
              checked={autoPoll}
              onChange={setAutoPoll}
              checkedChildren="Auto"
              unCheckedChildren="Off"
            />
          </Tooltip>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => fetchList(false, true)}
            loading={loading}
          >
            Làm mới
          </Button>
          <Button
            size="small"
            type="primary"
            icon={crawling ? <SyncOutlined spin /> : <ReloadOutlined />}
            onClick={handleFetchNew}
            loading={crawling}
          >
            Lấy đơn hàng mới
          </Button>
        </div>
      </div>

      {/* ── Status bar ── */}
      {(crawlStatus || lastSyncAt) && (
        <div className="px-4 py-1.5 bg-white border-b border-gray-100 text-xs text-gray-400 flex items-center gap-3 shrink-0">
          {crawlStatus?.is_running && (
            <span className="flex items-center gap-1 text-blue-500">
              <LoadingOutlined /> Đang crawl...
            </span>
          )}
          {crawlStatus?.last_run_at && (
            <span>Lần cuối: {formatDate(crawlStatus.last_run_at)}</span>
          )}
          {crawlStatus && (
            <span>Tổng: {crawlStatus.total_emails_processed} email</span>
          )}
          {crawlStatus?.last_error && (
            <span className="text-red-400">Lỗi: {crawlStatus.last_error}</span>
          )}
          {lastSyncAt && (
            <span>
              · Đồng bộ lúc{" "}
              {lastSyncAt.toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
        </div>
      )}

      {/* ── Company filter chips ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100 shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Công ty:</span>
        <button
          onClick={() => setSelectedDomain(null)}
          className={`px-3 py-0.5 rounded-full text-xs font-medium border transition-colors ${
            selectedDomain === null
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
          }`}
        >
          Tất cả
        </button>
        {domains.map((g) => (
          <button
            key={g.domain}
            onClick={() =>
              setSelectedDomain(selectedDomain === g.domain ? null : g.domain)
            }
            title={`@${g.domain}`}
            className={`px-3 py-0.5 rounded-full text-xs font-medium border transition-colors ${
              selectedDomain === g.domain
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            {g.label}
            <span className="ml-1 opacity-60">{g.emails.length}</span>
          </button>
        ))}
      </div>

      {/* ── Bulk action bar ── */}
      {pendingSelectedCount > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border-b border-blue-200 px-4 py-2 shrink-0">
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
              icon={
                bulkProcessing ? <SyncOutlined spin /> : <ThunderboltOutlined />
              }
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
          className="mx-4 mt-2 shrink-0"
          action={
            <Button size="small" onClick={() => fetchList(false, true)}>
              Thử lại
            </Button>
          }
        />
      )}

      {/* ── Master-detail body ── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar email list ── */}
        <aside
          ref={sidebarRef}
          className="w-96 shrink-0 border-r border-gray-200 bg-white overflow-y-auto"
        >
          {loading && (
            <div className="flex justify-center py-12">
              <Spin />
            </div>
          )}

          {!loading && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
              {searchQuery.trim() ? (
                <>
                  <SearchOutlined className="text-2xl" />
                  <span>Không tìm thấy kết quả</span>
                </>
              ) : (
                <>
                  <MailOutlined className="text-2xl" />
                  <span>Chưa có email nào</span>
                </>
              )}
            </div>
          )}

          {!loading &&
            timeGroups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.key);
              return (
                <div key={group.key}>
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 sticky top-0 z-10 border-b border-gray-100 hover:bg-gray-100 transition-colors"
                  >
                    {isCollapsed ? (
                      <CaretRightOutlined className="text-gray-400" />
                    ) : (
                      <CaretDownOutlined className="text-gray-400" />
                    )}
                    <span>{group.label}</span>
                    <span className="ml-auto font-normal text-gray-400 normal-case tracking-normal">
                      {group.emails.length} email
                    </span>
                  </button>
                  {!isCollapsed &&
                    group.emails.map((item) => {
                      const isSelected = selectedEmailId === item.id;
                      const allDone =
                        item.attachment_count > 0 &&
                        item.done_count === item.attachment_count;
                      const hasPending = item.pending_count > 0;

                      return (
                        <button
                          key={item.id}
                          onClick={() => selectEmail(item.id)}
                          className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-colors ${
                            isSelected
                              ? "bg-blue-50 border-l-2 border-l-blue-500"
                              : "hover:bg-gray-50 border-l-2 border-l-transparent"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1 mb-0.5">
                            <span
                              className={`text-xs font-semibold truncate flex-1 ${isSelected ? "text-blue-700" : "text-gray-800"}`}
                            >
                              {item.sender_name || item.sender_email}
                            </span>
                            <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                              {formatDate(item.received_at)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 truncate mb-1">
                            {item.subject || "(Không có tiêu đề)"}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {allDone ? (
                              <Tag
                                color="success"
                                className="m-0 text-xs leading-4"
                              >
                                Đã xong
                              </Tag>
                            ) : hasPending ? (
                              <Tag
                                color="warning"
                                className="m-0 text-xs leading-4"
                              >
                                {item.pending_count} chờ
                              </Tag>
                            ) : null}
                            <span className="text-xs text-gray-400">
                              {item.done_count}/{item.attachment_count} file
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              );
            })}

          {/* Infinite scroll loader */}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Spin size="small" />
            </div>
          )}
          {!loadingMore && !hasMore && listItems.length > 0 && (
            <div className="text-center text-xs text-gray-300 py-3">
              Đã tải hết
            </div>
          )}
        </aside>

        {/* ── Detail panel ── */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-gray-50">
          {!selectedEmail ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <MailOutlined className="text-5xl" />
              <p className="text-base">Chọn một email để xem chi tiết</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto p-6 flex flex-col gap-4">
              {/* Email header */}
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  {selectedEmail.subject || "(Không có tiêu đề)"}
                </h2>
                <div className="flex flex-col gap-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-20 shrink-0">Từ:</span>
                    <span className="font-medium text-gray-800">
                      {selectedEmail.sender_name}
                    </span>
                    <br />
                    <span className="text-gray-400">
                      &lt;{selectedEmail.sender_email}&gt;
                    </span>
                  </div>
                  {selectedEmail.recipient_email && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-20 shrink-0">Đến:</span>
                      <span>{selectedEmail.recipient_email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-20 shrink-0">Ngày:</span>
                    <span>{formatDateFull(selectedEmail.received_at)}</span>
                  </div>
                </div>
              </div>

              {/* Attachments */}
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700 m-0">
                    File PDF đính kèm ({selectedEmail.attachment_count})
                  </p>
                  {!selectedDetail && !detailLoading && (
                    <Button
                      size="small"
                      type="link"
                      className="p-0 h-auto text-xs"
                      onClick={() => loadDetail(selectedEmail.id)}
                    >
                      Tải danh sách file
                    </Button>
                  )}
                </div>

                {detailLoading && (
                  <div className="flex justify-center py-6">
                    <Spin />
                  </div>
                )}

                {selectedDetail && selectedDetail.attachments.length === 0 && (
                  <p className="text-sm text-gray-400">
                    Không có file đính kèm
                  </p>
                )}

                {selectedDetail && selectedDetail.attachments.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {selectedDetail.attachments.map((att) => {
                      const status = statusOverride.get(att.id) ?? att.status;
                      const isPending = status === "pending";
                      const isProcessing = status === "processing";
                      const isDone = status === "done";
                      const extId = att.external_attachment_id ?? att.id;
                      const viewUrl =
                        att.view_url ?? getAttachmentViewUrl(extId);

                      return (
                        <div
                          key={att.id}
                          className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 border transition-colors ${
                            selected.has(att.id)
                              ? "bg-blue-50 border-blue-300"
                              : "bg-gray-50 border-gray-100"
                          }`}
                        >
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
                            <span className="text-sm text-gray-700 truncate">
                              {att.filename}
                            </span>
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
                                  setPreviewFile({
                                    filename: att.filename,
                                    url: viewUrl,
                                  })
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
                                  icon={<CheckCircleOutlined />}
                                  onClick={() => handleDone(att)}
                                >
                                  Done
                                </Button>
                              </Tooltip>
                            )}

                            {(isProcessing || isDone) && (
                              <Tooltip title="Convert lại file này (luôn gửi bản mới lên OCR)">
                                <Button
                                  size="small"
                                  icon={<ReloadOutlined />}
                                  onClick={() => handleConvert(att, true)}
                                >
                                  Convert lại
                                </Button>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

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
        styles={{ body: { padding: 0, height: "80vh" } }}
        centered
        destroyOnClose
      >
        {previewFile && (
          <iframe
            src={previewFile.url}
            title={previewFile.filename}
            className="w-full border-0"
            style={{ height: "80vh" }}
          />
        )}
      </Modal>
    </div>
  );
}
