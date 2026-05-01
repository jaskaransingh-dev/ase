'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

export const dynamic = 'force-dynamic'

// ── SYNE v2 unified palette · amber/emerald/blood on pure black ─────────────
const C = {
  bg:      '#000000',
  panel:   '#000000',
  panel2:  '#050505',
  panel3:  '#0A0A0A',
  border:  '#161616',
  border2: '#262626',
  text:    '#D8D8D8',
  muted:   '#6A6A6A',
  faint:   '#2E2E2E',
  white:   '#FFFFFF',
  amber:   '#FFB800',  // infra / headers / chrome
  amber2:  '#FFCB4D',
  green:   '#00FF41',  // active agents / positive deltas
  red:     '#FF3131',  // risk / alerts / negative deltas
  dim:     '#444444',
}

// ── Tile map helpers ────────────────────────────────────────────────────────
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
  dark:      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain:   'https://tile.opentopomap.org/{z}/{x}/{y}.png',
}
function tileUrl(provider: string, x: number, y: number, z: number): string {
  return TILE_PROVIDERS[provider].replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}

// ── Commodity infrastructure ─────────────────────────────────────────────────
interface CommodityPoint {
  id: string; name: string; type: 'oil' | 'gas' | 'mine' | 'refinery' | 'exchange' | 'lng' | 'pipeline'
  lat: number; lng: number
  country?: string; capacity?: string; notes?: string
  ticker?: string
  bpd?: number          // current flow estimate
  weather?: string      // synthetic local weather
  sentiment?: number    // -1..+1
}

const COMMODITY_POINTS: CommodityPoint[] = [
  { id: 'GHAWAR',   name: 'Ghawar Oil Field',       type: 'oil',      lat: 25.1,  lng: 49.5,  country: 'Saudi Arabia',  capacity: '3.8M bbl/day', notes: 'Largest oil field in the world', ticker: 'ARAMCO', bpd: 3812000, weather: 'CLEAR · 41°C · 18kt NW', sentiment: 0.42 },
  { id: 'PRUDHOE',  name: 'Prudhoe Bay',             type: 'oil',     lat: 70.3,  lng: -148.5, country: 'USA',          capacity: '0.5M bbl/day', notes: 'Largest North American oil field', ticker: 'BP', bpd: 489000, weather: 'SNOW · -22°C · 28kt N', sentiment: 0.05 },
  { id: 'BURGAN',   name: 'Burgan Field',            type: 'oil',     lat: 29.0,  lng: 47.9,  country: 'Kuwait',        capacity: '1.7M bbl/day', notes: '2nd largest oil field', bpd: 1670000, weather: 'CLEAR · 38°C · 12kt W', sentiment: 0.20 },
  { id: 'RUMAILA',  name: 'Rumaila Field',           type: 'oil',     lat: 30.2,  lng: 47.5,  country: 'Iraq',          capacity: '1.4M bbl/day', notes: 'Iraq largest', bpd: 1395000, weather: 'HAZE · 36°C · 8kt E', sentiment: -0.18 },
  { id: 'CANTAREL', name: 'Cantarell Complex',       type: 'oil',     lat: 19.7,  lng: -91.8, country: 'Mexico',        capacity: '0.4M bbl/day', notes: 'Gulf of Mexico', bpd: 388000, weather: 'STORM · 28°C · 41kt SE', sentiment: -0.35 },
  { id: 'PERMIAN',  name: 'Permian Basin',           type: 'oil',     lat: 31.9,  lng: -102.5, country: 'USA',          capacity: '5.8M bbl/day', notes: 'Largest US producing basin', ticker: 'XOM', bpd: 5821000, weather: 'CLEAR · 32°C · 9kt SW', sentiment: 0.55 },
  { id: 'EAGLEFRD', name: 'Eagle Ford',              type: 'oil',     lat: 28.5,  lng: -99.0, country: 'USA',           capacity: '1.1M bbl/day', bpd: 1102000, weather: 'CLEAR · 30°C · 14kt S', sentiment: 0.28 },
  { id: 'NORTHSEA', name: 'North Sea Fields',        type: 'oil',     lat: 58.0,  lng: 2.0,   country: 'UK/Norway',     capacity: '2.0M bbl/day', notes: 'Brent crude benchmark', bpd: 2014000, weather: 'RAIN · 9°C · 32kt NW', sentiment: 0.10 },
  { id: 'VACA',     name: 'Vaca Muerta',             type: 'oil',     lat: -38.5, lng: -69.5, country: 'Argentina',     capacity: '0.6M bbl/day', notes: 'Major shale play', bpd: 612000, weather: 'CLEAR · 12°C · 22kt W', sentiment: 0.32 },
  { id: 'KASHAGAN', name: 'Kashagan Field',          type: 'oil',     lat: 45.4,  lng: 51.0,  country: 'Kazakhstan',    capacity: '0.4M bbl/day', notes: 'Largest discovery since 1968', bpd: 405000, weather: 'OVERCAST · 4°C · 18kt N', sentiment: -0.05 },
  { id: 'SOUTHPRS', name: 'South Pars/North Dome',   type: 'gas',     lat: 27.0,  lng: 52.2,  country: 'Iran/Qatar',    capacity: '700 BCF/yr',   notes: 'Largest gas field globally', sentiment: -0.22, weather: 'CLEAR · 33°C · 11kt N' },
  { id: 'URENGOY',  name: 'Urengoy Gas Field',       type: 'gas',     lat: 65.9,  lng: 78.2,  country: 'Russia',        capacity: '530 BCF/yr', sentiment: -0.30, weather: 'SNOW · -18°C · 24kt NE' },
  { id: 'GRONING',  name: 'Groningen Field',         type: 'gas',     lat: 53.3,  lng: 6.8,   country: 'Netherlands',   notes: 'Major European gas field', sentiment: -0.10, weather: 'OVERCAST · 8°C · 16kt W' },
  { id: 'MARCELLS', name: 'Marcellus Shale',         type: 'gas',     lat: 41.0,  lng: -77.0, country: 'USA',           capacity: '35 BCF/day', sentiment: 0.40, weather: 'CLEAR · 18°C · 7kt SW' },
  { id: 'RASLAFFN', name: 'Ras Laffan LNG',          type: 'lng',     lat: 25.9,  lng: 51.5,  country: 'Qatar',         capacity: '77 MTPA',     notes: 'World\'s largest LNG complex', sentiment: 0.35, weather: 'CLEAR · 36°C · 14kt N' },
  { id: 'DARWIN',   name: 'Darwin LNG',              type: 'lng',     lat: -12.4, lng: 130.9, country: 'Australia',     capacity: '3.6 MTPA', sentiment: 0.18, weather: 'STORM · 30°C · 38kt NW' },
  { id: 'SABINE',   name: 'Sabine Pass LNG',         type: 'lng',     lat: 29.7,  lng: -93.9, country: 'USA',           capacity: '30 MTPA', notes: 'Largest US LNG export', sentiment: 0.48, weather: 'CLEAR · 27°C · 12kt S' },
  { id: 'GATELNG',  name: 'Gate LNG Terminal',       type: 'lng',     lat: 51.9,  lng: 4.1,   country: 'Netherlands',   notes: 'Major European import', sentiment: 0.22, weather: 'RAIN · 11°C · 19kt SW' },
  { id: 'JAMNAGAR', name: 'Jamnagar Refinery',       type: 'refinery',lat: 22.5,  lng: 70.1,  country: 'India',         capacity: '1.24M bbl/day', notes: 'World\'s largest refinery', sentiment: 0.30, weather: 'CLEAR · 34°C · 9kt W' },
  { id: 'SKENERGY', name: 'SK Energy Refinery',      type: 'refinery',lat: 37.4,  lng: 127.0, country: 'S. Korea',      capacity: '0.84M bbl/day', sentiment: 0.12, weather: 'OVERCAST · 19°C · 11kt E' },
  { id: 'PORTART',  name: 'Port Arthur Refinery',    type: 'refinery',lat: 29.9,  lng: -93.9, country: 'USA',           capacity: '0.60M bbl/day', sentiment: 0.25, weather: 'CLEAR · 26°C · 8kt S' },
  { id: 'ESCONDID', name: 'Escondida Copper Mine',   type: 'mine',    lat: -24.3, lng: -69.1, country: 'Chile',         capacity: '1.2M tonnes/yr', notes: 'World\'s largest copper mine', sentiment: -0.45, weather: 'CLEAR · 14°C · 22kt SW' },
  { id: 'TENKE',    name: 'Tenke Fungurume',         type: 'mine',    lat: -10.6, lng: 26.1,  country: 'DRC',           capacity: '200K tonnes/yr', notes: 'Major cobalt/copper mine', sentiment: -0.50, weather: 'RAIN · 22°C · 6kt N' },
  { id: 'GRASBERG', name: 'Grasberg Mine',           type: 'mine',    lat: -4.05, lng: 137.1, country: 'Indonesia',     capacity: '0.8M oz Au/yr', notes: 'Largest gold mine by production', sentiment: -0.20, weather: 'STORM · 24°C · 28kt SE' },
  { id: 'SUPERPIT', name: 'Super Pit Gold Mine',     type: 'mine',    lat: -30.8, lng: 121.5, country: 'Australia',     capacity: '700K oz Au/yr', sentiment: 0.15, weather: 'CLEAR · 18°C · 14kt W' },
  { id: 'NORILSK',  name: 'Norilsk Nickel',          type: 'mine',    lat: 69.3,  lng: 88.2,  country: 'Russia',        capacity: '200K tonnes Ni/yr', notes: 'Largest nickel/palladium producer', sentiment: -0.55, weather: 'SNOW · -28°C · 32kt N' },
  { id: 'NYMEX',    name: 'NYMEX (CME)',             type: 'exchange',lat: 40.7,  lng: -74.0, country: 'USA',           notes: 'WTI crude, NG futures', sentiment: 0.4 },
  { id: 'ICE',      name: 'ICE Futures Europe',      type: 'exchange',lat: 51.5,  lng: -0.1,  country: 'UK',            notes: 'Brent crude benchmark', sentiment: 0.3 },
  { id: 'LME',      name: 'London Metal Exchange',   type: 'exchange',lat: 51.5,  lng: -0.09, country: 'UK',            notes: 'Base metals pricing', sentiment: 0.1 },
  { id: 'TOCOM',    name: 'TOCOM',                   type: 'exchange',lat: 35.7,  lng: 139.7, country: 'Japan',         notes: 'Asian commodity futures', sentiment: 0.2 },
  { id: 'DCE',      name: 'Dalian Commodity Exchange', type: 'exchange', lat: 38.9, lng: 121.6, country: 'China',        notes: 'Iron ore, soy, plastics', sentiment: -0.05 },
  { id: 'NORDSTRM', name: 'Nord Stream',             type: 'pipeline',lat: 57.0,  lng: 18.0,  country: 'Russia→EU',     notes: 'Major EU gas supply', sentiment: -0.6, weather: 'OVERCAST · 7°C · 15kt W' },
  { id: 'KEYSTONE', name: 'Keystone Pipeline',       type: 'pipeline',lat: 45.0,  lng: -100.0, country: 'Canada→USA',   notes: 'Oil sands transport', sentiment: 0.05, weather: 'CLEAR · 9°C · 18kt NW' },
]

