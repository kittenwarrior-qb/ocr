/**
 * Decode RFC 2047 MIME encoded-word strings, e.g.:
 *   =?UTF-8?Q?=C3=81nh_Huynh?=  →  Ánh Huynh
 *   =?UTF-8?B?Tmd1eeG7hW4gVsSDbiBB?=  →  Nguyễn Văn A
 * Falls back to the original string if it cannot be decoded.
 */
export function decodeMimeName(raw: string): string {
  if (!raw) return raw

  // Replace all encoded-word tokens in the string (there may be multiple)
  return raw
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset: string, encoding: string, encoded: string) => {
      try {
        if (encoding.toUpperCase() === 'Q') {
          // Quoted-Printable: underscores are spaces, =XX are hex bytes
          const qpDecoded = encoded
            .replace(/_/g, ' ')
            .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))

          // Re-encode as latin1 bytes then decode as the target charset
          const bytes = Uint8Array.from(qpDecoded, c => c.charCodeAt(0))
          return new TextDecoder(charset).decode(bytes)
        }

        if (encoding.toUpperCase() === 'B') {
          // Base64
          const binaryStr = atob(encoded)
          const bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0))
          return new TextDecoder(charset).decode(bytes)
        }
      } catch {
        // ignore decode errors — return original token
      }
      return encoded
    })
    .trim()
}

/**
 * Extract the domain part from an email address.
 * "sender@familymart.com"  →  "familymart.com"
 */
export function getDomain(email: string): string {
  const at = email.lastIndexOf('@')
  return at !== -1 ? email.slice(at + 1).toLowerCase() : email.toLowerCase()
}

/**
 * Derive a human-readable company label from a domain.
 * "familymart.com"  →  "FamilyMart"
 * "congtyabc.com.vn"  →  "Congtyabc"
 */
export function domainToLabel(domain: string): string {
  // strip common TLDs and country codes, capitalise the primary name
  const primary = domain.split('.')[0]
  return primary.charAt(0).toUpperCase() + primary.slice(1)
}

interface HasSenderEmail {
  sender_email: string
}

export interface EmailGroup<T extends HasSenderEmail = HasSenderEmail> {
  domain: string
  label: string
  emails: T[]
}

export type TimeGroup = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'older'

export const TIME_GROUP_LABELS: Record<TimeGroup, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  this_week: 'Tuần này',
  last_week: 'Tuần trước',
  older: 'Cũ hơn',
}

export function getTimeGroup(isoDate: string | null): TimeGroup {
  if (!isoDate) return 'older'
  const date = new Date(isoDate.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(isoDate) ? isoDate : `${isoDate}Z`)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400_000)

  // start of current week (Monday)
  const dow = startOfToday.getDay() // 0=Sun
  const daysSinceMonday = (dow + 6) % 7
  const startOfThisWeek = new Date(startOfToday.getTime() - daysSinceMonday * 86400_000)
  const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 86400_000)

  if (date >= startOfToday) return 'today'
  if (date >= startOfYesterday) return 'yesterday'
  if (date >= startOfThisWeek) return 'this_week'
  if (date >= startOfLastWeek) return 'last_week'
  return 'older'
}

export interface TimeEmailGroup<T> {
  key: TimeGroup
  label: string
  emails: T[]
}

export function groupEmailsByTime<T extends { received_at: string | null; created_at: string }>(
  emails: T[]
): TimeEmailGroup<T>[] {
  const order: TimeGroup[] = ['today', 'yesterday', 'this_week', 'last_week', 'older']
  const map = new Map<TimeGroup, T[]>(order.map(k => [k, []]))
  for (const email of emails) {
    const group = getTimeGroup(email.received_at ?? email.created_at)
    map.get(group)!.push(email)
  }
  return order
    .filter(k => map.get(k)!.length > 0)
    .map(k => ({ key: k, label: TIME_GROUP_LABELS[k], emails: map.get(k)! }))
}

/**
 * Group a flat list of emails by sender domain, sorted alphabetically by domain.
 */
export function groupEmailsByDomain<T extends HasSenderEmail>(emails: T[]): EmailGroup<T>[] {
  const map = new Map<string, T[]>()

  for (const email of emails) {
    const domain = getDomain(email.sender_email)
    if (!map.has(domain)) map.set(domain, [])
    map.get(domain)!.push(email)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, items]) => ({
      domain,
      label: domainToLabel(domain),
      emails: items,
    })) as EmailGroup<T>[]
}
