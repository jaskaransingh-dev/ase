'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

export const dynamic = 'force-dynamic'

const C = {
  bg: '#04101C', bg2: '#06111F', bg3: '#0B1728', border: '#1E2A3D',
  blue: '#4F8CFF', blue2: '#6BA3FF', mint: '#16C784', red: '#FF5468',
  orange: '#F5B942', text: '#B7C4D5', muted: '#7F8CA3', faint: '#3A5070', white: '#F7FAFF',
  purple: '#8B5CF6',
}

interface CountryData {
  id: string; name: string; region: string; subregion?: string
  x: number; y: number; w: number; h: number
  metric: number; nodes: number; volume: number; exchanges: number
  lat: number; lng: number
  regulations?: string; taxRate?: string; exchanges24h?: number
}

interface DataLayer {
  id: string; label: string; color: string; enabled: boolean; opacity: number
}

interface DatasetConnection {
  id: string; name: string; records: number; status: 'connected' | 'available' | 'offline'
}

const BASE_COUNTRIES: Omit<CountryData, 'metric' | 'nodes' | 'volume' | 'exchanges' | 'regulations' | 'taxRate' | 'exchanges24h'>[] = [
  { id: 'US',  name: 'United States',    region: 'Americas', subregion: 'North America', x:  4, y: 20, w: 17, h: 14, lat: 37,  lng: -100 },
  { id: 'CA',  name: 'Canada',           region: 'Americas', subregion: 'North America', x:  4, y:  8, w: 18, h: 11, lat: 56,  lng: -96  },
  { id: 'MX',  name: 'Mexico',           region: 'Americas', subregion: 'Central America', x:  7, y: 31, w:  8, h:  7, lat: 24,  lng: -102 },
  { id: 'BR',  name: 'Brazil',           region: 'Americas', subregion: 'South America', x: 14, y: 38, w: 12, h: 14, lat: -9,  lng: -53  },
  { id: 'AR',  name: 'Argentina',        region: 'Americas', subregion: 'South America', x: 13, y: 51, w:  7, h: 10, lat: -35, lng: -66  },
  { id: 'GB',  name: 'United Kingdom',   region: 'Europe', subregion: 'Western Europe', x: 43, y: 13, w:  3, h:  4, lat: 54,  lng: -2   },
  { id: 'DE',  name: 'Germany',          region: 'Europe', subregion: 'Western Europe', x: 47, y: 14, w:  4, h:  4, lat: 51,  lng: 10   },
  { id: 'FR',  name: 'France',           region: 'Europe', subregion: 'Western Europe', x: 45, y: 16, w:  4, h:  4, lat: 46,  lng: 2    },
  { id: 'NL',  name: 'Netherlands',      region: 'Europe', subregion: 'Western Europe', x: 47, y: 12, w:  2, h:  2, lat: 52,  lng: 5    },
  { id: 'CH',  name: 'Switzerland',      region: 'Europe', subregion: 'Western Europe', x: 47, y: 16, w:  2, h:  2, lat: 47,  lng: 8    },
  { id: 'RU',  name: 'Russia',           region: 'Eurasia', subregion: 'Eastern Europe', x: 50, y:  5, w: 30, h: 14, lat: 62,  lng: 96   },
  { id: 'TR',  name: 'Turkey',           region: 'Eurasia', subregion: 'Western Asia', x: 52, y: 20, w:  6, h:  4, lat: 39,  lng: 35   },
  { id: 'CN',  name: 'China',            region: 'Asia', subregion: 'East Asia', x: 63, y: 17, w: 16, h: 14, lat: 35,  lng: 104  },
  { id: 'IN',  name: 'India',            region: 'Asia', subregion: 'South Asia', x: 62, y: 24, w:  8, h: 10, lat: 21,  lng: 79   },
  { id: 'JP',  name: 'Japan',            region: 'Asia', subregion: 'East Asia', x: 80, y: 17, w:  4, h:  6, lat: 37,  lng: 138  },
  { id: 'KR',  name: 'South Korea',      region: 'Asia', subregion: 'East Asia', x: 78, y: 19, w:  3, h:  4, lat: 36,  lng: 128  },
  { id: 'SG',  name: 'Singapore',        region: 'Asia', subregion: 'Southeast Asia', x: 71, y: 34, w:  2, h:  2, lat: 1,   lng: 104  },
  { id: 'HK',  name: 'Hong Kong',        region: 'Asia', subregion: 'East Asia', x: 75, y: 27, w:  2, h:  2, lat: 22,  lng: 114  },
  { id: 'AE',  name: 'UAE',              region: 'Middle East', subregion: 'Gulf States', x: 59, y: 27, w:  3, h:  3, lat: 24,  lng: 54   },
  { id: 'NG',  name: 'Nigeria',          region: 'Africa', subregion: 'West Africa', x: 46, y: 34, w:  5, h:  6, lat: 9,   lng: 8    },
  { id: 'ZA',  name: 'South Africa',     region: 'Africa', subregion: 'Southern Africa', x: 49, y: 50, w:  5, h:  6, lat: -29, lng: 25   },
  { id: 'KE',  name: 'Kenya',            region: 'Africa', subregion: 'East Africa', x: 53, y: 37, w:  3, h:  4, lat: 1,   lng: 38   },
  { id: 'AU',  name: 'Australia',        region: 'Oceania', subregion: 'Australasia', x: 71, y: 44, w: 15, h: 12, lat: -27, lng: 133  },
]

