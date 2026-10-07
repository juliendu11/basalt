import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

/**
 * SSRF guard for user-supplied hosts the server itself connects to (e.g. the
 * SMTP connection tester, docs/security-audit-2026-10-06.md § 2). A host is
 * rejected when it is — or resolves to — a loopback, private, link-local,
 * carrier-grade-NAT, or otherwise non-publicly-routable address, so an
 * authenticated user can't point the server at `127.0.0.1`, cloud metadata
 * (`169.254.169.254`), or internal services to scan/pivot the private network.
 *
 * DNS is resolved here and every returned address is checked (a public name
 * that resolves to a private A/AAAA record is still refused) — the actual
 * connection must reuse these same resolved IPs, or a DNS-rebinding race could
 * still reach an internal target between this check and the connect.
 */

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true // malformed — treat as unsafe
  }
  const [a, b] = parts

  if (a === 0) return true // 0.0.0.0/8 (unspecified / this host)
  if (a === 10) return true // 10.0.0.0/8 private
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true // 192.0.0.0/24 IETF protocol
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmarking
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255
  return false
}

function ipv6IsPrivate(ip: string): boolean {
  const normalized = ip.toLowerCase().split('%')[0] // strip zone id

  // IPv4-mapped (::ffff:a.b.c.d) / IPv4-compatible — defer to the v4 rules.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4IsPrivate(mapped[1])

  if (normalized === '::1' || normalized === '::') return true // loopback / unspecified

  const firstGroup = Number.parseInt(normalized.split(':')[0] || '0', 16)
  if (firstGroup >= 0xfe80 && firstGroup <= 0xfebf) return true // fe80::/10 link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true // fc00::/7 unique-local
  return false
}

/** True when `ip` (a valid IPv4/IPv6 literal) is not safely publicly routable. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return ipv4IsPrivate(ip)
  if (version === 6) return ipv6IsPrivate(ip)
  return true // not a valid IP literal — unsafe
}

/**
 * Resolves `host` and throws when it is, or maps to, a non-public address.
 * Returns the resolved IPs so the caller can connect to those exact addresses
 * rather than re-resolving (defeating DNS rebinding).
 */
export async function assertPublicHost(host: string): Promise<string[]> {
  const trimmed = host.trim()

  if (isIP(trimmed)) {
    if (isPrivateAddress(trimmed)) {
      throw new PrivateAddressError(trimmed)
    }
    return [trimmed]
  }

  const resolved = await lookup(trimmed, { all: true })
  if (resolved.length === 0) {
    throw new PrivateAddressError(trimmed)
  }
  for (const { address } of resolved) {
    if (isPrivateAddress(address)) {
      throw new PrivateAddressError(trimmed)
    }
  }
  return resolved.map((r) => r.address)
}

export class PrivateAddressError extends Error {
  constructor(host: string) {
    super(`Host "${host}" resolves to a non-public address and is not allowed`)
    this.name = 'PrivateAddressError'
  }
}
