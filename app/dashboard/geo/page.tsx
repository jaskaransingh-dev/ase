'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

export const dynamic = 'force-dynamic'

const C = {
  bg: '#04101C', bg2: '#06111F', bg3: '#0B1728', border: '#1E2A3D',
  blue: '#4F8CFF', blue2: '#6BA3FF', mint: '#16C784', red: '#FF5468',
  orange: '#F5B942', text: '#B7C4D5', muted: '#7F8CA3', faint: '#3A5070', white: '#F7FAFF',
}

interface CountryData {
  id: string; name: string; region: string
  x: number; y: number; w: number; h: number  // % of map
  metric: number; nodes: number; volume: number; exchanges: number
  lat: number; lng: number
}

// Simplified world map regions as percentage coordinates on a Mercator projection
const BASE_COUNTRIES: Omit<CountryData, 'metric' | 'nodes' | 'volume' | 'exchanges'>[] = [
  { id: 'US',  name: 'United States',    region: 'Americas',   x:  4, y: 20, w: 17, h: 14, lat: 37,  lng: -100 },
  { id: 'CA',  name: 'Canada',           region: 'Americas',   x:  4, y:  8, w: 18, h: 11, lat: 56,  lng: -96  },
  { id: 'MX',  name: 'Mexico',           region: 'Americas',   x:  7, y: 31, w:  8, h:  7, lat: 24,  lng: -102 },
  { id: 'BR',  name: 'Brazil',           region: 'Americas',   x: 14, y: 38, w: 12, h: 14, lat: -9,  lng: -53  },
  { id: 'AR',  name: 'Argentina',        region: 'Americas',   x: 13, y: 51, w:  7, h: 10, lat: -35, lng: -66  },
  { id: 'GB',  name: 'United Kingdom',   region: 'Europe',     x: 43, y: 13, w:  3, h:  4, lat: 54,  lng: -2   },
  { id: 'DE',  name: 'Germany',          region: 'Europe',     x: 47, y: 14, w:  4, h:  4, lat: 51,  lng: 10   },
  { id: 'FR',  name: 'France',           region: 'Europe',     x: 45, y: 16, w:  4, h:  4, lat: 46,  lng: 2    },
  { id: 'NL',  name: 'Netherlands',      region: 'Europe',     x: 47, y: 12, w:  2, h:  2, lat: 52,  lng: 5    },
  { id: 'CH',  name: 'Switzerland',      region: 'Europe',     x: 47, y: 16, w:  2, h:  2, lat: 47,  lng: 8    },
  { id: 'RU',  name: 'Russia',           region: 'Eurasia',    x: 50, y:  5, w: 30, h: 14, lat: 62,  lng: 96   },
  { id: 'TR',  name: 'Turkey',           region: 'Eurasia',    x: 52, y: 20, w:  6, h:  4, lat: 39,  lng: 35   },
  { id: 'CN',  name: 'China',            region: 'Asia',       x: 63, y: 17, w: 16, h: 14, lat: 35,  lng: 104  },
  { id: 'IN',  name: 'India',            region: 'Asia',       x: 62, y: 24, w:  8, h: 10, lat: 21,  lng: 79   },
  { id: 'JP',  name: 'Japan',            region: 'Asia',       x: 80, y: 17, w:  4, h:  6, lat: 37,  lng: 138  },
  { id: 'KR',  name: 'South Korea',      region: 'Asia',       x: 78, y: 19, w:  3, h:  4, lat: 36,  lng: 128  },
  { id: 'SG',  name: 'Singapore',        region: 'Asia',       x: 71, y: 34, w:  2, h:  2, lat: 1,   lng: 104  },
  { id: 'HK',  name: 'Hong Kong',        region: 'Asia',       x: 75, y: 27, w:  2, h:  2, lat: 22,  lng: 114  },
  { id: 'AE',  name: 'UAE',              region: 'Middle East',x: 59, y: 27, w:  3, h:  3, lat: 24,  lng: 54   },
  { id: 'NG',  name: 'Nigeria',          region: 'Africa',     x: 46, y: 34, w:  5, h:  6, lat: 9,   lng: 8    },
  { id: 'ZA',  name: 'South Africa',     region: 'Africa',     x: 49, y: 50, w:  5, h:  6, lat: -29, lng: 25   },
  { id: 'KE',  name: 'Kenya',            region: 'Africa',     x: 53, y: 37, w:  3, h:  4, lat: 1,   lng: 38   },
  { id: 'AU',  name: 'Australia',        region: 'Oceania',    x: 71, y: 44, w: 15, h: 12, lat: -27, lng: 133  },
]