function hashSeed(s: string) { return s.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 17) }

const REG_META: Record<string, { regulations: string; taxRate: string }> = {
  US: { regulations: 'SEC, CFTC, FinCEN; MSB licenses required', taxRate: '15-37% capital gains' },
  CA: { regulations: 'CSA, FINTRAC; PIPEDA data rules', taxRate: '50% capital gains inclusion' },
  GB: { regulations: 'FCA, FCA crypto registration', taxRate: '10-20% CGT' },
  DE: { regulations: 'BaFin, BaTINV; MiCA compliant', taxRate: '25% flat + surcharge' },
  FR: { regulations: 'AMF; MiCA compliance required', taxRate: '30% flat capital gains' },
  JP: { regulations: 'FSA, JFSA; Payment Services Act', taxRate: '15-55% progressive' },
  SG: { regulations: 'MAS; Payment Services Act 2019', taxRate: '0% no capital gains tax' },
  HK: { regulations: 'SFC; VASP regime in progress', taxRate: '0% no capital gains tax' },
  AE: { regulations: 'VARA, CBUAE; DLT regulator', taxRate: '0% no income tax' },
  AU: { regulations: 'AUSTRAC, ASIC; DCE registration', taxRate: '50% CGT discount' },
}

function makeCountries(): CountryData[] {
  const highActivity = new Set(['US','SG','JP','KR','GB','DE','AU','AE','CH','HK'])
  const medActivity  = new Set(['CA','FR','NL','TR','IN','BR','RU'])
  return BASE_COUNTRIES.map(c => {
    const h = hashSeed(c.id)
    const base = highActivity.has(c.id) ? 0.7 : medActivity.has(c.id) ? 0.4 : 0.2
    const noise = ((h % 100) / 100) * 0.3
    const metric = Math.min(1, base + noise)
    const regMeta = REG_META[c.id]
    return {
      ...c,
      metric,
      volume: Math.round(metric * 8200 + (h % 500)),
      nodes: Math.round(metric * 1400 + (h % 200)),
      exchanges: Math.round(metric * 12  + (h % 5)),
      regulations: regMeta?.regulations,
      taxRate: regMeta?.taxRate,
      exchanges24h: Math.round(metric * 4.5 + (h % 3)),
    }
  })
}

const COUNTRIES = makeCountries()

const METRICS = [
  { id: 'volume',    label: 'Trading Volume', unit: '$M/day', fmt: (v: number) => `$${v.toLocaleString()}M` },
  { id: 'nodes',     label: 'Network Nodes',  unit: 'nodes',   fmt: (v: number) => v.toLocaleString() },
  { id: 'exchanges', label: 'Active Exchanges', unit: 'active',  fmt: (v: number) => String(v) },
]

interface UploadedRow { lat?: number; lng?: number; value?: number; label?: string; [k: string]: unknown }

