'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

export const dynamic = 'force-dynamic'

const C = {
  bg: '#030B14', bg2: '#050F1C', bg3: '#0A1828', bg4: '#0D1F30',
  border: '#112236', border2: '#1A3050',
  orange: '#FF8C00', orange2: '#FFA500',
  green: '#00FF41', green2: '#39FF14',
  red: '#FF3040', red2: '#FF6070',
  blue: '#00BFFF', blue2: '#4FC3F7',
  yellow: '#FFD700', amber: '#FFC107',
  text: '#B0C4D8', muted: '#607080', faint: '#304050',
  white: '#E8F4FF',
  mint: '#16C784', purple: '#8B5CF6',
}

// ── Tile map helpers ──────────────────────────────────────────────────────────

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) }
}

function tileToLatLng(tx: number, ty: number, zoom: number) {
  const n = Math.pow(2, zoom)
  const lng = tx / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n)))
  return { lat: latRad * 180 / Math.PI, lng }
}

const TILE_SIZE = 256

const TILE_PROVIDERS: Record<string, string> = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  dark:      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  terrain:   'https://tile.opentopomap.org/{z}/{x}/{y}.png',
}

// ── Commodity infrastructure data ────────────────────────────────────────────

interface CommodityPoint {
  id: string; name: string; type: 'oil' | 'gas' | 'mine' | 'refinery' | 'exchange' | 'lng' | 'pipeline'
  lat: number; lng: number
  value?: string; country?: string; capacity?: string; notes?: string
}