// Unified palette: amber for infra, green for active flow/agents, red for risk
const TYPE_COLORS: Record<string, string> = {
  oil: '#FFB800', gas: '#FFB800', mine: '#FFB800', refinery: '#FFB800',
  pipeline: '#FFB800', lng: '#FFB800', exchange: '#00FF41',
}
const TYPE_LABELS: Record<string, string> = { oil: 'OIL', gas: 'GAS', mine: 'MIN', refinery: 'REF', exchange: 'EXC', lng: 'LNG', pipeline: 'PIP' }

// ── Commodity prices ─────────────────────────────────────────────────────────
interface CommodityPrice {
  symbol: string; name: string; ticker: string; price: number | null; change: number | null; unit: string
}
const COMMODITIES: CommodityPrice[] = [
  { symbol: 'CL=F', ticker: 'CL1', name: 'WTI CRUDE',  price: null, change: null, unit: '/bbl' },
  { symbol: 'BZ=F', ticker: 'CO1', name: 'BRENT',      price: null, change: null, unit: '/bbl' },
  { symbol: 'NG=F', ticker: 'NG1', name: 'NAT GAS',    price: null, change: null, unit: '/MMBtu' },
  { symbol: 'GC=F', ticker: 'GC1', name: 'GOLD',       price: null, change: null, unit: '/oz' },
  { symbol: 'SI=F', ticker: 'SI1', name: 'SILVER',     price: null, change: null, unit: '/oz' },
  { symbol: 'HG=F', ticker: 'HG1', name: 'COPPER',     price: null, change: null, unit: '/lb' },
  { symbol: 'PL=F', ticker: 'PL1', name: 'PLATINUM',   price: null, change: null, unit: '/oz' },
  { symbol: 'PA=F', ticker: 'PA1', name: 'PALLADIUM',  price: null, change: null, unit: '/oz' },
  { symbol: 'ZC=F', ticker: 'C 1', name: 'CORN',       price: null, change: null, unit: '/bu' },
  { symbol: 'ZW=F', ticker: 'W 1', name: 'WHEAT',      price: null, change: null, unit: '/bu' },
]

interface TileKey { x: number; y: number; z: number; dx: number; dy: number }

const COUNTRY_DATA = [
  { id: 'US', name: 'UNITED STATES',  lat: 38,   lng: -97,   oil: 12.9, gas: 934, gold: 0,    risk: 0.2 },
  { id: 'SA', name: 'SAUDI ARABIA',   lat: 24,   lng: 45,    oil: 9.9,  gas: 114, gold: 0,    risk: 0.4 },
  { id: 'RU', name: 'RUSSIA',         lat: 60,   lng: 90,    oil: 9.9,  gas: 638, gold: 10.3, risk: 0.8 },
  { id: 'CA', name: 'CANADA',         lat: 56,   lng: -96,   oil: 4.8,  gas: 185, gold: 5.5,  risk: 0.2 },
  { id: 'IQ', name: 'IRAQ',           lat: 33,   lng: 44,    oil: 4.5,  gas: 10,  gold: 0,    risk: 0.7 },
  { id: 'CN', name: 'CHINA',          lat: 35,   lng: 104,   oil: 4.0,  gas: 219, gold: 7.0,  risk: 0.4 },
  { id: 'AE', name: 'UAE',            lat: 24,   lng: 54,    oil: 3.7,  gas: 55,  gold: 0,    risk: 0.3 },
  { id: 'KW', name: 'KUWAIT',         lat: 29,   lng: 48,    oil: 2.6,  gas: 18,  gold: 0,    risk: 0.4 },
  { id: 'IR', name: 'IRAN',           lat: 32,   lng: 53,    oil: 3.8,  gas: 256, gold: 0,    risk: 0.9 },
  { id: 'BR', name: 'BRAZIL',         lat: -9,   lng: -53,   oil: 3.7,  gas: 23,  gold: 3.0,  risk: 0.4 },
  { id: 'NO', name: 'NORWAY',         lat: 62,   lng: 10,    oil: 1.8,  gas: 117, gold: 0,    risk: 0.1 },
  { id: 'KZ', name: 'KAZAKHSTAN',     lat: 48,   lng: 66,    oil: 1.7,  gas: 33,  gold: 4.0,  risk: 0.5 },
  { id: 'QA', name: 'QATAR',          lat: 25,   lng: 51,    oil: 1.8,  gas: 177, gold: 0,    risk: 0.3 },
  { id: 'NG', name: 'NIGERIA',        lat: 10,   lng: 8,     oil: 1.4,  gas: 49,  gold: 0,    risk: 0.7 },
  { id: 'AU', name: 'AUSTRALIA',      lat: -27,  lng: 133,   oil: 0.4,  gas: 156, gold: 10.0, risk: 0.1 },
  { id: 'MX', name: 'MEXICO',         lat: 23,   lng: -102,  oil: 1.9,  gas: 30,  gold: 3.1,  risk: 0.5 },
  { id: 'VE', name: 'VENEZUELA',      lat: 8,    lng: -66,   oil: 0.8,  gas: 27,  gold: 0,    risk: 0.9 },
  { id: 'LY', name: 'LIBYA',          lat: 26,   lng: 17,    oil: 1.2,  gas: 11,  gold: 0,    risk: 0.8 },
  { id: 'GB', name: 'UNITED KINGDOM', lat: 53,   lng: -2,    oil: 1.0,  gas: 40,  gold: 0,    risk: 0.1 },
  { id: 'IN', name: 'INDIA',          lat: 20,   lng: 79,    oil: 0.8,  gas: 31,  gold: 0,    risk: 0.3 },
  { id: 'CL', name: 'CHILE',          lat: -35,  lng: -71,   oil: 0,    gas: 0,   gold: 0.5,  risk: 0.2 },
  { id: 'ZA', name: 'SOUTH AFRICA',   lat: -29,  lng: 25,    oil: 0,    gas: 0,   gold: 8.0,  risk: 0.4 },
  { id: 'ID', name: 'INDONESIA',      lat: -5,   lng: 120,   oil: 0.8,  gas: 65,  gold: 3.0,  risk: 0.4 },
  { id: 'AR', name: 'ARGENTINA',      lat: -35,  lng: -66,   oil: 0.7,  gas: 40,  gold: 0,    risk: 0.6 },
  { id: 'CD', name: 'DR CONGO',       lat: -4,   lng: 25,    oil: 0,    gas: 0,   gold: 2.0,  risk: 0.8 },
  { id: 'JP', name: 'JAPAN',          lat: 36,   lng: 138,   oil: 0,    gas: 0,   gold: 0,    risk: 0.1 },
  { id: 'SG', name: 'SINGAPORE',      lat: 1,    lng: 104,   oil: 0,    gas: 0,   gold: 0,    risk: 0.1 },
]

// ── Geo-tagged news (PULSE) ─────────────────────────────────────────────────
interface NewsItem { id: string; t: string; tag: string; severity: 'info' | 'risk' | 'alert'; lat: number; lng: number; headline: string; body: string }
const NEWS_FEED: NewsItem[] = [
  { id: 'n1',  t: '14:32', tag: 'OPEC',   severity: 'info',  lat: 24.5, lng: 46.7,  headline: 'OPEC+ signals deeper Q3 cuts; Brent +1.4%',                body: 'Saudi MoP confirms voluntary cut extension; market positioning suggests follow-through risk into July OPEC meeting.' },
  { id: 'n2',  t: '14:28', tag: 'EIA',    severity: 'info',  lat: 38.9, lng: -77.0, headline: 'EIA crude stocks build of 2.4M bbl vs 1.1M est',           body: 'Cushing inventory above 5y average; gasoline draw partially offsets crude build. Spec longs likely to rotate.' },
  { id: 'n3',  t: '14:21', tag: 'GEO',    severity: 'alert', lat: 26.6, lng: 56.3,  headline: 'Strait of Hormuz tanker delays widen; insurance premia spike', body: 'Average AIS dwell time +38% w/w. War-risk insurance reportedly +180bp. Concentration risk on routes to Jamnagar, SK Energy.' },
  { id: 'n4',  t: '14:14', tag: 'LNG',    severity: 'info',  lat: 29.7, lng: -93.9, headline: 'Sabine Pass Train 7 returns; loadings normalise',         body: 'Turbomachinery repair complete. Henry Hub demand sensitivity reverts to baseline.' },
  { id: 'n5',  t: '14:08', tag: 'WX',     severity: 'risk',  lat: 19.7, lng: -91.8, headline: 'GFC model: tropical storm system over Cantarell',         body: 'Pemex offshore evacuations ordered. Production at risk: ~388 kbpd over 36-72hr window.' },
  { id: 'n6',  t: '13:55', tag: 'CU',     severity: 'risk',  lat: -24.3, lng: -69.1, headline: 'Escondida labour vote 78% strike auth; copper +2.1%',     body: 'BHP wage proposal rejected. 30-day mediation window opens; precedent suggests 60% strike probability.' },
  { id: 'n7',  t: '13:49', tag: 'NG',     severity: 'risk',  lat: 53.3, lng: 6.8,   headline: 'Groningen output curtailed further; TTF resumes climb',    body: 'Dutch government accelerates wind-down. Cumulative reduction 18% q/q; storage trajectory pressured.' },
  { id: 'n8',  t: '13:41', tag: 'AU',     severity: 'info',  lat: 24.5, lng: 46.7,  headline: 'Saudi MoP confirms voluntary cut extension into Q3',      body: 'Aramco production guidance revised down 240 kbpd. Asian discounts narrow.' },
  { id: 'n9',  t: '13:35', tag: 'RU',     severity: 'alert', lat: 60,   lng: 90,    headline: 'Sanctions package on Urals shipping under review',        body: 'Council draft includes secondary measures on shadow-fleet insurers. Material discount widening expected if adopted.' },
  { id: 'n10', t: '13:28', tag: 'AGRI',   severity: 'info',  lat: 46,   lng: 32,    headline: 'Black Sea wheat corridor: vessel traffic +12% w/w',       body: 'Insurance underwriters confirm continued coverage. Forward freight discount narrows.' },
  { id: 'n11', t: '13:14', tag: 'GEO',    severity: 'alert', lat: 26,   lng: 17,    headline: 'Libya port closure probability raised to 0.34',           body: 'Eastern faction issues notice; force majeure declarations possible at Es Sider, Ras Lanuf.' },
  { id: 'n12', t: '13:02', tag: 'AGENT',  severity: 'info',  lat: 40.7, lng: -74.0, headline: 'Oracle agent ALPHA-3 opened CL1 long, conf 0.82',         body: 'Position size 4.2% NAV. Stop -1.6%. Driver: inventory drawdown + OPEC posture.' },
]