// Generate crypto metrics (deterministic from id hash)
function hashSeed(s: string) { return s.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 17) }
function makeCountries(): CountryData[] {
  const highActivity = new Set(['US','SG','JP','KR','GB','DE','AU','AE','CH','HK'])
  const medActivity  = new Set(['CA','FR','NL','TR','IN','BR','RU'])
  return BASE_COUNTRIES.map(c => {
    const h = hashSeed(c.id)
    const base = highActivity.has(c.id) ? 0.7 : medActivity.has(c.id) ? 0.4 : 0.2
    const noise = ((h % 100) / 100) * 0.3
    const metric = Math.min(1, base + noise)
    return {
      ...c,
      metric,
      volume:    Math.round(metric * 8200 + (h % 500)),
      nodes:     Math.round(metric * 1400 + (h % 200)),
      exchanges: Math.round(metric * 12  + (h % 5)),
    }
  })
}

const COUNTRIES = makeCountries()

const METRICS = [
  { id: 'volume',    label: 'Trading Volume', unit: '$M/day', fmt: (v: number) => `$${v.toLocaleString()}M` },
  { id: 'nodes',     label: 'Network Nodes',  unit: 'nodes',   fmt: (v: number) => v.toLocaleString() },
  { id: 'exchanges', label: 'Exchanges',       unit: 'active',  fmt: (v: number) => String(v) },
]

