import axios from "axios";
import client from "./client";

// --- Crawler service client (external) ---
const crawlerClient = axios.create({
  baseURL:
    import.meta.env.VITE_EMAIL_API_URL ||
    "https://email-gateway.longpt.io.vn/api",
  headers: { "Content-Type": "application/json" },
});

// ============================================================
// Types — Crawler service (external)
// ============================================================

export interface CrawlerAttachment {
  id: number;
  email_id: number;
  filename: string;
  filepath: string;
  mime_type: string;
  file_size: number;
  checksum: string;
  created_at: string;
  download_url: string;
  view_url: string;
}

export interface CrawlerEmail {
  id: number;
  message_id: string;
  sender_email: string;
  sender_name: string;
  recipient_email: string;
  subject: string;
  body?: string;
  received_at: string;
  processed_at: string | null;
  created_at: string;
  attachments?: CrawlerAttachment[];
}

export interface CrawlerEmailListResponse {
  items: CrawlerEmail[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface CrawlStatus {
  is_running: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  emails_processed_last_run: number;
  total_emails_processed: number;
  last_error: string | null;
}

// ============================================================
// Types — Our backend (email_orders)
// ============================================================

export type AttachmentStatus = "pending" | "processing" | "done";

export interface EmailAttachment {
  id: number;
  email_id: number;
  external_attachment_id: number | null;
  filename: string;
  file_size: number | null;
  download_url: string | null;
  view_url: string | null;
  status: AttachmentStatus;
  converted_at: string | null;
  done_at: string | null;
  created_at: string;
}

export interface EmailOrder {
  id: number;
  external_id: string | null;
  sender_email: string;
  sender_name: string | null;
  recipient_email: string | null;
  subject: string | null;
  received_at: string | null;
  created_at: string;
  attachments: EmailAttachment[];
}

export interface EmailOrderListItem {
  id: number;
  external_id: string | null;
  sender_email: string;
  sender_name: string | null;
  recipient_email: string | null;
  subject: string | null;
  received_at: string | null;
  created_at: string;
  attachment_count: number;
  pending_count: number;
  done_count: number;
}

export interface EmailOrderListResponse {
  items: EmailOrderListItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ============================================================
// Crawler service API
// ============================================================

export async function getCrawlStatus(): Promise<CrawlStatus> {
  const { data } = await crawlerClient.get("/crawl/status");
  return data;
}

export async function triggerCrawl(): Promise<{
  status: string;
  message: string;
}> {
  const { data } = await crawlerClient.post("/crawl");
  return data;
}

export async function getCrawlerEmails(params?: {
  sender_email?: string;
  subject?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  size?: number;
}): Promise<CrawlerEmailListResponse> {
  const { data } = await crawlerClient.get("/emails", { params });
  return data;
}

export async function getCrawlerEmail(emailId: number): Promise<CrawlerEmail> {
  const { data } = await crawlerClient.get(`/emails/${emailId}`);
  return data;
}

function emailApiBase(): string {
  return (
    import.meta.env.VITE_EMAIL_API_URL ||
    "https://email-gateway.longpt.io.vn/api"
  ).replace(/\/$/, "");
}

/** URL to download the raw file (used to feed the OCR pipeline). */
export function getAttachmentDownloadUrl(attachmentId: number): string {
  return `${emailApiBase()}/attachments/${attachmentId}/download`;
}

/** URL to view the file inline in the browser (used by the PDF preview modal). */
export function getAttachmentViewUrl(attachmentId: number): string {
  return `${emailApiBase()}/attachments/${attachmentId}/view`;
}

// ============================================================
// Our backend API — /api/v1/email-orders
// ============================================================

export interface EmailOrderFilters {
  search?: string;
  recipient?: string | null;
  domain?: string | null;
  status?: "all" | "pending" | "done";
  date?: string | null; // "YYYY-MM-DD"
}

export async function getEmailOrders(
  page = 1,
  size = 20,
  filters: EmailOrderFilters = {},
): Promise<EmailOrderListResponse> {
  // drop empty/null/"all" values so they aren't sent as query params
  const params: Record<string, string | number> = { page, size };
  if (filters.search?.trim()) params.search = filters.search.trim();
  if (filters.recipient) params.recipient = filters.recipient;
  if (filters.domain) params.domain = filters.domain;
  if (filters.status && filters.status !== "all") params.status = filters.status;
  if (filters.date) params.date = filters.date;

  const { data } = await client.get("/email-orders", { params });
  // handle both paginated and legacy array responses
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 1, size: data.length, pages: 1 }
  }
  return data;
}

export interface EmailFacets {
  domains: { domain: string; count: number }[];
  recipients: string[];
}

export async function getEmailFacets(): Promise<EmailFacets> {
  const { data } = await client.get("/email-orders/facets");
  return data;
}

export async function getEmailOrder(id: number): Promise<EmailOrder> {
  const { data } = await client.get(`/email-orders/${id}`);
  return data;
}

export interface BackfillResult {
  synced: number;
  total: number;
  pages: number;
}

/** Ask our backend to pull all emails from the Gateway into our DB. */
export async function backfillEmails(): Promise<BackfillResult> {
  const { data } = await client.post("/email-orders/backfill");
  return data;
}

/** Upsert a crawler email into our DB (called after fetching from crawler). */
export async function syncEmailToDB(
  crawlerEmail: CrawlerEmail,
): Promise<EmailOrder> {
  const { data } = await client.post("/email-orders/sync", {
    external_id: crawlerEmail.message_id,
    sender_email: crawlerEmail.sender_email,
    sender_name: crawlerEmail.sender_name,
    recipient_email: crawlerEmail.recipient_email,
    subject: crawlerEmail.subject,
    received_at: crawlerEmail.received_at,
    attachments: (crawlerEmail.attachments ?? []).map((a) => ({
      external_attachment_id: a.id,
      filename: a.filename,
      file_size: a.file_size,
      download_url: a.download_url,
      view_url: a.view_url,
    })),
  });
  return data;
}

/** Mark a single attachment as processing (pending → processing). */
export async function convertAttachment(
  attachmentId: number,
): Promise<EmailAttachment> {
  const { data } = await client.post(
    `/email-orders/attachments/${attachmentId}/convert`,
  );
  return data;
}

/** User confirms OCR done (processing → done). */
export async function doneAttachment(
  attachmentId: number,
): Promise<EmailAttachment> {
  const { data } = await client.post(
    `/email-orders/attachments/${attachmentId}/done`,
  );
  return data;
}

/** Bulk mark multiple attachments as processing. */
export async function bulkConvert(
  attachmentIds: number[],
): Promise<EmailAttachment[]> {
  const { data } = await client.post("/email-orders/attachments/bulk-convert", {
    attachment_ids: attachmentIds,
  });
  return data;
}