const COMMODITY_POINTS: CommodityPoint[] = [
  // Oil fields
  { id: 'ghawar',   name: 'Ghawar Oil Field',      type: 'oil',      lat: 25.1,  lng: 49.5,  country: 'Saudi Arabia',  capacity: '3.8M bbl/day', notes: 'Largest oil field in the world' },
  { id: 'prudhoe',  name: 'Prudhoe Bay',            type: 'oil',      lat: 70.3,  lng: -148.5, country: 'USA',           capacity: '0.5M bbl/day', notes: 'Largest North American oil field' },
  { id: 'burgan',   name: 'Burgan Field',           type: 'oil',      lat: 29.0,  lng: 47.9,  country: 'Kuwait',        capacity: '1.7M bbl/day', notes: '2nd largest oil field' },
  { id: 'rumaila',  name: 'Rumaila Field',          type: 'oil',      lat: 30.2,  lng: 47.5,  country: 'Iraq',          capacity: '1.4M bbl/day', notes: 'Iraq largest' },
  { id: 'cantarell', name: 'Cantarell Complex',     type: 'oil',      lat: 19.7,  lng: -91.8, country: 'Mexico',        capacity: '0.4M bbl/day', notes: 'Gulf of Mexico' },
  { id: 'permian',  name: 'Permian Basin',          type: 'oil',      lat: 31.9,  lng: -102.5, country: 'USA',          capacity: '5.8M bbl/day', notes: 'Largest US producing basin' },
  { id: 'eagle_ford', name: 'Eagle Ford',           type: 'oil',      lat: 28.5,  lng: -99.0, country: 'USA',           capacity: '1.1M bbl/day' },
  { id: 'north_sea', name: 'North Sea Fields',      type: 'oil',      lat: 58.0,  lng: 2.0,   country: 'UK/Norway',     capacity: '2.0M bbl/day', notes: 'Brent crude benchmark' },
  { id: 'vaca_muerta', name: 'Vaca Muerta',         type: 'oil',      lat: -38.5, lng: -69.5, country: 'Argentina',     capacity: '0.6M bbl/day', notes: 'Major shale play' },
  { id: 'kashagan', name: 'Kashagan Field',         type: 'oil',      lat: 45.4,  lng: 51.0,  country: 'Kazakhstan',    capacity: '0.4M bbl/day', notes: 'Largest discovery since 1968' },
  // Natural gas
  { id: 'south_pars', name: 'South Pars/North Dome', type: 'gas',    lat: 27.0,  lng: 52.2,  country: 'Iran/Qatar',    capacity: '700 BCF/yr',   notes: 'Largest gas field globally' },
  { id: 'urengoy',  name: 'Urengoy Gas Field',      type: 'gas',      lat: 65.9,  lng: 78.2,  country: 'Russia',        capacity: '530 BCF/yr' },
  { id: 'groningen', name: 'Groningen Field',       type: 'gas',      lat: 53.3,  lng: 6.8,   country: 'Netherlands',   notes: 'Major European gas field' },
  { id: 'marcellus', name: 'Marcellus Shale',       type: 'gas',      lat: 41.0,  lng: -77.0, country: 'USA',           capacity: '35 BCF/day' },
  // LNG terminals
  { id: 'ras_laffan', name: 'Ras Laffan LNG',       type: 'lng',     lat: 25.9,  lng: 51.5,  country: 'Qatar',         capacity: '77 MTPA',      notes: 'World\'s largest LNG complex' },
  { id: 'darwin_lng', name: 'Darwin LNG',            type: 'lng',     lat: -12.4, lng: 130.9, country: 'Australia',     capacity: '3.6 MTPA' },
  { id: 'sabine_pass', name: 'Sabine Pass LNG',      type: 'lng',     lat: 29.7,  lng: -93.9, country: 'USA',           capacity: '30 MTPA',      notes: 'Largest US LNG export' },
  { id: 'gate_lng', name: 'Gate LNG Terminal',       type: 'lng',     lat: 51.9,  lng: 4.1,   country: 'Netherlands',   notes: 'Major European import' },
  // Refineries
  { id: 'jamnagar', name: 'Jamnagar Refinery',       type: 'refinery', lat: 22.5, lng: 70.1,  country: 'India',         capacity: '1.24M bbl/day', notes: 'World\'s largest refinery' },
  { id: 'sk_energy', name: 'SK Energy Refinery',     type: 'refinery', lat: 37.4, lng: 127.0, country: 'S. Korea',      capacity: '0.84M bbl/day' },
  { id: 'port_arthur', name: 'Port Arthur Refinery', type: 'refinery', lat: 29.9, lng: -93.9, country: 'USA',           capacity: '0.60M bbl/day' },
  // Mining
  { id: 'escondida', name: 'Escondida Copper Mine',  type: 'mine',    lat: -24.3, lng: -69.1, country: 'Chile',         capacity: '1.2M tonnes/yr', notes: 'World\'s largest copper mine' },
  { id: 'tenke',    name: 'Tenke Fungurume',          type: 'mine',    lat: -10.6, lng: 26.1,  country: 'DRC',           capacity: '200K tonnes/yr', notes: 'Major cobalt/copper mine' },
  { id: 'grasberg', name: 'Grasberg Mine',            type: 'mine',    lat: -4.05, lng: 137.1, country: 'Indonesia',     capacity: '0.8M oz Au/yr', notes: 'Largest gold mine by production' },
  { id: 'super_pit', name: 'Super Pit Gold Mine',     type: 'mine',    lat: -30.8, lng: 121.5, country: 'Australia',     capacity: '700K oz Au/yr' },
  { id: 'norilsk',  name: 'Norilsk Nickel',           type: 'mine',    lat: 69.3,  lng: 88.2,  country: 'Russia',        capacity: '200K tonnes Ni/yr', notes: 'Largest nickel/palladium producer' },
  // Commodity exchanges
  { id: 'nymex',   name: 'NYMEX (CME)',               type: 'exchange', lat: 40.7, lng: -74.0, country: 'USA',           notes: 'WTI crude, NG futures' },
  { id: 'ice_london', name: 'ICE Futures Europe',     type: 'exchange', lat: 51.5, lng: -0.1,  country: 'UK',            notes: 'Brent crude benchmark' },
  { id: 'lme',     name: 'London Metal Exchange',      type: 'exchange', lat: 51.5, lng: -0.09, country: 'UK',            notes: 'Base metals pricing' },
  { id: 'tocom',   name: 'TOCOM',                      type: 'exchange', lat: 35.7, lng: 139.7, country: 'Japan',         notes: 'Asian commodity futures' },
  { id: 'dce',     name: 'Dalian Commodity Exchange',  type: 'exchange', lat: 38.9, lng: 121.6, country: 'China',         notes: 'Iron ore, soy, plastics' },
  // Pipelines
  { id: 'nord_stream', name: 'Nord Stream',            type: 'pipeline', lat: 57.0, lng: 18.0,  country: 'Russia→EU',     notes: 'Major EU gas supply' },
  { id: 'keystone',   name: 'Keystone Pipeline',       type: 'pipeline', lat: 45.0, lng: -100.0, country: 'Canada→USA',   notes: 'Oil sands transport' },
]

const TYPE_COLORS: Record<string, string> = {
  oil:      '#FF8C00',
  gas:      '#00BFFF',
  mine:     '#FFD700',
  refinery: '#FF4080',
  exchange: '#00FF41',
  lng:      '#8B5CF6',
  pipeline: '#40E0D0',
}

const TYPE_ICONS: Record<string, string> = {
  oil:      '⛽',
  gas:      '💨',
  mine:     '⛏',
  refinery: '🏭',
  exchange: '📊',
  lng:      '🚢',
  pipeline: '—',
}

// ── Commodity price state ─────────────────────────────────────────────────────

interface CommodityPrice {
  symbol: string; name: string; price: number | null; change: number | null; unit: string
}