export default function GeoExplorerPage() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [metric, setMetric] = useState('volume')
  const [hovered, setHovered] = useState<CountryData | null>(null)
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const [uploaded, setUploaded] = useState<UploadedRow[]>([])
  const [uploadField, setUploadField] = useState('')
  const [filter, setFilter] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [pulseTime, setPulseTime] = useState(0)
  const [layers, setLayers] = useState<DataLayer[]>([
    { id: 'heatmap', label: 'Heatmap', color: C.blue, enabled: true, opacity: 0.7 },
    { id: 'nodes', label: 'Nodes', color: C.mint, enabled: true, opacity: 0.8 },
    { id: 'uploaded', label: 'Custom Data', color: C.orange, enabled: true, opacity: 0.75 },
    { id: 'connections', label: 'Connections', color: C.purple, enabled: false, opacity: 0.3 },
  ])
  const [showDetail, setShowDetail] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const id = setInterval(() => setPulseTime(t => t + 1), 800)
    return () => clearInterval(id)
  }, [])

  const metaDef = METRICS.find(m => m.id === metric) ?? METRICS[0]

  const displayed = useMemo(() => COUNTRIES.filter(c =>
    (!selectedRegion || c.region === selectedRegion) &&
    (!filter || c.name.toLowerCase().includes(filter.toLowerCase()) || c.region.toLowerCase().includes(filter.toLowerCase()))
  ), [selectedRegion, filter])

  const filteredCountries = useMemo(() => {
    if (!searchQuery) return displayed
    return displayed.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.id.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [displayed, searchQuery])

  const maxVal = useMemo(() => Math.max(...displayed.map(c => c[metric as keyof CountryData] as number)), [displayed, metric])

  const zoomToRegion = useCallback((c: CountryData) => {
    setPan({ x: -(c.x + c.w / 2) / 100 * 800 * 3 + 400, y: -(c.y + c.h / 2) / 100 * 450 * 3 + 225 })
    setZoom(3)
    setSelectedCountry(c)
    setShowDetail(true)
  }, [])

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); setShowDetail(false); setSelectedCountry(null) }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(8, Math.max(0.5, z * (e.deltaY > 0 ? 0.9 : 1.1))))
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    setPan({ x: dragStart.current.px + e.clientX - dragStart.current.mx, y: dragStart.current.py + e.clientY - dragStart.current.my })
  }, [dragging])

  const onMouseUp = useCallback(() => setDragging(false), [])

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      try {
        if (f.name.endsWith('.json')) {
          const parsed = JSON.parse(text)
          setUploaded(Array.isArray(parsed) ? parsed : [parsed])
          if (Array.isArray(parsed) && parsed[0]) setUploadField(Object.keys(parsed[0]).find(k => typeof parsed[0][k] === 'number') ?? '')
        } else {
          const lines = text.split('\n').filter(l => l.trim())
          const headers = lines[0].split(',').map(h => h.trim())
          const rows: UploadedRow[] = lines.slice(1).map(line => {
            const vals = line.split(',')
            return headers.reduce((obj: UploadedRow, h, i) => ({ ...obj, [h]: isNaN(Number(vals[i])) ? vals[i] : Number(vals[i]) }), {})
          })
          setUploaded(rows)
          if (rows[0]) setUploadField(Object.keys(rows[0]).find(k => typeof rows[0][k] === 'number') ?? '')
        }
      } catch { setUploaded([]) }
    }
    reader.readAsText(f)
  }

  const regions = useMemo(() => Array.from(new Set(COUNTRIES.map(c => c.region))), [])

  function heatColor(t: number) {
    const r = Math.round(t < 0.5 ? 4 + t * 40 : 44 + (t - 0.5) * 80)
    const g = Math.round(t < 0.5 ? 16 + t * 60 : 46 + (t - 0.5) * 120)
    const b = Math.round(31 + t * 224)
    return `rgb(${r},${g},${b})`
  }

  const totalVolume = displayed.reduce((s, c) => s + c.volume, 0)
  const totalNodes = displayed.reduce((s, c) => s + c.nodes, 0)
  const totalExchanges = displayed.reduce((s, c) => s + c.exchanges, 0)
  const topRegion = (() => {
    const r: Record<string, number> = {}
    displayed.forEach(c => { r[c.region] = (r[c.region] || 0) + (c[metric as keyof CountryData] as number) })
    return Object.entries(r).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '\u2014'
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', margin: '-1.5rem', width: 'calc(100% + 3rem)', background: C.bg, color: C.text, overflow: 'hidden' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', padding: '.5rem 1rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: C.blue }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.faint, letterSpacing: '.14em' }}>GEO EXPLORER</span>
        </div>

        <div style={{ display: 'flex', gap: '.25rem' }}>
          {METRICS.map(m => (
            <button key={m.id} onClick={() => setMetric(m.id)} style={{ padding: '.25rem .55rem', borderRadius: 6, border: `1px solid ${metric === m.id ? C.blue : C.border}`, background: metric === m.id ? `${C.blue}18` : 'transparent', color: metric === m.id ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 600, cursor: 'pointer' }}>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '.2rem', flexWrap: 'wrap' }}>
          <button onClick={() => { setSelectedRegion(null); setSelectedCountry(null); setShowDetail(false) }} style={{ padding: '.2rem .45rem', borderRadius: 5, border: `1px solid ${!selectedRegion ? C.mint : C.border}`, background: !selectedRegion ? `${C.mint}14` : 'transparent', color: !selectedRegion ? C.mint : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', cursor: 'pointer' }}>All</button>
          {regions.map(r => (
            <button key={r} onClick={() => { setSelectedRegion(r === selectedRegion ? null : r); setSelectedCountry(null); setShowDetail(false) }} style={{ padding: '.2rem .45rem', borderRadius: 5, border: `1px solid ${selectedRegion === r ? C.blue : C.border}`, background: selectedRegion === r ? `${C.blue}14` : 'transparent', color: selectedRegion === r ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', cursor: 'pointer' }}>
              {r}
            </button>
          ))}
        </div>

        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search..." style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.25rem .5rem', color: C.white, fontFamily: 'var(--font-mono)', fontSize: '.58rem', outline: 'none', width: 120 }} />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '.35rem', alignItems: 'center' }}>
          {layers.map(l => (
            <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={l.enabled} onChange={e => setLayers(prev => prev.map(ll => ll.id === l.id ? { ...ll, enabled: e.target.checked } : ll))} style={{ accentColor: l.color }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: l.enabled ? l.color : C.faint }}>{l.label}</span>
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: '.25rem', padding: '.25rem .55rem', borderRadius: 6, border: `1px dashed ${C.border}`, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.muted }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            {uploaded.length > 0 ? `${uploaded.length} pts` : 'Upload'}
            <input type="file" accept=".csv,.json,.geojson" style={{ display: 'none' }} onChange={handleUpload} />
          </label>
          <button onClick={resetView} style={{ padding: '.25rem .55rem', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.55rem', cursor: 'pointer' }}>Reset</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab' }}
          onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

          <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', background: 'radial-gradient(ellipse at 50% 120%, #05142A 0%, #020B15 100%)' }}>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`} style={{ transformOrigin: '50% 50%' }}>

              {layers.find(l => l.id === 'heatmap')?.enabled && COUNTRIES.map(c => {
                const val = c[metric as keyof CountryData] as number
                const t = maxVal > 0 ? val / maxVal : 0
                const dimmed = displayed.length < COUNTRIES.length && !displayed.includes(c)
                const color = dimmed ? '#0A1828' : heatColor(t)
                const isPulse = !dimmed && t > 0.7 && pulseTime % 2 === 0
                return (
                  <g key={c.id}>
                    <rect
                      x={`${c.x}%`} y={`${c.y}%`} width={`${c.w}%`} height={`${c.h}%`}
                      fill={color} fillOpacity={dimmed ? 0.25 : (layers.find(l => l.id === 'heatmap')?.opacity ?? 0.7)}
                      stroke={hovered?.id === c.id ? C.white : C.border} strokeWidth={hovered?.id === c.id ? 1.5 / zoom : 0.5 / zoom}
                      rx={2 / zoom}
                      style={{ cursor: 'pointer', transition: 'fill-opacity 0.2s' }}
                      onMouseEnter={e => { setHovered(c); setTooltip({ x: e.clientX, y: e.clientY }) }}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => zoomToRegion(c)}
                    />
                    {layers.find(l => l.id === 'nodes')?.enabled && !dimmed && (
                      <circle
                        cx={`${c.x + c.w / 2}%`} cy={`${c.y + c.h * 0.3}%`}
                        r={Math.max(2, (c.nodes / 1500) * 6) / zoom}
                        fill={C.mint} fillOpacity={0.6}
                        style={{ filter: `drop-shadow(0 0 ${3 / zoom}px ${C.mint})`, pointerEvents: 'none' }}
                      />
                    )}
                    {isPulse && layers.find(l => l.id === 'heatmap')?.enabled && (
                      <circle cx={`${c.x + c.w / 2}%`} cy={`${c.y + c.h / 2}%`} r={3 / zoom} fill={C.blue2} fillOpacity={0.8} style={{ filter: `drop-shadow(0 0 ${4 / zoom}px ${C.blue})` }} />
                    )}
                    {c.w >= 5 && zoom >= 1 && (
                      <text x={`${c.x + c.w / 2}%`} y={`${c.y + c.h / 2 + 0.5}%`} textAnchor="middle" dominantBaseline="middle" fill={dimmed ? C.faint : C.white} fillOpacity={dimmed ? 0.3 : 0.9} fontSize={Math.max(7, 10 / zoom)} fontFamily="var(--font-mono)" fontWeight="600" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {c.id}
                      </text>
                    )}
                  </g>
                )
              })}

              {uploaded.length > 0 && uploadField && layers.find(l => l.id === 'uploaded')?.enabled && uploaded.map((row, i) => {
                const lat = row.lat ?? row.latitude
                const lng = row.lng ?? row.longitude ?? row.lon
                if (typeof lat !== 'number' || typeof lng !== 'number') return null
                const x = ((lng + 180) / 360 * 100)
                const y = ((90 - lat) / 180 * 100)
                const val = row[uploadField] as number
                const maxUpVal = Math.max(...uploaded.map(r => (r[uploadField] as number) || 0))
                const t = maxUpVal > 0 ? val / maxUpVal : 0
                return (
                  <circle key={i} cx={`${x}%`} cy={`${y}%`} r={Math.max(3, 8 * t) / zoom} fill={C.orange} fillOpacity={0.7} stroke={C.orange} strokeWidth={0.5 / zoom} style={{ cursor: 'pointer', filter: `drop-shadow(0 0 ${3 / zoom}px ${C.orange})` }} />
                )
              })}

              {layers.find(l => l.id === 'connections')?.enabled && (() => {
                const topCountries = [...displayed].sort((a, b) => (b[metric as keyof CountryData] as number) - (a[metric as keyof CountryData] as number)).slice(0, 8)
                const connections: React.ReactNode[] = []
                for (let i = 0; i < topCountries.length; i++) {
                  for (let j = i + 1; j < topCountries.length; j++) {
                    const a = topCountries[i], b = topCountries[j]
                    if (a.region === b.region || (hashSeed(a.id + b.id) % 3) === 0) {
                      connections.push(
                        <line key={`${a.id}-${b.id}`} x1={`${a.x + a.w / 2}%`} y1={`${a.y + a.h / 2}%`} x2={`${b.x + b.w / 2}%`} y2={`${b.y + b.h / 2}%`} stroke={C.purple} strokeWidth={0.3 / zoom} strokeOpacity={0.15} />
                      )
                    }
                  }
                }
                return connections
              })()}
            </g>
          </svg>

          <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {[['+'], ['-']].map(([label]) => (
              <button key={label} onClick={() => setZoom(z => Math.min(8, Math.max(0.5, z * (label === '+' ? 1.3 : 0.77))))} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg3, color: C.white, fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{label}</button>
            ))}
          </div>

          <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>
            {(zoom * 100).toFixed(0)}%  |  {displayed.length} regions  |  Click to drill down  |  Scroll to zoom  |  Drag to pan
          </div>

          <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: `${C.bg3}E0`, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.5rem .75rem', backdropFilter: 'blur(8px)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.35rem', letterSpacing: '.1em' }}>{metaDef.unit.toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>0</span>
              <div style={{ width: 80, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>MAX</span>
            </div>
          </div>
        </div>

        <div style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: C.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {showDetail && selectedCountry ? (
            <div style={{ padding: '.6rem .85rem', borderBottom: `1px solid ${C.border}`, background: `${C.bg3}80` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 700, color: C.white }}>{selectedCountry.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>{selectedCountry.region}  |  {selectedCountry.subregion || selectedCountry.region}</div>
                </div>
                <button onClick={() => { setShowDetail(false); setSelectedCountry(null) }} style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', fontSize: '1rem' }}>\u2715</button>
              </div>

              {METRICS.map(m => {
                const val = selectedCountry[m.id as keyof CountryData] as number
                const maxV = Math.max(...COUNTRIES.map(c => c[m.id as keyof CountryData] as number))
                const ratio = maxV > 0 ? val / maxV : 0
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.35rem 0', borderBottom: `1px solid ${C.border}30` }}>
                    <span style={{ fontSize: '.55rem', color: C.muted, width: 80 }}>{m.label}</span>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.bg, overflow: 'hidden' }}>
                      <div style={{ width: `${ratio * 100}%`, height: '100%', background: metric === m.id ? C.blue2 : C.faint, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: metric === m.id ? C.blue2 : C.text, fontWeight: metric === m.id ? 700 : 400 }}>{m.fmt(val)}</span>
                  </div>
                )
              })}

              {selectedCountry.regulations && (
                <div style={{ marginTop: '.5rem', padding: '.5rem', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.25rem' }}>REGULATIONS</div>
                  <div style={{ fontSize: '.58rem', color: C.text, lineHeight: 1.5 }}>{selectedCountry.regulations}</div>
                  <div style={{ fontSize: '.45rem', color: C.faint, marginTop: '.25rem', letterSpacing: '.08em' }}>TAX</div>
                  <div style={{ fontSize: '.58rem', color: C.orange }}>{selectedCountry.taxRate}</div>
                </div>
              )}
            </div>
          ) : null}

          <div style={{ padding: '.6rem .85rem', borderBottom: `1px solid ${C.border}`, flex: showDetail && selectedCountry ? '0 0 auto' : '0 0 auto' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.4rem' }}>TOP BY {metaDef.label.toUpperCase()}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              {[...displayed].sort((a, b) => (b[metric as keyof CountryData] as number) - (a[metric as keyof CountryData] as number)).slice(0, 10).map((c, i) => {
                const val = c[metric as keyof CountryData] as number
                const t = maxVal > 0 ? val / maxVal : 0
                return (
                  <button key={c.id} onClick={() => zoomToRegion(c)} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.25rem .4rem', borderRadius: 6, background: hovered?.id === c.id ? `${C.blue}12` : 'transparent', border: `1px solid ${hovered?.id === c.id ? C.blue + '30' : 'transparent'}`, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, width: 14, flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ height: 3, borderRadius: 2, background: C.bg3, marginTop: '.12rem', overflow: 'hidden' }}>
                        <div style={{ width: `${t * 100}%`, height: '100%', background: heatColor(t), transition: 'width 0.3s' }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.blue2, flexShrink: 0 }}>{metaDef.fmt(val)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {uploaded.length > 0 && (
            <div style={{ padding: '.6rem .85rem', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.orange, letterSpacing: '.1em', marginBottom: '.35rem' }}>UPLOADED  |  {uploaded.length} pts</div>
              <select value={uploadField} onChange={e => setUploadField(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.25rem .4rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.55rem', outline: 'none' }}>
                {uploaded[0] && Object.keys(uploaded[0]).filter(k => typeof uploaded[0][k] === 'number').map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          )}

          <div style={{ padding: '.6rem .85rem', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.35rem' }}>GLOBAL STATS</div>
            {[
              { label: 'Active Regions', value: displayed.length },
              { label: `Total ${metaDef.label}`, value: metaDef.fmt(totalVolume) },
              { label: 'Top Region', value: topRegion },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '.15rem 0', borderBottom: `1px solid ${C.border}30` }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>{s.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.white }}>{String(s.value)}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '.6rem .85rem', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.35rem' }}>HOW TO USE</div>
            {[
              '**Scroll** to zoom in/out on any region',
              '**Drag** the map to pan around',
              '**Click** a country to see regulations & drill down',
              '**Upload CSV/JSON/GeoJSON** to overlay your own data',
              'Switch **layers** to toggle heatmap, nodes, connections',
              '**Filter by region** to isolate a continent',
            ].map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: '.3rem', marginBottom: '.3rem' }}>
                <span style={{ color: C.blue, flexShrink: 0 }}>\u25B8</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.muted, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: tip.replace(/\*\*(.*?)\*\*/g, '<strong style="color:' + C.white + '">$1</strong>') }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {hovered && !showDetail && (
        <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '.6rem .85rem', pointerEvents: 'none', zIndex: 999, minWidth: 180, boxShadow: `0 8px 24px rgba(0,0,0,0.5)` }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, color: C.white, marginBottom: '.35rem' }}>{hovered.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.5rem' }}>{hovered.region}  |  {hovered.subregion || hovered.region}</div>
          {METRICS.map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.1rem 0' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.muted }}>{m.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: metric === m.id ? C.blue2 : C.text, fontWeight: metric === m.id ? 700 : 400 }}>{m.fmt(hovered[m.id as keyof CountryData] as number)}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  )
}