const ORACLE_SIGNALS = [
  { sym: 'CL1', dir: 'LONG',  conf: 0.82, why: 'Inventory drawdown + OPEC posture' },
  { sym: 'NG1', dir: 'SHORT', conf: 0.71, why: 'Storage surplus vs 5y avg' },
  { sym: 'HG1', dir: 'LONG',  conf: 0.66, why: 'Supply disruption · Escondida' },
  { sym: 'GC1', dir: 'LONG',  conf: 0.58, why: 'Real yields easing' },
  { sym: 'CO1', dir: 'LONG',  conf: 0.74, why: 'Backwardation steepening' },
]

const DYLAN_LINES = [
  'THE TIMES THEY ARE A-CHANGIN',
  'A HARD RAINS A-GONNA FALL',
  'LIKE A ROLLING STONE',
  'BLOWIN IN THE WIND',
  'EVERYTHING IS BROKEN',
  'TANGLED UP IN BLUE',
  'WATCHING THE RIVER FLOW',
  'ITS ALL OVER NOW BABY BLUE',
]

function fmtPrice(p: number | null, symbol: string) {
  if (p === null) return '—'
  if (symbol.startsWith('SI') || symbol.startsWith('HG')) return p.toFixed(3)
  return p.toFixed(2)
}

type LayerSet = { oil: boolean; gas: boolean; mine: boolean; refinery: boolean; exchange: boolean; lng: boolean; pipeline: boolean; risk: boolean; flow: boolean; news: boolean }
const LAYER_PRESETS: Record<string, Partial<LayerSet>> = {
  INFRA: { oil: true, gas: true, mine: true, refinery: true, exchange: false, lng: false, pipeline: true, risk: false, flow: false },
  FLOW:  { oil: false, gas: false, mine: false, refinery: false, exchange: true, lng: true, pipeline: true, risk: false, flow: true },
  RISK:  { oil: true, gas: true, mine: false, refinery: false, exchange: false, lng: false, pipeline: false, risk: true, flow: false, news: true },
}

