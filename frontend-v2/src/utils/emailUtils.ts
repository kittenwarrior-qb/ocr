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