const COMMODITIES: CommodityPrice[] = [
  { symbol: 'CL=F',  name: 'Crude Oil (WTI)',  price: null, change: null, unit: '/bbl' },
  { symbol: 'BZ=F',  name: 'Brent Crude',      price: null, change: null, unit: '/bbl' },
  { symbol: 'NG=F',  name: 'Natural Gas',       price: null, change: null, unit: '/MMBtu' },
  { symbol: 'GC=F',  name: 'Gold',              price: null, change: null, unit: '/oz' },
  { symbol: 'SI=F',  name: 'Silver',            price: null, change: null, unit: '/oz' },
  { symbol: 'HG=F',  name: 'Copper',            price: null, change: null, unit: '/lb' },
  { symbol: 'PL=F',  name: 'Platinum',          price: null, change: null, unit: '/oz' },
  { symbol: 'PA=F',  name: 'Palladium',         price: null, change: null, unit: '/oz' },
  { symbol: 'ZC=F',  name: 'Corn',              price: null, change: null, unit: '/bu' },
  { symbol: 'ZW=F',  name: 'Wheat',             price: null, change: null, unit: '/bu' },
]

// ── Map view state ────────────────────────────────────────────────────────────

interface TileKey { x: number; y: number; z: number }

function tileUrl(provider: string, x: number, y: number, z: number): string {
  const subdomains = ['a', 'b', 'c']
  const s = subdomains[(x + y) % subdomains.length]
  return TILE_PROVIDERS[provider]
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{s}', s)
}

// ── World country centroids for heatmap overlay ───────────────────────────────

const COUNTRY_DATA = [
  { id: 'US', name: 'United States',  lat: 38,   lng: -97,   oil: 12.9, gas: 934, gold: 0,   risk: 0.2 },
  { id: 'SA', name: 'Saudi Arabia',   lat: 24,   lng: 45,    oil: 9.9,  gas: 114, gold: 0,   risk: 0.4 },
  { id: 'RU', name: 'Russia',         lat: 60,   lng: 90,    oil: 9.9,  gas: 638, gold: 10.3, risk: 0.8 },
  { id: 'CA', name: 'Canada',         lat: 56,   lng: -96,   oil: 4.8,  gas: 185, gold: 5.5, risk: 0.2 },
  { id: 'IQ', name: 'Iraq',           lat: 33,   lng: 44,    oil: 4.5,  gas: 10,  gold: 0,   risk: 0.7 },
  { id: 'CN', name: 'China',          lat: 35,   lng: 104,   oil: 4.0,  gas: 219, gold: 7.0, risk: 0.4 },
  { id: 'AE', name: 'UAE',            lat: 24,   lng: 54,    oil: 3.7,  gas: 55,  gold: 0,   risk: 0.3 },
  { id: 'KW', name: 'Kuwait',         lat: 29,   lng: 48,    oil: 2.6,  gas: 18,  gold: 0,   risk: 0.4 },
  { id: 'IR', name: 'Iran',           lat: 32,   lng: 53,    oil: 3.8,  gas: 256, gold: 0,   risk: 0.9 },
  { id: 'BR', name: 'Brazil',         lat: -9,   lng: -53,   oil: 3.7,  gas: 23,  gold: 3.0, risk: 0.4 },
  { id: 'NO', name: 'Norway',         lat: 62,   lng: 10,    oil: 1.8,  gas: 117, gold: 0,   risk: 0.1 },
  { id: 'KZ', name: 'Kazakhstan',     lat: 48,   lng: 66,    oil: 1.7,  gas: 33,  gold: 4.0, risk: 0.5 },
  { id: 'QA', name: 'Qatar',          lat: 25,   lng: 51,    oil: 1.8,  gas: 177, gold: 0,   risk: 0.3 },
  { id: 'NG', name: 'Nigeria',        lat: 10,   lng: 8,     oil: 1.4,  gas: 49,  gold: 0,   risk: 0.7 },
  { id: 'AU', name: 'Australia',      lat: -27,  lng: 133,   oil: 0.4,  gas: 156, gold: 10.0, risk: 0.1 },
  { id: 'MX', name: 'Mexico',         lat: 23,   lng: -102,  oil: 1.9,  gas: 30,  gold: 3.1, risk: 0.5 },
  { id: 'VE', name: 'Venezuela',      lat: 8,    lng: -66,   oil: 0.8,  gas: 27,  gold: 0,   risk: 0.9 },
  { id: 'LY', name: 'Libya',          lat: 26,   lng: 17,    oil: 1.2,  gas: 11,  gold: 0,   risk: 0.8 },
  { id: 'GB', name: 'UK',             lat: 53,   lng: -2,    oil: 1.0,  gas: 40,  gold: 0,   risk: 0.1 },
  { id: 'IN', name: 'India',          lat: 20,   lng: 79,    oil: 0.8,  gas: 31,  gold: 0,   risk: 0.3 },
  { id: 'CL', name: 'Chile',          lat: -35,  lng: -71,   oil: 0,    gas: 0,   gold: 0.5, risk: 0.2 },
  { id: 'ZA', name: 'South Africa',   lat: -29,  lng: 25,    oil: 0,    gas: 0,   gold: 8.0, risk: 0.4 },
  { id: 'ID', name: 'Indonesia',      lat: -5,   lng: 120,   oil: 0.8,  gas: 65,  gold: 3.0, risk: 0.4 },
  { id: 'AR', name: 'Argentina',      lat: -35,  lng: -66,   oil: 0.7,  gas: 40,  gold: 0,   risk: 0.6 },
  { id: 'CD', name: 'DR Congo',       lat: -4,   lng: 25,    oil: 0,    gas: 0,   gold: 2.0, risk: 0.8 },
  { id: 'JP', name: 'Japan',          lat: 36,   lng: 138,   oil: 0,    gas: 0,   gold: 0,   risk: 0.1 },
  { id: 'SG', name: 'Singapore',      lat: 1,    lng: 104,   oil: 0,    gas: 0,   gold: 0,   risk: 0.1 },
]