export default function SyneTerminal() {
  // Map state
  const [mapCenter, setMapCenter] = useState({ lat: 30, lng: 10 })
  const [zoom, setZoom] = useState(3)
  const [mapProvider, setMapProvider] = useState<'satellite' | 'dark' | 'terrain'>('dark')
  const mapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, lat: 30, lng: 10 })
  const [mapSize, setMapSize] = useState({ w: 800, h: 600 })

  const [layers, setLayers] = useState<LayerSet>({
    oil: true, gas: true, mine: true, refinery: false, exchange: true, lng: true, pipeline: false, risk: false, flow: false, news: true,
  })
  const [activePreset, setActivePreset] = useState<'INFRA' | 'FLOW' | 'RISK' | null>(null)
  const [overlayMetric, setOverlayMetric] = useState<'oil' | 'gas' | 'gold' | 'risk'>('oil')

  // Selection state
  const [selectedPoint, setSelectedPoint] = useState<CommodityPoint | null>(null)
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // Right rail state
  const [railOpen, setRailOpen] = useState(true)
  const [activePanel, setActivePanel] = useState<'WATCH' | 'GEO' | 'ORACLE' | 'PULSE' | 'CRYPTO'>('WATCH')

  // Live crypto news
  const [cryptoNews, setCryptoNews] = useState<Array<{ id: string; t: string; ts: number; tag: string; severity: 'info' | 'risk' | 'alert'; headline: string; body: string; source: string; url?: string; sentiment: number }>>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState('')
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setNewsLoading(true)
      try {
        const r = await fetch('/api/syne/news')
        const j = await r.json()
        if (!cancelled) setCryptoNews(j.items ?? [])
      } catch { if (!cancelled) setNewsError('feed unavailable') }
      finally { if (!cancelled) setNewsLoading(false) }
    }
    load()
    const id = setInterval(load, 5 * 60_000) // refresh every 5 min
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Data
  const [prices, setPrices] = useState<CommodityPrice[]>(COMMODITIES)

  // ── Crypto trader intel — BTC/ETH/SOL spot + Fear & Greed ──────────────
  // These power the new actionable strip rendered at the very top of the
  // terminal so every visit shows real, decision-grade data.
  const [crypto, setCrypto] = useState<{
    btc: { price: number | null; change24h: number | null }
    eth: { price: number | null; change24h: number | null }
    sol: { price: number | null; change24h: number | null }
  }>({ btc: { price: null, change24h: null }, eth: { price: null, change24h: null }, sol: { price: null, change24h: null } })
  const [fearGreed, setFearGreed] = useState<{ value: number; classification: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadCrypto = async () => {
      try {
        // CoinGecko simple-price; works without auth and includes 24h change
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true')
        const j = await r.json()
        if (cancelled) return
        setCrypto({
          btc: { price: j.bitcoin?.usd ?? null,  change24h: j.bitcoin?.usd_24h_change ?? null },
          eth: { price: j.ethereum?.usd ?? null, change24h: j.ethereum?.usd_24h_change ?? null },
          sol: { price: j.solana?.usd ?? null,   change24h: j.solana?.usd_24h_change ?? null },
        })
      } catch {}
    }
    const loadFG = async () => {
      try {
        const r = await fetch('https://api.alternative.me/fng/?limit=1')
        const j = await r.json()
        if (cancelled) return
        const d = j?.data?.[0]
        if (d) setFearGreed({ value: parseInt(d.value, 10), classification: d.value_classification })
      } catch {}
    }
    loadCrypto(); loadFG()
    const id1 = setInterval(loadCrypto, 60_000)
    const id2 = setInterval(loadFG, 5 * 60_000)
    return () => { cancelled = true; clearInterval(id1); clearInterval(id2) }
  }, [])

  // Command bar
  const [cmd, setCmd] = useState('')
  const [cmdLog, setCmdLog] = useState<{ kind: 'in' | 'out' | 'err'; text: string }[]>([
    { kind: 'out', text: 'SYNE 2.0 // GEOSPATIAL ENERGY INTELLIGENCE' },
    { kind: 'out', text: 'TYPE "HELP <GO>"  ·  PRESS  /  TO FOCUS COMMAND BAR' },
  ])
  const cmdInputRef = useRef<HTMLInputElement>(null)

  // Status / clock
  const [now, setNow] = useState<Date | null>(null)
  const [dylanIdx, setDylanIdx] = useState(0)
  const [tick, setTick] = useState(0)
  const [wsStatus] = useState<{ ok: boolean; latency: number }>({ ok: true, latency: 14 })

  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { const id = setInterval(() => setDylanIdx(i => (i + 1) % DYLAN_LINES.length), 6000); return () => clearInterval(id) }, [])
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1500); return () => clearInterval(id) }, [])

  // Tile grid
  const tiles = useMemo(() => {
    const result: TileKey[] = []
    const { x: cx, y: cy } = latLngToTile(mapCenter.lat, mapCenter.lng, zoom)
    const tilesX = Math.ceil(mapSize.w / TILE_SIZE) + 2
    const tilesY = Math.ceil(mapSize.h / TILE_SIZE) + 2
    const n = Math.pow(2, zoom)
    for (let dy = -Math.floor(tilesY / 2) - 1; dy <= Math.ceil(tilesY / 2) + 1; dy++) {
      for (let dx = -Math.floor(tilesX / 2) - 1; dx <= Math.ceil(tilesX / 2) + 1; dx++) {
        const tx = ((cx + dx) % n + n) % n
        const ty = Math.max(0, Math.min(n - 1, cy + dy))
        result.push({ x: tx, y: ty, z: zoom, dx, dy })
      }
    }
    return result
  }, [mapCenter, zoom, mapSize])

  const latLngToPixel = useCallback((lat: number, lng: number) => {
    const n = Math.pow(2, zoom)
    const latRadC = mapCenter.lat * Math.PI / 180
    const latRadP = lat * Math.PI / 180
    const centerY = (1 - Math.log(Math.tan(latRadC) + 1 / Math.cos(latRadC)) / Math.PI) / 2 * n * TILE_SIZE
    const pointY  = (1 - Math.log(Math.tan(latRadP) + 1 / Math.cos(latRadP)) / Math.PI) / 2 * n * TILE_SIZE
    const screenY = mapSize.h / 2 + (pointY - centerY)
    const lngDiff = lng - mapCenter.lng
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

  const filteredPoints = useMemo(() => COMMODITY_POINTS.filter(p => layers[p.type as keyof LayerSet] as boolean), [layers])

  // Compute viewport bounding box for proximity-news filter
  const viewportBounds = useMemo(() => {
    if (mapSize.w === 0 || mapSize.h === 0) return null
    const tl = (() => {
      // approximate: invert latLngToPixel for screen corners
      const lngDiffPerPx = 360 / (Math.pow(2, zoom) * TILE_SIZE)
      const lng = mapCenter.lng - (mapSize.w / 2) * lngDiffPerPx
      // Mercator inverse approx
      const n = Math.pow(2, zoom)
      const latRadC = mapCenter.lat * Math.PI / 180
      const centerWorldY = (1 - Math.log(Math.tan(latRadC) + 1 / Math.cos(latRadC)) / Math.PI) / 2 * n * TILE_SIZE
      const topWorldY = centerWorldY - mapSize.h / 2
      const ty = topWorldY / (n * TILE_SIZE)
      const latTop = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty))) * 180 / Math.PI
      return { lat: latTop, lng }
    })()
    const br = (() => {
      const lngDiffPerPx = 360 / (Math.pow(2, zoom) * TILE_SIZE)
      const lng = mapCenter.lng + (mapSize.w / 2) * lngDiffPerPx
      const n = Math.pow(2, zoom)
      const latRadC = mapCenter.lat * Math.PI / 180
      const centerWorldY = (1 - Math.log(Math.tan(latRadC) + 1 / Math.cos(latRadC)) / Math.PI) / 2 * n * TILE_SIZE
      const botWorldY = centerWorldY + mapSize.h / 2
      const ty = botWorldY / (n * TILE_SIZE)
      const latBot = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty))) * 180 / Math.PI
      return { lat: latBot, lng }
    })()
    return { north: tl.lat, south: br.lat, west: tl.lng, east: br.lng }
  }, [mapCenter, zoom, mapSize])

  const newsInView = useMemo(() => {
    if (!viewportBounds) return NEWS_FEED
    return NEWS_FEED.filter(n =>
      n.lat <= viewportBounds.north && n.lat >= viewportBounds.south &&
      n.lng >= viewportBounds.west && n.lng <= viewportBounds.east
    )
  }, [viewportBounds])

  // Synthetic ships (FLOW)
  const ships = useMemo(() => {
    const routes = [
      { from: { lat: 25.9, lng: 51.5 }, to: { lat: 35.7, lng: 139.7 }, name: 'Q-MAX 03' },
      { from: { lat: 29.7, lng: -93.9 }, to: { lat: 51.9, lng: 4.1 }, name: 'CHENIERE A1' },
      { from: { lat: -12.4, lng: 130.9 }, to: { lat: 38.9, lng: 121.6 }, name: 'NWS-7' },
      { from: { lat: 25.1, lng: 49.5 }, to: { lat: 29.9, lng: -93.9 }, name: 'ARAMCO 211' },
      { from: { lat: 58.0, lng: 2.0 }, to: { lat: 51.5, lng: -0.1 }, name: 'BRENT-NS' },
    ]
    const phase = (tick % 60) / 60
    return routes.map((r, i) => {
      const t = ((phase + i * 0.17) % 1)
      return {
        ...r,
        lat: r.from.lat + (r.to.lat - r.from.lat) * t,
        lng: r.from.lng + (r.to.lng - r.from.lng) * t,
        t,
      }
    })
  }, [tick])

  const maxMetric = useMemo(() => Math.max(...COUNTRY_DATA.map(c => c[overlayMetric] as number)), [overlayMetric])

  const runCommand = useCallback((raw: string) => {
    const text = raw.trim().toUpperCase()
    if (!text) return
    setCmdLog(l => [...l, { kind: 'in', text: `> ${text}` }])
    const parts = text.split(/\s+/).filter(p => p !== '<GO>' && p !== 'GO')
    const head = parts[0]
    const reply = (msg: string, kind: 'out' | 'err' = 'out') => setCmdLog(l => [...l, { kind, text: msg }])

    if (head === 'HELP' || head === '?') {
      reply('AVAILABLE COMMANDS:')
      reply('  HELP                     show this list')
      reply('  WTI | BRENT | NG | GOLD  query commodity')
      reply('  F1 | F2 | F3             layer presets (INFRA/FLOW/RISK)')
      reply('  COUNTRY <CODE>           fly to country (e.g. SA, RU)')
      reply('  SITE <ID>                open asset terminal modal')
      reply('  PULSE                    toggle news pulse on map')
      reply('  RAIL                     toggle right rail')
      reply('  MAP DARK | SAT | TERRAIN  switch map style')
      reply('  RESET / CLEAR            reset map / clear log')
      return
    }
    if (head === 'CLEAR') { setCmdLog([{ kind: 'out', text: 'LOG CLEARED' }]); return }
    if (head === 'RESET') { setMapCenter({ lat: 30, lng: 10 }); setZoom(3); setSelectedPoint(null); setSelectedNews(null); reply('MAP VIEW RESET'); return }
    if (head === 'MAP') {
      const m = ({ DARK: 'dark', SAT: 'satellite', SATELLITE: 'satellite', TERRAIN: 'terrain' } as Record<string, string>)[parts[1] || '']
      if (m) { setMapProvider(m as any); reply(`MAP STYLE // ${m.toUpperCase()}`); return }
      reply(`MAP STYLES: DARK SAT TERRAIN`, 'err'); return
    }
    const mapStyles: Record<string, string> = { DARK: 'dark', SAT: 'satellite', SATELLITE: 'satellite', TERRAIN: 'terrain' }
    if (mapStyles[head]) { setMapProvider(mapStyles[head] as 'satellite' | 'dark' | 'terrain'); reply(`MAP STYLE // ${mapStyles[head].toUpperCase()}`); return }
    if (head === 'F1' || head === 'INFRA') { setLayers(l => ({ ...l, ...LAYER_PRESETS.INFRA } as LayerSet)); setActivePreset('INFRA'); reply('PRESET // INFRA'); return }
    if (head === 'F2' || head === 'FLOW' || head === 'SHIP') { setLayers(l => ({ ...l, ...LAYER_PRESETS.FLOW } as LayerSet)); setActivePreset('FLOW'); reply('PRESET // FLOW'); return }
    if (head === 'F3' || head === 'RISK') { setLayers(l => ({ ...l, ...LAYER_PRESETS.RISK } as LayerSet)); setActivePreset('RISK'); setOverlayMetric('risk'); reply('PRESET // RISK'); return }
    if (head === 'PULSE' || head === 'NEWS') { setLayers(l => ({ ...l, news: !l.news })); reply('PULSE LAYER TOGGLED'); return }
    if (head === 'RAIL') { setRailOpen(o => !o); reply('RAIL TOGGLED'); return }
    if (head === 'ORACLE') { setRailOpen(true); setActivePanel('ORACLE'); reply('ORACLE OPEN'); return }
    if (head === 'WATCH' || head === 'WATCHTOWER') { setRailOpen(true); setActivePanel('WATCH'); reply('WATCHTOWER OPEN'); return }
    if (head === 'GEO' || head === 'REGIONS') { setRailOpen(true); setActivePanel('GEO'); reply('REGIONS OPEN'); return }

    const sym = ({ WTI: 'CL=F', BRENT: 'BZ=F', NG: 'NG=F', GAS: 'NG=F', GOLD: 'GC=F', SILVER: 'SI=F', COPPER: 'HG=F', PLATINUM: 'PL=F', PALLADIUM: 'PA=F', CORN: 'ZC=F', WHEAT: 'ZW=F' } as Record<string, string>)[head]
    if (sym) {
      const c = prices.find(p => p.symbol === sym)
      if (c && c.price !== null) reply(`${c.name} ${fmtPrice(c.price, c.symbol)}${c.unit}  ${(c.change ?? 0) >= 0 ? '+' : ''}${(c.change ?? 0).toFixed(2)}%`)
      else reply(`${head}: AWAITING PRICE FEED`)
      return
    }
    if (head === 'COUNTRY' && parts[1]) {
      const co = COUNTRY_DATA.find(c => c.id === parts[1])
      if (co) { setMapCenter({ lat: co.lat, lng: co.lng }); setZoom(5); reply(`FLY-TO ${co.id} ${co.name}`); return }
      reply(`UNKNOWN COUNTRY: ${parts[1]}`, 'err'); return
    }
    if (head === 'SITE' && parts[1]) {
      const s = COMMODITY_POINTS.find(p => p.id === parts[1])
      if (s) { setSelectedPoint(s); setMapCenter({ lat: s.lat, lng: s.lng }); setZoom(6); reply(`SITE ${s.id} // ${s.name}`); return }
      reply(`UNKNOWN SITE: ${parts[1]}`, 'err'); return
    }
    const ctry = COUNTRY_DATA.find(c => c.id === head)
    if (ctry) { setMapCenter({ lat: ctry.lat, lng: ctry.lng }); setZoom(5); reply(`FLY-TO ${ctry.id} ${ctry.name}`); return }
    const site = COMMODITY_POINTS.find(p => p.id === head)
    if (site) { setSelectedPoint(site); setMapCenter({ lat: site.lat, lng: site.lng }); setZoom(6); reply(`SITE ${site.id} // ${site.name}`); return }
    reply(`UNRECOGNIZED: ${head}`, 'err')
  }, [prices])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      const inInput = tgt?.tagName === 'INPUT' || tgt?.tagName === 'TEXTAREA'
      if (e.key === 'F1') { e.preventDefault(); runCommand('F1 GO') }
      else if (e.key === 'F2') { e.preventDefault(); runCommand('F2 GO') }
      else if (e.key === 'F3') { e.preventDefault(); runCommand('F3 GO') }
      else if ((e.key === '/' || e.key === ':') && !inInput) { e.preventDefault(); cmdInputRef.current?.focus() }
      else if (e.key === 'Escape') { setSelectedPoint(null); setSelectedNews(null); cmdInputRef.current?.blur() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [runCommand])

  const marketStatus = useMemo(() => {
    if (!now) return { txt: '— — —', col: C.muted }
    const h = now.getUTCHours()
    if (h >= 13 && h < 20) return { txt: 'NYMEX OPEN', col: C.green }
    if (h >= 7 && h < 15) return { txt: 'ICE OPEN',  col: C.green }
    return { txt: 'AFTER HRS', col: C.amber }
  }, [now])

  const fmtTime = (d: Date | null) => {
    if (!d) return '--:--:--Z'
    const hh = d.getUTCHours().toString().padStart(2, '0')
    const mm = d.getUTCMinutes().toString().padStart(2, '0')
    const ss = d.getUTCSeconds().toString().padStart(2, '0')
    return `${hh}:${mm}:${ss}Z`
  }

  // Sentiment color helper
  const sentimentCol = (s?: number) => s === undefined ? C.muted : s > 0.2 ? C.green : s < -0.2 ? C.red : C.amber

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: C.bg, color: C.text,
      fontFamily: '"IBM Plex Mono", "Roboto Mono", ui-monospace, var(--font-mono), monospace',
      fontSize: 11, lineHeight: 1.3, overflow: 'hidden', letterSpacing: '0.02em',
    }}>

      {/* ── TOP RAIL: thin SYNE branding + Dylan + status ───────────────── */}
      <div style={{
        height: 22, flexShrink: 0, display: 'flex', alignItems: 'center',
        borderBottom: `1px solid ${C.border}`, background: '#000', fontSize: 10,
      }}>
        <div style={{ padding: '0 8px', borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6, height: '100%' }}>
          <div style={{ width: 7, height: 7, background: C.amber }} />
          <span style={{ color: C.amber, fontWeight: 700, letterSpacing: '0.18em' }}>SYNE</span>
          <span style={{ color: C.faint, fontSize: 9 }}>v2.0</span>
        </div>
        <div style={{ padding: '0 10px', borderRight: `1px solid ${C.border}`, color: C.amber, fontWeight: 700, letterSpacing: '0.14em', height: '100%', display: 'flex', alignItems: 'center', fontSize: 9 }}>
          ENERGY · GEOSPATIAL · INTELLIGENCE
        </div>
        <div style={{ padding: '0 10px', borderRight: `1px solid ${C.border}`, color: C.muted, height: '100%', display: 'flex', alignItems: 'center', fontSize: 9, letterSpacing: '0.1em' }}>
          {filteredPoints.length} ASSETS · {COUNTRY_DATA.length} REGIONS · {prices.filter(p => p.price !== null).length}/{prices.length} FEEDS
        </div>
        <div style={{ padding: '0 10px', color: C.green, fontStyle: 'italic', height: '100%', display: 'flex', alignItems: 'center', fontSize: 9, letterSpacing: '0.12em' }}>
          “{DYLAN_LINES[dylanIdx]}”
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', fontSize: 9, letterSpacing: '0.08em', height: '100%' }}>
          <span style={{ color: marketStatus.col }}>● {marketStatus.txt}</span>
          <span style={{ color: wsStatus.ok ? C.green : C.red }}>● WS {wsStatus.latency}ms</span>
          <span style={{ color: C.muted }} suppressHydrationWarning>{fmtTime(now)}</span>
          <button onClick={() => setRailOpen(o => !o)} style={{
            border: `1px solid ${C.border2}`, background: '#000', color: C.amber,
            padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
          }}>{railOpen ? 'RAIL ›' : '‹ RAIL'}</button>
        </div>
      </div>

      {/* ── TRADER INTEL STRIP — actionable crypto data, refreshed every 60s ── */}
      <div style={{
        height: 32, flexShrink: 0, display: 'flex', alignItems: 'center',
        borderBottom: `1px solid ${C.border}`, background: '#020202', fontSize: 10,
        overflowX: 'auto',
      }}>
        {[
          { key: 'BTC', symbol: '₿', data: crypto.btc, color: '#F7931A' },
          { key: 'ETH', symbol: 'Ξ', data: crypto.eth, color: '#627EEA' },
          { key: 'SOL', symbol: '◎', data: crypto.sol, color: '#19E6A7' },
        ].map(c => {
          const ch = c.data.change24h
          const positive = (ch ?? 0) >= 0
          return (
            <div key={c.key} style={{ padding: '0 12px', borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
              <span style={{ color: c.color, fontWeight: 700, letterSpacing: '0.1em' }}>{c.symbol} {c.key}</span>
              <span style={{ color: C.white, fontWeight: 700 }}>
                {c.data.price != null ? `$${c.data.price.toLocaleString(undefined, { maximumFractionDigits: c.data.price > 100 ? 0 : 2 })}` : '—'}
              </span>
              <span style={{ color: positive ? C.green : C.red, fontSize: 9 }}>
                {ch != null ? `${positive ? '+' : ''}${ch.toFixed(2)}%` : '—'}
              </span>
            </div>
          )
        })}

        {/* Fear & Greed gauge */}
        <div style={{ padding: '0 12px', borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
          <span style={{ color: C.amber, fontWeight: 700, letterSpacing: '0.1em', fontSize: 9 }}>FEAR/GREED</span>
          {fearGreed ? (
            <>
              <span style={{
                color: fearGreed.value < 25 ? C.red : fearGreed.value > 75 ? C.green : C.amber,
                fontWeight: 700,
              }}>{fearGreed.value}</span>
              <span style={{ color: C.muted, fontSize: 9 }}>{fearGreed.classification.toUpperCase()}</span>
              <div style={{ width: 80, height: 4, background: C.faint, borderRadius: 2, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${fearGreed.value}%`,
                  background: `linear-gradient(90deg, ${C.red} 0%, ${C.amber} 50%, ${C.green} 100%)`,
                  borderRadius: 2,
                }} />
              </div>
            </>
          ) : <span style={{ color: C.muted }}>loading…</span>}
        </div>

        {/* Quick-actions for traders — direct links into the workspace */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: '100%' }}>
          <a href="/dashboard/build" style={{
            border: `1px solid ${C.amber}55`, color: C.amber, padding: '3px 10px',
            textDecoration: 'none', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            background: '#000',
          }}>+ AGENT</a>
          <a href="/dashboard/backtest" style={{
            border: `1px solid ${C.green}55`, color: C.green, padding: '3px 10px',
            textDecoration: 'none', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            background: '#000',
          }}>BACKTEST</a>
          <a href="/dashboard/build/manage" style={{
            border: `1px solid ${C.amber2}55`, color: C.amber2, padding: '3px 10px',
            textDecoration: 'none', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            background: '#000',
          }}>MY AGENTS</a>
          <a href="/dashboard/marketplace" style={{
            border: `1px solid ${C.border2}`, color: C.muted, padding: '3px 10px',
            textDecoration: 'none', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            background: '#000',
          }}>MARKET</a>
        </div>
      </div>

      {/* ── MAIN AREA ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, position: 'relative' }}>

        {/* MAP (full bleed) */}
        <div ref={mapRef} style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          cursor: dragging.current ? 'grabbing' : 'grab',
          background: '#000', borderRight: railOpen ? `1px solid ${C.border}` : 'none',
        }} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

          {/* Base map - different filters per style */}
          <div style={{ position: 'absolute', inset: 0, filter: mapProvider === 'dark' ? 'grayscale(1) brightness(0.42) contrast(1.4)' : mapProvider === 'terrain' ? 'grayscale(1) brightness(0.55) contrast(1.2)' : 'none' }}>
            {tiles.map(({ x, y, z, dx, dy }) => {
              const { x: cx, y: cy } = latLngToTile(mapCenter.lat, mapCenter.lng, zoom)
              const tileOrigin = tileToLatLng(cx + dx, cy + dy, z)
              const { x: screenX, y: screenY } = latLngToPixel(tileOrigin.lat, tileOrigin.lng)
              const nextOrigin = tileToLatLng(cx + dx + 1, cy + dy + 1, z)
              const { x: sx2, y: sy2 } = latLngToPixel(nextOrigin.lat, nextOrigin.lng)
              const w = sx2 - screenX
              const h = sy2 - screenY
              return (
                <img key={`${z}-${dx}-${dy}`} src={tileUrl(mapProvider, x, y, z)} alt=""
                  style={{
                    position: 'absolute', left: screenX, top: screenY,
                    width: Math.abs(w) || TILE_SIZE, height: Math.abs(h) || TILE_SIZE,
                    pointerEvents: 'none', imageRendering: 'crisp-edges',
                  }} crossOrigin="anonymous" />
              )
            })}
          </div>

          {/* Amber graticule */}
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.14 }}>
            {[-60, -30, 0, 30, 60].map(lat => {
              const { y } = latLngToPixel(lat, mapCenter.lng)
              if (y < 0 || y > mapSize.h) return null
              return <line key={`h${lat}`} x1={0} x2={mapSize.w} y1={y} y2={y} stroke={C.amber} strokeWidth={0.5} strokeDasharray="2,4" />
            })}
            {[-120, -60, 0, 60, 120].map(lng => {
              const { x } = latLngToPixel(mapCenter.lat, lng)
              if (x < 0 || x > mapSize.w) return null
              return <line key={`v${lng}`} x1={x} x2={x} y1={0} y2={mapSize.h} stroke={C.amber} strokeWidth={0.5} strokeDasharray="2,4" />
            })}
          </svg>

          {/* SVG overlays */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <defs>
              <radialGradient id="pulse-red">
                <stop offset="0%" stopColor={C.red} stopOpacity="0.9" />
                <stop offset="100%" stopColor={C.red} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pulse-amber">
                <stop offset="0%" stopColor={C.amber} stopOpacity="0.9" />
                <stop offset="100%" stopColor={C.amber} stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Risk overlay */}
            {layers.risk && COUNTRY_DATA.map(c => {
              if (c.risk === 0) return null
              const { x, y } = latLngToPixel(c.lat, c.lng)
              if (x < -40 || x > mapSize.w + 40 || y < -40 || y > mapSize.h + 40) return null
              const r = 8 + c.risk * 36
              return (
                <g key={`risk-${c.id}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={x} cy={y} r={r} fill={`rgba(255,49,49,${0.06 + c.risk * 0.18})`} />
                  <circle cx={x} cy={y} r={r * 0.5} fill={`rgba(255,49,49,${0.15 + c.risk * 0.32})`} />
                  <text x={x} y={y - r - 2} textAnchor="middle" fill={C.red} fontSize={9} fontFamily="inherit" fontWeight={700}>{c.id}·{c.risk.toFixed(1)}</text>
                </g>
              )
            })}

            {/* Country circles for non-risk overlays */}
            {!layers.risk && COUNTRY_DATA.map(c => {
              const val = c[overlayMetric] as number
              if (val === 0) return null
              const { x, y } = latLngToPixel(c.lat, c.lng)
              if (x < -20 || x > mapSize.w + 20 || y < -20 || y > mapSize.h + 20) return null
              const t = maxMetric > 0 ? val / maxMetric : 0
              const r = 4 + t * 14
              return (
                <g key={`co-${c.id}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={x} cy={y} r={r} fill={`rgba(255,184,0,${0.08 + t * 0.18})`} />
                  <circle cx={x} cy={y} r={1.5} fill={`rgba(255,184,0,0.9)`} />
                </g>
              )
            })}

            {/* Vessel routes (FLOW) */}
            {layers.flow && ships.map((s, i) => {
              const { x: x1, y: y1 } = latLngToPixel(s.from.lat, s.from.lng)
              const { x: x2, y: y2 } = latLngToPixel(s.to.lat, s.to.lng)
              const { x, y } = latLngToPixel(s.lat, s.lng)
              return (
                <g key={`ship-${i}`} style={{ pointerEvents: 'none' }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.green} strokeWidth={0.5} strokeDasharray="2,3" opacity={0.45} />
                  <rect x={x - 3} y={y - 3} width={6} height={6} fill={C.green} />
                  <text x={x + 6} y={y + 3} fill={C.green} fontSize={8} fontFamily="inherit" fontWeight={700}>{s.name}</text>
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
              const sz = isSel ? 8 : isHov ? 7 : 5
              return (
                <g key={pt.id} style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                  onClick={() => setSelectedPoint(pt)}
                  onMouseEnter={() => setHovered(pt.id)} onMouseLeave={() => setHovered(null)}>
                  <rect x={x - sz / 2} y={y - sz / 2} width={sz} height={sz} fill={col} stroke={C.white} strokeWidth={isSel ? 1 : 0.5} />
                  {isSel && <rect x={x - sz} y={y - sz} width={sz * 2} height={sz * 2} fill="none" stroke={col} strokeWidth={1} strokeDasharray="2,2" />}
                  {(isHov || isSel) && (
                    <g>
                      <rect x={x + 8} y={y - 7} width={pt.name.length * 5.4 + 8} height={14} fill="#000" stroke={col} strokeWidth={0.5} />
                      <text x={x + 12} y={y + 3} fill={col} fontSize={9} fontFamily="inherit" fontWeight={700}>{pt.name}</text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* News PULSE markers */}
            {layers.news && newsInView.map(n => {
              const { x, y } = latLngToPixel(n.lat, n.lng)
              if (x < -20 || x > mapSize.w + 20 || y < -20 || y > mapSize.h + 20) return null
              const col = n.severity === 'alert' ? C.red : n.severity === 'risk' ? C.red : C.amber
              const ringR = 8 + (tick % 8)
              const ringO = 0.7 - (tick % 8) / 14
              const isHov = hovered === `news-${n.id}`
              return (
                <g key={n.id} style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setSelectedNews(n) }}
                  onMouseEnter={() => setHovered(`news-${n.id}`)}
                  onMouseLeave={() => setHovered(null)}>
                  <circle cx={x} cy={y} r={ringR} fill="none" stroke={col} strokeWidth={1} opacity={ringO} />
                  <circle cx={x} cy={y} r={3} fill={col} />
                  <circle cx={x} cy={y} r={1} fill="#000" />
                  {isHov && (
                    <g>
                      <rect x={x + 8} y={y - 16} width={Math.min(280, n.headline.length * 5.4 + 12)} height={28} fill="#000" stroke={col} strokeWidth={0.5} />
                      <text x={x + 12} y={y - 5} fill={col} fontSize={9} fontFamily="inherit" fontWeight={700} letterSpacing="0.08em">{n.tag} · {n.t}</text>
                      <text x={x + 12} y={y + 6} fill={C.text} fontSize={9} fontFamily="inherit">
                        {n.headline.length > 48 ? n.headline.slice(0, 48) + '…' : n.headline}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Crosshair */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: `${C.amber}22`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: `${C.amber}22`, pointerEvents: 'none' }} />

          {/* Layer toggle strip (top-left, floating) */}
          <div style={{
            position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ display: 'flex', gap: 0 }}>
              {(['INFRA', 'FLOW', 'RISK'] as const).map((p, i) => (
                <button key={p} onClick={() => runCommand(`F${i + 1} GO`)} style={{
                  padding: '4px 10px', border: `1px solid ${activePreset === p ? C.amber : C.border2}`,
                  background: activePreset === p ? `${C.amber}22` : '#000',
                  color: activePreset === p ? C.amber : C.muted,
                  fontFamily: 'inherit', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                  cursor: 'pointer', borderLeft: i === 0 ? `1px solid ${activePreset === p ? C.amber : C.border2}` : 'none',
                }}>F{i + 1} {p}</button>
              ))}
              <button onClick={() => setLayers(l => ({ ...l, news: !l.news }))} style={{
                padding: '4px 10px', border: `1px solid ${layers.news ? C.amber : C.border2}`, borderLeft: 'none',
                background: layers.news ? `${C.amber}22` : '#000', color: layers.news ? C.amber : C.muted,
                fontFamily: 'inherit', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer',
              }}>PULSE</button>
            </div>
            <div style={{
              padding: '3px 8px', background: '#000', border: `1px solid ${C.border2}`,
              fontSize: 9, color: C.muted, letterSpacing: '0.08em',
            }}>
              <span style={{ color: C.amber }}>VIEW</span> {newsInView.length}/{NEWS_FEED.length} pulse · {filteredPoints.length} assets
            </div>
          </div>

          {/* Coords (bottom-left) */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            background: '#000', borderTop: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
            padding: '2px 8px', fontSize: 9, color: C.muted, letterSpacing: '0.08em',
          }}>
            <span style={{ color: C.amber }}>LAT</span> {mapCenter.lat.toFixed(2)} ·{' '}
            <span style={{ color: C.amber }}>LNG</span> {mapCenter.lng.toFixed(2)} ·{' '}
            <span style={{ color: C.amber }}>Z</span> {zoom}
          </div>

          {/* Zoom buttons */}
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setZoom(z => Math.min(10, z + 1))} style={zoomBtn}>+</button>
            <button onClick={() => setZoom(z => Math.max(2, z - 1))} style={zoomBtn}>−</button>
          </div>

          {/* Map style toggle */}
          <div style={{ position: 'absolute', top: 52, right: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(['dark', 'satellite', 'terrain'] as const).map(p => (
              <button key={p} onClick={() => setMapProvider(p)} style={{
                padding: '3px 6px', border: `1px solid ${mapProvider === p ? C.amber : C.border2}`,
                background: mapProvider === p ? `${C.amber}22` : '#000',
                color: mapProvider === p ? C.amber : C.muted,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>{p}</button>
            ))}
          </div>

          {/* ── ASSET TERMINAL MODAL (click-through) ──────────────────── */}
          {selectedPoint && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', top: 40, right: 40, width: 360,
                background: '#000', border: `1px solid ${C.amber}`,
                boxShadow: `0 0 0 1px ${C.amber}33`,
                zIndex: 50,
              }}>
              {/* title bar */}
              <div style={{
                display: 'flex', alignItems: 'center', height: 18,
                borderBottom: `1px solid ${C.amber}`, background: '#000',
              }}>
                <div style={{ padding: '0 8px', color: C.amber, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, background: C.amber }} />
                  ASSET // {selectedPoint.id}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex' }}>
                  <button onClick={() => { setMapCenter({ lat: selectedPoint.lat, lng: selectedPoint.lng }); setZoom(7) }} style={modalBtn}>ZOOM</button>
                  <button onClick={() => setSelectedPoint(null)} style={{ ...modalBtn, color: C.red }}>×</button>
                </div>
              </div>

              <div style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ color: C.white, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>{selectedPoint.name}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{selectedPoint.country} · {TYPE_LABELS[selectedPoint.type]}</div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${C.border}` }}>
                <div style={modalCell}>
                  <div style={modalLabel}>CAPACITY</div>
                  <div style={{ color: C.white, fontWeight: 700, fontSize: 12 }}>{selectedPoint.capacity || '—'}</div>
                </div>
                <div style={{ ...modalCell, borderLeft: `1px solid ${C.border}` }}>
                  <div style={modalLabel}>FLOW · BPD</div>
                  <div style={{ color: C.green, fontWeight: 700, fontSize: 12 }}>
                    {selectedPoint.bpd ? selectedPoint.bpd.toLocaleString() : '—'}
                  </div>
                </div>
                <div style={{ ...modalCell, borderTop: `1px solid ${C.border}` }}>
                  <div style={modalLabel}>LAT · LNG</div>
                  <div style={{ color: C.amber, fontWeight: 700, fontSize: 11 }}>
                    {selectedPoint.lat.toFixed(2)}° · {selectedPoint.lng.toFixed(2)}°
                  </div>
                </div>
                <div style={{ ...modalCell, borderTop: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}` }}>
                  <div style={modalLabel}>OPERATOR</div>
                  <div style={{ color: C.amber, fontWeight: 700, fontSize: 11 }}>{selectedPoint.ticker || 'PRIVATE'}</div>
                </div>
              </div>

              {/* Local risk (weather) */}
              <div style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
                <div style={modalLabel}>LOCAL RISK · WX</div>
                <div style={{ color: selectedPoint.weather?.includes('STORM') || selectedPoint.weather?.includes('SNOW') ? C.red : C.text, fontSize: 10, fontWeight: 600 }}>
                  {selectedPoint.weather || 'NO REPORT'}
                </div>
              </div>

              {/* Sentiment */}
              <div style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
                <div style={modalLabel}>ORACLE · SENTIMENT</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: C.faint, position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: '50%', top: 0, bottom: 0,
                      width: `${Math.abs((selectedPoint.sentiment ?? 0) * 50)}%`,
                      transform: (selectedPoint.sentiment ?? 0) < 0 ? 'translateX(-100%)' : 'none',
                      background: sentimentCol(selectedPoint.sentiment),
                    }} />
                    <div style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1, background: C.muted }} />
                  </div>
                  <span style={{ color: sentimentCol(selectedPoint.sentiment), fontSize: 10, fontWeight: 700, width: 40, textAlign: 'right' }}>
                    {selectedPoint.sentiment !== undefined ? (selectedPoint.sentiment > 0 ? '+' : '') + selectedPoint.sentiment.toFixed(2) : '—'}
                  </span>
                </div>
              </div>

              {/* Notes / AI summary */}
              <div style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
                <div style={modalLabel}>ORACLE · SUMMARY</div>
                <div style={{ color: C.text, fontSize: 10, lineHeight: 1.4 }}>
                  {selectedPoint.notes || `${selectedPoint.name} · ${TYPE_LABELS[selectedPoint.type]} asset.`}
                  {selectedPoint.bpd && ` Current flow ~${(selectedPoint.bpd / 1000).toFixed(0)}k bpd.`}
                  {selectedPoint.sentiment !== undefined && selectedPoint.sentiment < -0.3 && ' Oracle flags negative news momentum.'}
                  {selectedPoint.sentiment !== undefined && selectedPoint.sentiment > 0.3  && ' Oracle reads constructive flow narrative.'}
                </div>
              </div>

              {/* Nearby news in viewport tagged near this asset */}
              <div style={{ padding: '6px 8px' }}>
                <div style={modalLabel}>NEARBY PULSE</div>
                {NEWS_FEED
                  .map(n => ({ n, d: Math.hypot(n.lat - selectedPoint.lat, n.lng - selectedPoint.lng) }))
                  .sort((a, b) => a.d - b.d)
                  .slice(0, 3)
                  .map(({ n, d }) => (
                    <div key={n.id} onClick={() => setSelectedNews(n)} style={{
                      display: 'flex', gap: 6, padding: '2px 0', cursor: 'pointer', fontSize: 9,
                      borderBottom: `1px solid ${C.border}`,
                    }}>
                      <span style={{ color: C.faint, width: 28 }}>{n.t}</span>
                      <span style={{ color: n.severity === 'alert' ? C.red : C.amber, width: 32, fontWeight: 700 }}>{n.tag}</span>
                      <span style={{ color: C.text, flex: 1 }}>{n.headline.length > 36 ? n.headline.slice(0, 36) + '…' : n.headline}</span>
                      <span style={{ color: C.faint }}>{d.toFixed(0)}°</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ── NEWS TERMINAL MODAL ──────────────────────────────────── */}
          {selectedNews && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', bottom: 32, left: 32, width: 420,
                background: '#000', border: `1px solid ${selectedNews.severity === 'alert' ? C.red : C.amber}`,
                boxShadow: `0 0 0 1px ${selectedNews.severity === 'alert' ? C.red : C.amber}33`,
                zIndex: 50,
              }}>
              <div style={{
                display: 'flex', alignItems: 'center', height: 18,
                borderBottom: `1px solid ${selectedNews.severity === 'alert' ? C.red : C.amber}`,
              }}>
                <div style={{ padding: '0 8px', color: selectedNews.severity === 'alert' ? C.red : C.amber, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, background: selectedNews.severity === 'alert' ? C.red : C.amber }} />
                  PULSE // {selectedNews.tag} · {selectedNews.t}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex' }}>
                  <button onClick={() => { setMapCenter({ lat: selectedNews.lat, lng: selectedNews.lng }); setZoom(5) }} style={modalBtn}>ZOOM</button>
                  <button onClick={() => setSelectedNews(null)} style={{ ...modalBtn, color: C.red }}>×</button>
                </div>
              </div>
              <div style={{ padding: '8px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ color: C.white, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{selectedNews.headline}</div>
                <div style={{ color: C.muted, fontSize: 9, marginTop: 4, letterSpacing: '0.08em' }}>
                  LAT {selectedNews.lat.toFixed(2)} · LNG {selectedNews.lng.toFixed(2)} · SEVERITY {selectedNews.severity.toUpperCase()}
                </div>
              </div>
              <div style={{ padding: '8px', color: C.text, fontSize: 10, lineHeight: 1.5 }}>
                {selectedNews.body}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT RAIL (collapsible) */}
        {railOpen && (
          <div style={{
            width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: '#000', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', height: 22, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              {(['WATCH', 'GEO', 'ORACLE', 'PULSE', 'CRYPTO'] as const).map(id => (
                <button key={id} onClick={() => setActivePanel(id)} style={{
                  flex: 1, background: '#000', border: 'none',
                  borderRight: `1px solid ${C.border}`,
                  borderBottom: activePanel === id ? `1px solid ${id === 'CRYPTO' ? C.green : C.amber}` : `1px solid ${C.border}`,
                  color: activePanel === id ? (id === 'CRYPTO' ? C.green : C.amber) : C.muted,
                  fontSize: 9, fontFamily: 'inherit', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
                }}>{id === 'WATCH' ? 'TOWER' : id}</button>
              ))}
            </div>

            {activePanel === 'WATCH' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={sectionHeader}>WATCHTOWER · MAJORS</div>
                <table style={tableStyle}>
                  <thead><tr>
                    <th style={th}>SYM</th>
                    <th style={th}>NAME</th>
                    <th style={{ ...th, textAlign: 'right' }}>LAST</th>
                    <th style={{ ...th, textAlign: 'right' }}>CHG%</th>
                  </tr></thead>
                  <tbody>
                    {prices.map(c => {
                      const isPos = (c.change ?? 0) >= 0
                      return (
                        <tr key={c.symbol} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                          onClick={() => runCommand(c.name.split(' ')[0])}>
                          <td style={{ ...td, color: C.amber, fontWeight: 700 }}>{c.ticker}</td>
                          <td style={{ ...td, color: C.text }}>{c.name}</td>
                          <td style={{ ...td, color: C.white, textAlign: 'right', fontWeight: 700 }}>
                            {c.price !== null ? fmtPrice(c.price, c.symbol) : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', color: c.price === null ? C.faint : isPos ? C.green : C.red, fontWeight: 700 }}>
                            {c.change !== null ? `${isPos ? '+' : ''}${c.change.toFixed(2)}` : '...'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activePanel === 'PULSE' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={sectionHeader}>
                  PULSE · {newsInView.length}/{NEWS_FEED.length} IN VIEW
                </div>
                {(viewportBounds ? newsInView : NEWS_FEED).map(n => (
                  <div key={n.id} onClick={() => { setSelectedNews(n); setMapCenter({ lat: n.lat, lng: n.lng }); setZoom(Math.max(zoom, 4)) }}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 6,
                      padding: '4px 8px', borderBottom: `1px solid ${C.border}`,
                      fontSize: 10, lineHeight: 1.3, cursor: 'pointer',
                    }}>
                    <span style={{ color: C.faint, width: 28, flexShrink: 0 }}>{n.t}</span>
                    <span style={{
                      width: 36, flexShrink: 0, fontWeight: 700, letterSpacing: '0.1em',
                      color: n.severity === 'alert' ? C.red : n.severity === 'risk' ? C.red : C.amber,
                    }}>{n.tag}</span>
                    <span style={{ color: C.text, flex: 1 }}>{n.headline}</span>
                  </div>
                ))}
                {viewportBounds && newsInView.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: C.muted, fontSize: 10 }}>
                    NO PULSE IN VIEW · ZOOM OUT OR PAN
                  </div>
                )}
              </div>
            )}

            {activePanel === 'GEO' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={sectionHeader}>
                  REGIONS · BY {overlayMetric.toUpperCase()}
                  <div style={{ display: 'flex', marginLeft: 'auto' }}>
                    {(['oil', 'gas', 'gold', 'risk'] as const).map(m => (
                      <button key={m} onClick={() => setOverlayMetric(m)} style={{
                        padding: '0 4px', height: 16, border: `1px solid ${overlayMetric === m ? C.amber : C.border}`,
                        borderLeft: 'none', background: overlayMetric === m ? `${C.amber}22` : 'transparent',
                        color: overlayMetric === m ? C.amber : C.muted, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      }}>{m.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <table style={tableStyle}>
                  <thead><tr><th style={th}>#</th><th style={th}>CC</th><th style={th}>COUNTRY</th><th style={{ ...th, textAlign: 'right' }}>VAL</th></tr></thead>
                  <tbody>
                    {[...COUNTRY_DATA].sort((a, b) => (b[overlayMetric] as number) - (a[overlayMetric] as number))
                      .filter(c => (c[overlayMetric] as number) > 0).slice(0, 22)
                      .map((c, i) => {
                        const val = c[overlayMetric] as number
                        const col = overlayMetric === 'risk' ? C.red : C.amber
                        return (
                          <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                            onClick={() => { setMapCenter({ lat: c.lat, lng: c.lng }); setZoom(5) }}>
                            <td style={{ ...td, color: C.faint, width: 18 }}>{(i + 1).toString().padStart(2, '0')}</td>
                            <td style={{ ...td, color: col, fontWeight: 700, width: 28 }}>{c.id}</td>
                            <td style={{ ...td, color: C.text }}>{c.name}</td>
                            <td style={{ ...td, color: col, fontWeight: 700, textAlign: 'right' }}>{val.toFixed(1)}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {activePanel === 'ORACLE' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={sectionHeader}>ORACLE · AI SIGNAL ENGINE</div>
                <div style={{ padding: '6px 8px', fontSize: 10, color: C.muted, borderBottom: `1px solid ${C.border}`, lineHeight: 1.5 }}>
                  <div><span style={{ color: C.amber, fontWeight: 700 }}>STATUS</span>&nbsp;&nbsp;<span style={{ color: C.green }}>ONLINE</span> · ensemble v3.4</div>
                  <div><span style={{ color: C.amber, fontWeight: 700 }}>FEEDS</span>&nbsp;&nbsp;{prices.filter(p => p.price !== null).length}/{prices.length} healthy</div>
                  <div suppressHydrationWarning><span style={{ color: C.amber, fontWeight: 700 }}>RESYNC</span> {fmtTime(now)}</div>
                </div>
                <table style={tableStyle}>
                  <thead><tr><th style={th}>SYM</th><th style={th}>DIR</th><th style={{ ...th, textAlign: 'right' }}>CONF</th><th style={th}>RATIONALE</th></tr></thead>
                  <tbody>
                    {ORACLE_SIGNALS.map(s => (
                      <tr key={s.sym} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ ...td, color: C.amber, fontWeight: 700 }}>{s.sym}</td>
                        <td style={{ ...td, color: s.dir === 'LONG' ? C.green : C.red, fontWeight: 700 }}>{s.dir}</td>
                        <td style={{ ...td, color: C.white, textAlign: 'right', fontWeight: 700 }}>{(s.conf * 100).toFixed(0)}%</td>
                        <td style={{ ...td, color: C.text, fontSize: 9 }}>{s.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={sectionHeader}>RISK FLAGS</div>
                <div style={{ padding: '4px 8px', fontSize: 10, lineHeight: 1.6 }}>
                  <div><span style={{ color: C.red }}>■</span> <span style={{ color: C.red }}>HORMUZ</span> tanker AIS anomalies elevated</div>
                  <div><span style={{ color: C.red }}>■</span> <span style={{ color: C.red }}>VENEZUELA</span> sanctions news risk window</div>
                  <div><span style={{ color: C.amber }}>■</span> <span style={{ color: C.amber }}>LIBYA</span> port closure probability 0.34</div>
                  <div><span style={{ color: C.green }}>■</span> <span style={{ color: C.green }}>NORTH SEA</span> nominal flows</div>
                </div>
              </div>
            )}

            {activePanel === 'CRYPTO' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ ...sectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>CRYPTO INTEL · LIVE FEED</span>
                  {newsLoading && <span style={{ color: C.amber, fontSize: 8, animation: 'pulse 1s infinite' }}>●</span>}
                  {!newsLoading && cryptoNews.length > 0 && <span style={{ color: C.green, fontSize: 8 }}>● LIVE</span>}
                </div>
                {newsError && <div style={{ padding: '6px 8px', color: C.red, fontSize: 9 }}>{newsError}</div>}
                {newsLoading && cryptoNews.length === 0 && (
                  <div style={{ padding: '12px 8px', color: C.muted, fontSize: 9, textAlign: 'center' }}>FETCHING FEED…</div>
                )}
                {cryptoNews.map(n => (
                  <div key={n.id}
                    style={{ padding: '5px 8px', borderBottom: `1px solid ${C.border}`, cursor: 'default' }}>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ color: C.faint, fontSize: 8, flexShrink: 0 }}>{n.t}</span>
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', flexShrink: 0,
                        color: n.severity === 'alert' ? C.red : n.severity === 'risk' ? C.amber : C.green,
                      }}>{n.tag}</span>
                      <span style={{
                        marginLeft: 'auto', fontSize: 8, fontWeight: 700,
                        color: n.sentiment > 0.1 ? C.green : n.sentiment < -0.1 ? C.red : C.muted,
                      }}>{n.sentiment > 0.1 ? '▲' : n.sentiment < -0.1 ? '▼' : '─'} {Math.abs(n.sentiment * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.text, lineHeight: 1.35 }}>{n.headline}</div>
                    <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{n.source}</div>
                  </div>
                ))}
                <div style={{ padding: '6px 8px', borderTop: `1px solid ${C.border}`, background: '#050505' }}>
                  <div style={{ fontSize: 8, color: C.faint, letterSpacing: '0.1em' }}>USE AS QUANT BLOCK → api.syne</div>
                  <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>Drop "SYNE Terminal" block in Agent Builder to wire this feed into your strategy signal pipeline</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BASE DECK (bottom) ────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, background: '#000', display: 'flex', flexDirection: 'column' }}>

        {/* Telemetry strip */}
        <div style={{
          height: 18, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}`,
          fontSize: 9, letterSpacing: '0.1em',
        }}>
          <div style={{ padding: '0 8px', borderRight: `1px solid ${C.border}`, height: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: wsStatus.ok ? C.green : C.red }}>●</span>
            <span style={{ color: C.amber, fontWeight: 700 }}>WSS</span>
            <span style={{ color: C.text }}>STREAM·{wsStatus.latency}ms</span>
          </div>
          <div style={{ padding: '0 8px', borderRight: `1px solid ${C.border}`, color: C.muted, height: '100%', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: C.amber, marginRight: 6, fontWeight: 700 }}>LAT</span>{mapCenter.lat.toFixed(3)}
            <span style={{ margin: '0 4px', color: C.faint }}>·</span>
            <span style={{ color: C.amber, marginRight: 6, fontWeight: 700 }}>LNG</span>{mapCenter.lng.toFixed(3)}
            <span style={{ margin: '0 4px', color: C.faint }}>·</span>
            <span style={{ color: C.amber, marginRight: 6, fontWeight: 700 }}>Z</span>{zoom}
          </div>
          <div style={{ padding: '0 8px', borderRight: `1px solid ${C.border}`, color: C.green, fontStyle: 'italic', height: '100%', display: 'flex', alignItems: 'center' }}>
            “{DYLAN_LINES[dylanIdx]}”
          </div>
          <div style={{ marginLeft: 'auto', padding: '0 8px', display: 'flex', gap: 10, height: '100%', alignItems: 'center', color: C.muted }}>
            <span style={{ color: marketStatus.col }}>● {marketStatus.txt}</span>
            <span suppressHydrationWarning>{fmtTime(now)}</span>
          </div>
        </div>

        {/* Console log (last 3 lines) */}
        <div style={{
          maxHeight: 56, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse',
          borderBottom: `1px solid ${C.border}`, background: '#000',
        }}>
          {cmdLog.slice(-3).reverse().map((l, i) => (
            <div key={cmdLog.length - i} style={{
              padding: '1px 8px', fontSize: 10,
              color: l.kind === 'in' ? C.amber : l.kind === 'err' ? C.red : C.text,
              whiteSpace: 'pre', letterSpacing: '0.04em',
            }}>{l.text}</div>
          ))}
        </div>

        {/* Command bar */}
        <div style={{
          height: 26, display: 'flex', alignItems: 'stretch',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ padding: '0 8px', borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, background: C.amber }} />
            <span style={{ color: C.amber, fontWeight: 700, letterSpacing: '0.18em', fontSize: 10 }}>SYNE</span>
          </div>
          <form
            style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px' }}
            onSubmit={e => { e.preventDefault(); runCommand(cmd); setCmd('') }}
          >
            <span style={{ color: C.amber, marginRight: 6 }}>›</span>
            <input
              ref={cmdInputRef}
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              placeholder='TYPE COMMAND  e.g.  WTI  ·  F1 INFRA  ·  COUNTRY SA  ·  SITE GHAWAR  ·  HELP'
              spellCheck={false}
              autoComplete="off"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: C.white, fontFamily: 'inherit', fontSize: 11, letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            />
            <span style={{ color: C.faint, fontSize: 9, letterSpacing: '0.12em' }}>‹GO› ↵</span>
          </form>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {(['INFRA', 'FLOW', 'RISK'] as const).map((p, i) => (
              <button key={p} onClick={() => runCommand(`F${i + 1} GO`)} style={{
                padding: '0 10px', border: 'none', borderLeft: `1px solid ${C.border}`,
                background: activePreset === p ? `${C.amber}22` : 'transparent',
                color: activePreset === p ? C.amber : C.muted,
                fontFamily: 'inherit', fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', cursor: 'pointer',
              }}>F{i + 1}/{p}</button>
            ))}
          </div>
        </div>

        {/* Ticker tape — green-text */}
        <div style={{
          height: 22, display: 'flex', alignItems: 'center', overflow: 'hidden',
          background: '#000',
        }}>
          <div style={{
            padding: '0 8px', borderRight: `1px solid ${C.border}`, height: '100%',
            display: 'flex', alignItems: 'center', color: C.green, fontWeight: 700, fontSize: 10, letterSpacing: '0.18em',
          }}>SYNE://TAPE</div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 24, animation: 'syne-ticker 60s linear infinite', whiteSpace: 'nowrap', willChange: 'transform' }}>
              {[...Array(3)].flatMap((_, ri) =>
                prices.filter(p => p.price !== null).map(p => {
                  const isPos = (p.change ?? 0) >= 0
                  return (
                    <span key={`${ri}-${p.symbol}`} style={{ fontSize: 10, color: C.green, letterSpacing: '0.06em', fontWeight: 600 }}>
                      <span style={{ color: C.amber }}>{p.ticker}</span>{' '}
                      <span style={{ color: C.green }}>{fmtPrice(p.price, p.symbol)}</span>{' '}
                      <span style={{ color: isPos ? C.green : C.red }}>
                        {p.change !== null ? `${isPos ? '+' : ''}${p.change.toFixed(2)}%` : ''}
                      </span>
                      <span style={{ color: C.faint, marginLeft: 16 }}>·</span>
                    </span>
                  )
                })
              )}
            </div>
          </div>
          <div style={{
            padding: '0 8px', borderLeft: `1px solid ${C.border}`, height: '100%',
            display: 'flex', alignItems: 'center', color: C.muted, fontSize: 10, letterSpacing: '0.1em',
          }}>
            <span style={{ color: C.green }}>●</span>&nbsp;LIVE&nbsp;·&nbsp;<span suppressHydrationWarning>{fmtTime(now)}</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes syne-ticker { from { transform: translateX(0) } to { transform: translateX(-33.33%) } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: ${C.border2}; }
      `}</style>
    </div>
  )
}

const sectionHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '3px 8px', background: '#000',
  borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border2}`,
  color: C.amber, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
  textTransform: 'uppercase', height: 18,
}
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 10 }
const th: React.CSSProperties = {
  padding: '3px 6px', textAlign: 'left', color: C.amber,
  borderBottom: `1px solid ${C.border2}`, fontWeight: 700,
  fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
}
const td: React.CSSProperties = { padding: '3px 6px' }
const zoomBtn: React.CSSProperties = {
  width: 22, height: 22, border: `1px solid ${C.border2}`, background: '#000',
  color: C.amber, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
}
const modalBtn: React.CSSProperties = {
  height: 18, padding: '0 8px', border: 'none', borderLeft: `1px solid ${C.border}`,
  background: '#000', color: C.amber, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
}
const modalLabel: React.CSSProperties = {
  color: C.amber, fontSize: 8, fontWeight: 700, letterSpacing: '0.18em', marginBottom: 2,
}
const modalCell: React.CSSProperties = { padding: '5px 8px' }
