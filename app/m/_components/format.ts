export function fmtCents(cents: number, opts: { sign?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 2
  const v = Math.abs(cents) / 100
  const formatted = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  if (opts.sign) {
    if (cents > 0) return `+$${formatted}`
    if (cents < 0) return `−$${formatted}`
  }
  return cents < 0 ? `−$${formatted}` : `$${formatted}`
}

export function fmtPct(n: number, opts: { sign?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 2
  const v = n.toFixed(decimals)
  if (opts.sign && n > 0) return `+${v}%`
  return `${v}%`
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.max(0, Math.floor(diff / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