export default function GeoTerminal() {
  // ── Map state
  const [mapCenter, setMapCenter] = useState({ lat: 30, lng: 10 })
  const [zoom, setZoom] = useState(3)
  const [mapProvider, setMapProvider] = useState<'satellite' | 'dark' | 'terrain'>('satellite')
  const [viewMode, setViewMode] = useState<'map' | 'globe'>('map')
  const mapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, lat: 30, lng: 10 })
  const [mapSize, setMapSize] = useState({ w: 800, h: 600 })

  // ── Overlay state
  const [layers, setLayers] = useState({
    oil: true, gas: true, mine: true, refinery: false, exchange: true, lng: true, pipeline: false,
  })
  const [selectedPoint, setSelectedPoint] = useState<CommodityPoint | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [showCountryOverlay, setShowCountryOverlay] = useState(true)
  const [overlayMetric, setOverlayMetric] = useState<'oil' | 'gas' | 'gold' | 'risk'>('oil')

  // ── Data state
  const [prices, setPrices] = useState<CommodityPrice[]>(COMMODITIES)
  const [priceLoading, setPriceLoading] = useState(true)
  const [activePanel, setActivePanel] = useState<'detail' | 'countries' | 'markets'>('markets')
  const [ticker, setTicker] = useState(0)

  // ── Tile grid computation
  const tiles = useMemo(() => {
    if (viewMode !== 'map') return []
    const result: TileKey[] = []
    const { x: cx, y: cy } = latLngToTile(mapCenter.lat, mapCenter.lng, zoom)
    const tilesX = Math.ceil(mapSize.w / TILE_SIZE) + 2
    const tilesY = Math.ceil(mapSize.h / TILE_SIZE) + 2
    const n = Math.pow(2, zoom)
    for (let dy = -Math.floor(tilesY / 2) - 1; dy <= Math.ceil(tilesY / 2) + 1; dy++) {
      for (let dx = -Math.floor(tilesX / 2) - 1; dx <= Math.ceil(tilesX / 2) + 1; dx++) {
        const tx = ((cx + dx) % n + n) % n
        const ty = Math.max(0, Math.min(n - 1, cy + dy))
        result.push({ x: tx, y: ty, z: zoom })
      }
    }
    return result
  }, [mapCenter, zoom, mapSize, viewMode])

  // ── Convert lat/lng → pixel position on the current map view
  const latLngToPixel = useCallback((lat: number, lng: number) => {
    const { x: cx, y: cy } = latLngToTile(mapCenter.lat, mapCenter.lng, zoom)
    const { x: px, y: py } = latLngToTile(lat, lng, zoom)
    const screenX = mapSize.w / 2 + (px - cx) * TILE_SIZE + (lat === mapCenter.lat && lng === mapCenter.lng ? 0 : 0)

    const n = Math.pow(2, zoom)
    const latRadC = mapCenter.lat * Math.PI / 180
    const latRadP = lat * Math.PI / 180
    const centerY = (1 - Math.log(Math.tan(latRadC) + 1 / Math.cos(latRadC)) / Math.PI) / 2 * n * TILE_SIZE
    const pointY  = (1 - Math.log(Math.tan(latRadP) + 1 / Math.cos(latRadP)) / Math.PI) / 2 * n * TILE_SIZE
    const screenY = mapSize.h / 2 + (pointY - centerY)

    const lngDiff  = lng - mapCenter.lng
    const adjustedX = mapSize.w / 2 + lngDiff / 360 * Math.pow(2, zoom) * TILE_SIZE
    return { x: adjustedX, y: screenY }
  }, [mapCenter, zoom, mapSize])

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect
        setMapSize({ w: Math.floor(width), h: Math.floor(height) })
      }
    })
    if (mapRef.current) ro.observe(mapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 3000)
    return () => clearInterval(id)
  }, [])

  // Fetch commodity prices
  useEffect(() => {
    const fetchPrices = async () => {
      const symbols = COMMODITIES.map(c => c.symbol).join(',')
      try {
        const res = await fetch(`/api/geo/prices?symbols=${symbols}`)
        if (res.ok) {
          const data = await res.json()
          setPrices(prev => prev.map(c => {
            const d = data[c.symbol]
            return d ? { ...c, price: d.price, change: d.change } : c
          }))
        }
      } catch {}
      setPriceLoading(false)
    }
    fetchPrices()
    const id = setInterval(fetchPrices, 60000)
    return () => clearInterval(id)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(10, Math.max(2, z + (e.deltaY > 0 ? -1 : 1))))
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, lat: mapCenter.lat, lng: mapCenter.lng }
  }, [mapCenter])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    const scale = 360 / (Math.pow(2, zoom) * TILE_SIZE)
    setMapCenter({
      lat: Math.max(-80, Math.min(80, dragStart.current.lat + dy * scale * 0.5)),
      lng: dragStart.current.lng - dx * scale,
    })
  }, [zoom])

  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  const filteredPoints = useMemo(() =>
    COMMODITY_POINTS.filter(p => layers[p.type as keyof typeof layers]),
    [layers]
  )

  const maxMetric = useMemo(() =>
    Math.max(...COUNTRY_DATA.map(c => c[overlayMetric] as number)), [overlayMetric]
  )

  const metricLabel: Record<string, string> = {
    oil: 'Oil Production (M bbl/day)',
    gas: 'Gas Production (BCF/yr)',
    gold: 'Gold Production (tonnes/yr)',
    risk: 'Geopolitical Risk Score',
  }

  const fmtPrice = (p: number | null, symbol: string) => {
    if (p === null) return '—'
    if (symbol.startsWith('ZC') || symbol.startsWith('ZW')) return p.toFixed(2)
    if (symbol.startsWith('SI') || symbol.startsWith('HG')) return p.toFixed(3)
    return p.toFixed(2)
  }

  const scrollingTicker = useMemo(() => {
    return prices.filter(p => p.price !== null).map(p =>
      `${p.name}: $${fmtPrice(p.price, p.symbol)}${p.unit}  ${p.change !== null ? (p.change >= 0 ? '+' : '') + p.change.toFixed(2) + '%' : ''}`
    ).join('    |    ')
  }, [prices])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text, fontFamily: 'var(--font-mono)', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.4rem 1rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 2, height: 16, background: C.orange }} />
          <span style={{ fontSize: '.6rem', color: C.orange, letterSpacing: '.2em', fontWeight: 700 }}>GEO TERMINAL</span>
          <span style={{ fontSize: '.48rem', color: C.faint, marginLeft: 4 }}>COMMODITY INTELLIGENCE</span>
        </div>

        {/* Map provider tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['satellite', 'dark', 'terrain'] as const).map(p => (
            <button key={p} onClick={() => { setMapProvider(p); setViewMode('map') }} style={{ padding: '.2rem .5rem', fontSize: '.52rem', borderRadius: 4, border: `1px solid ${mapProvider === p && viewMode === 'map' ? C.orange : C.border}`, background: mapProvider === p && viewMode === 'map' ? `${C.orange}18` : 'transparent', color: mapProvider === p && viewMode === 'map' ? C.orange : C.muted, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {p}
            </button>
          ))}
        </div>

        {/* Overlay metric */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['oil', 'gas', 'gold', 'risk'] as const).map(m => (
            <button key={m} onClick={() => setOverlayMetric(m)} style={{ padding: '.2rem .45rem', fontSize: '.48rem', borderRadius: 4, border: `1px solid ${overlayMetric === m ? C.blue : C.border}`, background: overlayMetric === m ? `${C.blue}15` : 'transparent', color: overlayMetric === m ? C.blue : C.muted, cursor: 'pointer', textTransform: 'uppercase' }}>
              {m}
            </button>
          ))}
        </div>

        {/* Layer toggles */}
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          {Object.entries(layers).map(([type, on]) => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={on} onChange={e => setLayers(prev => ({ ...prev, [type]: e.target.checked }))} style={{ accentColor: TYPE_COLORS[type] }} />
              <span style={{ fontSize: '.48rem', color: on ? TYPE_COLORS[type] : C.faint, textTransform: 'uppercase' }}>
                {TYPE_ICONS[type]} {type}
              </span>
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCountryOverlay} onChange={e => setShowCountryOverlay(e.target.checked)} style={{ accentColor: C.blue }} />
            <span style={{ fontSize: '.48rem', color: showCountryOverlay ? C.blue : C.faint, textTransform: 'uppercase' }}>COUNTRY</span>
          </label>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={() => setZoom(z => Math.min(10, z + 1))} style={{ width: 24, height: 24, borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg3, color: C.white, cursor: 'pointer', fontSize: '.8rem' }}>+</button>
          <button onClick={() => setZoom(z => Math.max(2, z - 1))} style={{ width: 24, height: 24, borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg3, color: C.white, cursor: 'pointer', fontSize: '.8rem' }}>−</button>
          <button onClick={() => { setMapCenter({ lat: 30, lng: 10 }); setZoom(3) }} style={{ padding: '.2rem .5rem', borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg3, color: C.muted, cursor: 'pointer', fontSize: '.48rem' }}>RESET</button>
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Map canvas ─────────────────────────────────────────────────── */}
        <div ref={mapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: dragging.current ? 'grabbing' : 'grab', background: '#020B14' }}
          onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

          {/* Tile images */}
          {viewMode === 'map' && tiles.map(({ x, y, z }) => {
            const tileOrigin = tileToLatLng(x, y, z)
            const { x: screenX, y: screenY } = latLngToPixel(tileOrigin.lat, tileOrigin.lng)
            const n = Math.pow(2, z)
            const nextOrigin = tileToLatLng(x + 1, y + 1, z)
            const { x: sx2, y: sy2 } = latLngToPixel(nextOrigin.lat, nextOrigin.lng)
            const w = sx2 - screenX
            const h = sy2 - screenY
            const url = tileUrl(mapProvider, x, y, z)
            return (
              <img
                key={`${z}-${x}-${y}`}
                src={url}
                alt=""
                style={{
                  position: 'absolute',
                  left: screenX,
                  top: screenY,
                  width: Math.abs(w) || TILE_SIZE,
                  height: Math.abs(h) || TILE_SIZE,
                  pointerEvents: 'none',
                  imageRendering: 'crisp-edges',
                }}
                crossOrigin="anonymous"
              />
            )
          })}

          {/* SVG overlay */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <filter id="glow-orange">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-green">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Country overlay circles */}
            {showCountryOverlay && COUNTRY_DATA.map(c => {
              const val = c[overlayMetric] as number
              if (val === 0) return null
              const { x, y } = latLngToPixel(c.lat, c.lng)
              if (x < -20 || x > mapSize.w + 20 || y < -20 || y > mapSize.h + 20) return null
              const t = maxMetric > 0 ? val / maxMetric : 0
              const r = 6 + t * 28
              const col = overlayMetric === 'risk' ? `rgba(255,48,64,${0.2 + t * 0.5})`
                        : overlayMetric === 'gold' ? `rgba(255,215,0,${0.2 + t * 0.5})`
                        : overlayMetric === 'gas'  ? `rgba(0,191,255,${0.2 + t * 0.5})`
                        : `rgba(255,140,0,${0.2 + t * 0.5})`
              return (
                <g key={c.id} style={{ pointerEvents: 'all', cursor: 'pointer' }}>
                  <circle cx={x} cy={y} r={r} fill={col} stroke="none" />
                  <circle cx={x} cy={y} r={r * 0.4} fill={col.replace(/[\d.]+\)$/, '0.8)')} stroke="none" />
                  <text x={x} y={y + r + 10} textAnchor="middle" fill={C.white} fontSize={9} fontFamily="var(--font-mono)" opacity={0.7}>{c.id}</text>
                </g>
              )
            })}

            {/* Commodity markers */}
            {filteredPoints.map(pt => {
              const { x, y } = latLngToPixel(pt.lat, pt.lng)
              if (x < -10 || x > mapSize.w + 10 || y < -10 || y > mapSize.h + 10) return null
              const col = TYPE_COLORS[pt.type]
              const isHov = hovered === pt.id
              const isSel = selectedPoint?.id === pt.id
              return (
                <g key={pt.id} style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  onClick={() => { setSelectedPoint(pt); setActivePanel('detail') }}
                  onMouseEnter={() => setHovered(pt.id)} onMouseLeave={() => setHovered(null)}>
                  <circle cx={x} cy={y} r={isHov || isSel ? 10 : 7} fill={col} fillOpacity={0.25} stroke={col} strokeWidth={isHov || isSel ? 1.5 : 1} filter={isSel ? 'url(#glow-orange)' : undefined} />
                  <circle cx={x} cy={y} r={isHov ? 4 : 3} fill={col} />
                  {(isHov || isSel) && (
                    <text x={x + 12} y={y + 4} fill={col} fontSize={9.5} fontFamily="var(--font-mono)" fontWeight="700">
                      {pt.name}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Zoom info */}
          <div style={{ position: 'absolute', bottom: 8, left: 10, fontSize: '.45rem', color: C.faint }}>
            {zoom}x | {mapCenter.lat.toFixed(1)}°N {mapCenter.lng.toFixed(1)}°E | Scroll=zoom, drag=pan
          </div>

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: `${C.bg3}E0`, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.4rem .6rem', backdropFilter: 'blur(6px)' }}>
            <div style={{ fontSize: '.45rem', color: C.faint, marginBottom: '.3rem', letterSpacing: '.1em' }}>{(metricLabel[overlayMetric] || overlayMetric).toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '.42rem', color: C.faint }}>0</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, background: overlayMetric === 'risk' ? 'linear-gradient(90deg,#030B14,#FF3040)' : overlayMetric === 'gold' ? 'linear-gradient(90deg,#030B14,#FFD700)' : overlayMetric === 'gas' ? 'linear-gradient(90deg,#030B14,#00BFFF)' : 'linear-gradient(90deg,#030B14,#FF8C00)' }} />
              <span style={{ fontSize: '.42rem', color: C.faint }}>MAX</span>
            </div>
          </div>

          {/* Provider watermark */}
          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: '.42rem', color: C.faint, pointerEvents: 'none' }}>
            {mapProvider === 'satellite' ? '© Esri, Maxar' : mapProvider === 'dark' ? '© CARTO © OpenStreetMap' : '© OpenTopoMap'}
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <div style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: C.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
            {([['markets', 'MARKETS'], ['countries', 'REGIONS'], ['detail', 'DETAIL']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setActivePanel(id)} style={{ flex: 1, padding: '.4rem 0', fontSize: '.5rem', border: 'none', borderBottom: activePanel === id ? `2px solid ${C.orange}` : '2px solid transparent', background: 'transparent', color: activePanel === id ? C.orange : C.muted, cursor: 'pointer', letterSpacing: '.08em' }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Markets panel ────────────────────────────────────────────── */}
          {activePanel === 'markets' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '.5rem .6rem' }}>
              <div style={{ fontSize: '.45rem', color: C.orange, letterSpacing: '.12em', marginBottom: '.4rem' }}>COMMODITY PRICES</div>
              {prices.map(c => {
                const isPos = (c.change ?? 0) >= 0
                return (
                  <div key={c.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.22rem .3rem', borderBottom: `1px solid ${C.border}30`, borderRadius: 4 }}>
                    <div>
                      <div style={{ fontSize: '.6rem', color: C.white, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '.42rem', color: C.faint }}>{c.unit}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '.65rem', color: C.white, fontWeight: 700 }}>{c.price !== null ? `$${fmtPrice(c.price, c.symbol)}` : '—'}</div>
                      <div style={{ fontSize: '.48rem', color: c.price !== null ? (isPos ? C.green : C.red) : C.faint }}>
                        {c.change !== null ? `${isPos ? '+' : ''}${c.change.toFixed(2)}%` : '...'}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div style={{ marginTop: '.75rem' }}>
                <div style={{ fontSize: '.45rem', color: C.orange, letterSpacing: '.12em', marginBottom: '.4rem' }}>TYPE LEGEND</div>
                {Object.entries(TYPE_COLORS).map(([type, col]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', padding: '.18rem 0' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                    <span style={{ fontSize: '.52rem', color: C.text, textTransform: 'capitalize' }}>{TYPE_ICONS[type]} {type}</span>
                    <span style={{ fontSize: '.42rem', color: C.faint, marginLeft: 'auto' }}>
                      {COMMODITY_POINTS.filter(p => p.type === type).length} sites
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Countries panel ─────────────────────────────────────────── */}
          {activePanel === 'countries' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '.5rem .6rem' }}>
              <div style={{ fontSize: '.45rem', color: C.orange, letterSpacing: '.12em', marginBottom: '.4rem' }}>
                TOP BY {overlayMetric.toUpperCase()}
              </div>
              {[...COUNTRY_DATA]
                .sort((a, b) => (b[overlayMetric] as number) - (a[overlayMetric] as number))
                .filter(c => (c[overlayMetric] as number) > 0)
                .slice(0, 18)
                .map((c, i) => {
                  const val = c[overlayMetric] as number
                  const t = maxMetric > 0 ? val / maxMetric : 0
                  const col = overlayMetric === 'risk' ? C.red : overlayMetric === 'gold' ? C.yellow : overlayMetric === 'gas' ? C.blue : C.orange
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', padding: '.2rem .3rem', borderRadius: 4, marginBottom: 2, cursor: 'pointer', background: 'transparent' }}
                      onClick={() => { setMapCenter({ lat: c.lat, lng: c.lng }); setZoom(5) }}>
                      <span style={{ fontSize: '.45rem', color: C.faint, width: 16 }}>{i + 1}</span>
                      <span style={{ fontSize: '.58rem', color: C.white, width: 24 }}>{c.id}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.52rem', color: C.text, marginBottom: 2 }}>{c.name}</div>
                        <div style={{ height: 3, borderRadius: 2, background: C.bg4, overflow: 'hidden' }}>
                          <div style={{ width: `${t * 100}%`, height: '100%', background: col }} />
                        </div>
                      </div>
                      <span style={{ fontSize: '.52rem', color: col, fontWeight: 700, flexShrink: 0 }}>
                        {overlayMetric === 'risk' ? val.toFixed(1) : val.toFixed(1)}
                      </span>
                    </div>
                  )
                })}
            </div>
          )}

          {/* ── Detail panel ─────────────────────────────────────────────── */}
          {activePanel === 'detail' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '.6rem .75rem' }}>
              {selectedPoint ? (
                <>
                  <div style={{ marginBottom: '.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '.3rem' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLORS[selectedPoint.type] }} />
                      <span style={{ fontSize: '.48rem', color: TYPE_COLORS[selectedPoint.type], textTransform: 'uppercase', letterSpacing: '.1em' }}>{selectedPoint.type}</span>
                    </div>
                    <div style={{ fontSize: '.85rem', fontWeight: 700, color: C.white, lineHeight: 1.2 }}>{selectedPoint.name}</div>
                    {selectedPoint.country && <div style={{ fontSize: '.52rem', color: C.muted, marginTop: 3 }}>{selectedPoint.country}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                    {[
                      ['Coordinates', `${selectedPoint.lat.toFixed(2)}°, ${selectedPoint.lng.toFixed(2)}°`],
                      selectedPoint.capacity ? ['Capacity', selectedPoint.capacity] : null,
                      selectedPoint.notes ? ['Notes', selectedPoint.notes] : null,
                    ].filter(Boolean).map(([k, v]: any) => (
                      <div key={k} style={{ padding: '.35rem .5rem', background: C.bg3, borderRadius: 6, borderLeft: `2px solid ${TYPE_COLORS[selectedPoint.type]}` }}>
                        <div style={{ fontSize: '.42rem', color: C.faint, marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: '.58rem', color: C.white }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '.75rem' }}>
                    <div style={{ fontSize: '.45rem', color: C.faint, marginBottom: '.4rem', letterSpacing: '.1em' }}>NEARBY SITES</div>
                    {COMMODITY_POINTS
                      .filter(p => p.id !== selectedPoint.id)
                      .map(p => ({ p, dist: Math.hypot(p.lat - selectedPoint.lat, p.lng - selectedPoint.lng) }))
                      .sort((a, b) => a.dist - b.dist)
                      .slice(0, 5)
                      .map(({ p, dist }) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.2rem 0', borderBottom: `1px solid ${C.border}30`, cursor: 'pointer' }}
                          onClick={() => { setSelectedPoint(p); setMapCenter({ lat: p.lat, lng: p.lng }); setZoom(6) }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[p.type], flexShrink: 0 }} />
                          <span style={{ fontSize: '.52rem', color: C.text, flex: 1 }}>{p.name}</span>
                          <span style={{ fontSize: '.42rem', color: C.faint }}>{dist.toFixed(0)}°</span>
                        </div>
                      ))}
                  </div>
                  <button onClick={() => { setMapCenter({ lat: selectedPoint.lat, lng: selectedPoint.lng }); setZoom(7) }}
                    style={{ marginTop: '.75rem', width: '100%', padding: '.4rem', borderRadius: 6, border: `1px solid ${TYPE_COLORS[selectedPoint.type]}50`, background: `${TYPE_COLORS[selectedPoint.type]}12`, color: TYPE_COLORS[selectedPoint.type], fontSize: '.55rem', cursor: 'pointer', letterSpacing: '.06em' }}>
                    ZOOM TO LOCATION
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: C.faint }}>
                  <div style={{ fontSize: '.8rem', marginBottom: '.5rem' }}>⛽</div>
                  <div style={{ fontSize: '.6rem' }}>Click any site on the map to see details</div>
                  <div style={{ fontSize: '.5rem', marginTop: '.35rem', color: C.faint }}>{COMMODITY_POINTS.length} infrastructure sites loaded</div>
                </div>
              )}
            </div>
          )}

          {/* Stats footer */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '.4rem .6rem', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
            {[
              ['Oil Sites', COMMODITY_POINTS.filter(p => p.type === 'oil').length],
              ['Mines', COMMODITY_POINTS.filter(p => p.type === 'mine').length],
              ['Exchanges', COMMODITY_POINTS.filter(p => p.type === 'exchange').length],
            ].map(([label, val]) => (
              <div key={label as string} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: C.orange }}>{val}</div>
                <div style={{ fontSize: '.42rem', color: C.faint }}>{label as string}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scrolling ticker ───────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg2, padding: '.22rem 0', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '2rem', animation: 'ticker 40s linear infinite', whiteSpace: 'nowrap', willChange: 'transform' }}>
          {[...Array(3)].flatMap((_, ri) =>
            prices.filter(p => p.price !== null).map(p => {
              const isPos = (p.change ?? 0) >= 0
              return (
                <span key={`${ri}-${p.symbol}`} style={{ fontSize: '.52rem', color: C.text }}>
                  <span style={{ color: C.orange, marginRight: 4 }}>{p.name}</span>
                  <span style={{ color: C.white, marginRight: 4 }}>${fmtPrice(p.price, p.symbol)}{p.unit}</span>
                  <span style={{ color: isPos ? C.green : C.red }}>
                    {p.change !== null ? `${isPos ? '▲' : '▼'}${Math.abs(p.change).toFixed(2)}%` : ''}
                  </span>
                  <span style={{ color: C.faint, margin: '0 8px' }}>|</span>
                </span>
              )
            })
          )}
        </div>
      </div>

      <style>{`
        @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-33.33%) } }
      `}</style>
    </div>
  )
}