function heatColor(t: number) {
  // t: 0=cold(dark blue), 1=hot(bright blue/cyan)
  const r = Math.round(t < 0.5 ? 4 + t * 40 : 44 + (t - 0.5) * 80)
  const g = Math.round(t < 0.5 ? 16 + t * 60 : 46 + (t - 0.5) * 120)
  const b = Math.round(31 + t * 224)
  return `rgb(${r},${g},${b})`
}

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
  const [showGrid, setShowGrid] = useState(true)
  const [pulseTime, setPulseTime] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setPulseTime(t => t + 1), 800)
    return () => clearInterval(id)
  }, [])

  const metaDef = METRICS.find(m => m.id === metric) ?? METRICS[0]

  const displayed = useMemo(() => COUNTRIES.filter(c =>
    (!selectedRegion || c.region === selectedRegion) &&
    (!filter || c.name.toLowerCase().includes(filter.toLowerCase()) || c.region.toLowerCase().includes(filter.toLowerCase()))
  ), [selectedRegion, filter])

  const maxVal = useMemo(() => Math.max(...displayed.map(c => c[metric as keyof CountryData] as number)), [displayed, metric])

  // Zoom to region
  const zoomToRegion = useCallback((c: CountryData) => {
    const targetZoom = 3
    const centerX = -(c.x + c.w / 2) / 100 * 800 * targetZoom + 400
    const centerY = -(c.y + c.h / 2) / 100 * 450 * targetZoom + 225
    setPan({ x: centerX, y: centerY })
    setZoom(targetZoom)
  }, [])

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

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

  // Handle CSV/JSON upload
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', margin: '-1.5rem', width: 'calc(100% + 3rem)', background: C.bg, color: C.text, overflow: 'hidden' }}>

      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.5rem 1rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: C.blue }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.faint, letterSpacing: '.14em' }}>GEO EXPLORER</span>
        </div>

        {/* Metric selector */}
        <div style={{ display: 'flex', gap: '.3rem' }}>
          {METRICS.map(m => (
            <button key={m.id} onClick={() => setMetric(m.id)} style={{ padding: '.28rem .65rem', borderRadius: 6, border: `1px solid ${metric === m.id ? C.blue : C.border}`, background: metric === m.id ? `${C.blue}18` : 'transparent', color: metric === m.id ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600, cursor: 'pointer' }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Region filter */}
        <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
          <button onClick={() => setSelectedRegion(null)} style={{ padding: '.22rem .5rem', borderRadius: 5, border: `1px solid ${!selectedRegion ? C.mint : C.border}`, background: !selectedRegion ? `${C.mint}14` : 'transparent', color: !selectedRegion ? C.mint : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem', cursor: 'pointer' }}>All</button>
          {regions.map(r => (
            <button key={r} onClick={() => setSelectedRegion(r === selectedRegion ? null : r)} style={{ padding: '.22rem .5rem', borderRadius: 5, border: `1px solid ${selectedRegion === r ? C.blue : C.border}`, background: selectedRegion === r ? `${C.blue}14` : 'transparent', color: selectedRegion === r ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem', cursor: 'pointer' }}>
              {r}
            </button>
          ))}
        </div>

        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search country…" style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.3rem .65rem', color: C.white, fontFamily: 'var(--font-mono)', fontSize: '.62rem', outline: 'none', width: 160 }} />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} style={{ accentColor: C.blue }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.faint }}>Grid</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.28rem .65rem', borderRadius: 6, border: `1px dashed ${C.border}`, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.muted }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            {uploaded.length > 0 ? `${uploaded.length} rows` : 'Upload CSV/JSON'}
            <input type="file" accept=".csv,.json" style={{ display: 'none' }} onChange={handleUpload} />
          </label>
          <button onClick={resetView} style={{ padding: '.28rem .65rem', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer' }}>Reset View</button>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab' }}
          onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

          <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', background: 'radial-gradient(ellipse at 50% 120%, #05142A 0%, #020B15 100%)' }}>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`} style={{ transformOrigin: '50% 50%' }}>

              {/* Ocean grid */}
              {showGrid && Array.from({ length: 40 }, (_, i) =>
                <line key={`v${i}`} x1={`${i * 2.5}%`} y1="0" x2={`${i * 2.5}%`} y2="100%" stroke={`${C.faint}18`} strokeWidth={0.5 / zoom} />
              )}
              {showGrid && Array.from({ length: 20 }, (_, i) =>
                <line key={`h${i}`} x1="0" y1={`${i * 5}%`} x2="100%" y2={`${i * 5}%`} stroke={`${C.faint}18`} strokeWidth={0.5 / zoom} />
              )}

              {/* Countries */}
              {COUNTRIES.map(c => {
                const val = c[metric as keyof CountryData] as number
                const t = maxVal > 0 ? val / maxVal : 0
                const dimmed = displayed.length < COUNTRIES.length && !displayed.includes(c)
                const color = dimmed ? '#0A1828' : heatColor(t)
                const isPulse = !dimmed && t > 0.7 && pulseTime % 2 === 0
                return (
                  <g key={c.id}>
                    <rect
                      x={`${c.x}%`} y={`${c.y}%`} width={`${c.w}%`} height={`${c.h}%`}
                      fill={color} fillOpacity={dimmed ? 0.25 : 0.7}
                      stroke={hovered?.id === c.id ? C.white : C.border} strokeWidth={hovered?.id === c.id ? 1.5 / zoom : 0.5 / zoom}
                      rx={2 / zoom}
                      style={{ cursor: 'pointer', transition: 'fill-opacity 0.2s' }}
                      onMouseEnter={e => { setHovered(c); setTooltip({ x: e.clientX, y: e.clientY }) }}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => zoomToRegion(c)}
                    />
                    {/* Pulse dot for high-activity countries */}
                    {isPulse && (
                      <circle
                        cx={`${c.x + c.w / 2}%`} cy={`${c.y + c.h / 2}%`}
                        r={3 / zoom} fill={C.blue2} fillOpacity={0.8}
                        style={{ filter: `drop-shadow(0 0 ${4/zoom}px ${C.blue})` }}
                      />
                    )}
                    {/* Country label */}
                    {c.w >= 5 && zoom >= 1 && (
                      <text
                        x={`${c.x + c.w / 2}%`} y={`${c.y + c.h / 2 + 0.5}%`}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={dimmed ? C.faint : C.white} fillOpacity={dimmed ? 0.3 : 0.9}
                        fontSize={Math.max(7, 10 / zoom)} fontFamily="var(--font-mono)" fontWeight="600"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {c.id}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Uploaded data overlay */}
              {uploaded.length > 0 && uploadField && uploaded.map((row, i) => {
                const lat = row.lat ?? row.latitude
                const lng = row.lng ?? row.longitude ?? row.lon
                if (typeof lat !== 'number' || typeof lng !== 'number') return null
                const x = ((lng + 180) / 360 * 100)
                const y = ((90 - lat) / 180 * 100)
                const val = row[uploadField] as number
                const maxUpVal = Math.max(...uploaded.map(r => (r[uploadField] as number) || 0))
                const t = maxUpVal > 0 ? val / maxUpVal : 0
                return (
                  <circle key={i}
                    cx={`${x}%`} cy={`${y}%`}
                    r={Math.max(3, 8 * t) / zoom}
                    fill={C.orange} fillOpacity={0.7}
                    stroke={C.orange} strokeWidth={0.5 / zoom}
                    style={{ cursor: 'pointer', filter: `drop-shadow(0 0 ${3/zoom}px ${C.orange})` }}
                  />
                )
              })}
            </g>
          </svg>

          {/* Zoom controls */}
          <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {[['+',-1],['-',1]].map(([label, dir]) => (
              <button key={label as string} onClick={() => setZoom(z => Math.min(8, Math.max(0.5, z * (dir === -1 ? 1.3 : 0.77))))} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg3, color: C.white, fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{label}</button>
            ))}
          </div>

          {/* Zoom indicator */}
          <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>
            {(zoom * 100).toFixed(0)}% · drag to pan · scroll to zoom · click country to focus
          </div>

          {/* Color legend */}
          <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: `${C.bg3}E0`, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.5rem .75rem', backdropFilter: 'blur(8px)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.35rem', letterSpacing: '.1em' }}>{metaDef.unit.toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>0</span>
              <div style={{ width: 80, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>MAX</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: C.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '.6rem .85rem', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.4rem' }}>TOP BY {metaDef.label.toUpperCase()}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
              {[...displayed].sort((a, b) => (b[metric as keyof CountryData] as number) - (a[metric as keyof CountryData] as number)).slice(0, 12).map((c, i) => {
                const val = c[metric as keyof CountryData] as number
                const t = maxVal > 0 ? val / maxVal : 0
                return (
                  <button key={c.id} onClick={() => zoomToRegion(c)} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.3rem .45rem', borderRadius: 6, background: hovered?.id === c.id ? `${C.blue}12` : 'transparent', border: `1px solid ${hovered?.id === c.id ? C.blue + '30' : 'transparent'}`, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, width: 14, flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ height: 3, borderRadius: 2, background: C.bg3, marginTop: '.15rem', overflow: 'hidden' }}>
                        <div style={{ width: `${t * 100}%`, height: '100%', background: heatColor(t), transition: 'width 0.3s' }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: C.blue2, flexShrink: 0 }}>{metaDef.fmt(val)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {uploaded.length > 0 && (
            <div style={{ padding: '.6rem .85rem', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.orange, letterSpacing: '.1em', marginBottom: '.35rem' }}>UPLOADED DATA · {uploaded.length} pts</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.muted, marginBottom: '.3rem' }}>Field for size:</div>
              <select value={uploadField} onChange={e => setUploadField(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.28rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none' }}>
                {uploaded[0] && Object.keys(uploaded[0]).filter(k => typeof uploaded[0][k] === 'number').map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          )}

          <div style={{ padding: '.6rem .85rem', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.35rem' }}>GLOBAL STATS</div>
            {[
              { label: 'Active Countries', value: displayed.length },
              { label: `Total ${metaDef.label}`, value: metaDef.fmt(displayed.reduce((s, c) => s + (c[metric as keyof CountryData] as number), 0)) },
              { label: 'Top Region', value: (() => { const r: Record<string,number> = {}; displayed.forEach(c => { r[c.region] = (r[c.region]||0) + (c[metric as keyof CountryData] as number) }); return Object.entries(r).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '—' })() },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '.2rem 0', borderBottom: `1px solid ${C.border}30` }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.faint }}>{s.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.white }}>{String(s.value)}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '.6rem .85rem', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.35rem' }}>HOW TO USE</div>
            {[
              '**Scroll** to zoom in/out on any region',
              '**Drag** the map to pan around',
              '**Click** a country to focus on it',
              '**Upload CSV/JSON** with lat/lng columns to overlay your own data',
              'Switch **metrics** to compare trading volume, nodes, or exchange counts',
              '**Filter by region** to isolate a continent',
            ].map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: '.3rem', marginBottom: '.3rem' }}>
                <span style={{ color: C.blue, flexShrink: 0 }}>·</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.muted, lineHeight: 1.5 }}>{tip.replace(/\*\*(.*?)\*\*/g, '$1')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '.6rem .85rem', pointerEvents: 'none', zIndex: 999, minWidth: 180, boxShadow: `0 8px 24px rgba(0,0,0,0.5)` }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, color: C.white, marginBottom: '.35rem' }}>{hovered.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, marginBottom: '.5rem' }}>{hovered.region}</div>
          {METRICS.map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.1rem 0' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.muted }}>{m.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: metric === m.id ? C.blue2 : C.text, fontWeight: metric === m.id ? 700 : 400 }}>{m.fmt(hovered[m.id as keyof CountryData] as number)}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  )
}
