export const THERMAL = {
  name: 'Project Thermal',
  description: 'Warm, premium aesthetic for ASE Quant Lab',
  mode: 'dark',
  colors: {
    bg: '#161412',
    bgElevated: '#1C1A18',
    bgOverlay: '#1C1A18E6',
    surface: '#1E1C1A',
    surface2: '#252220',
    surface3: '#2D2A28',
    border: 'rgba(255,248,240,0.08)',
    borderActive: 'rgba(196,145,100,0.35)',
    text: '#F5F0E8',
    text2: '#D4CCC2',
    textMuted: '#8A827A',
    textFaint: '#5C5652',
    // Legacy compatibility
    faint: '#5C5652',
    muted: '#8A827A',
  },
  accents: {
    primary: '#C4915E',
    primaryLight: '#E0B888',
    primaryDark: '#8B6A42',
    orange: '#D4883A',
    terracotta: '#C46D5E',
    sage: '#7D9B76',
    dust: '#A8B4C4',
    violet: '#9B8AB8',
    violetLight: '#C4B8D8',
    gold: '#C9A962',
    cream: '#F5E6D3',
    // Legacy compatibility
    green: '#7D9B76',
    red: '#C46D5E',
    amber: '#C4915E',
    blue: '#A8B4C4',
    cyan: '#8AB8C4',
    pink: '#C49B8A',
  },
  indicators: {
    success: '#7D9B76',
    error: '#C46D5E',
    warning: '#C4915E',
    info: '#A8B4C4',
    green: '#7D9B76',
    red: '#C46D5E',
    amber: '#C4915E',
    violet: '#9B8AB8',
  },
  shadows: {
    glow: (color: string) => `0 0 20px ${color}30, 0 4px 12px rgba(0,0,0,0.4)`,
    card: '0 2px 8px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.2)',
    elevated: '0 4px 16px rgba(0,0,0,0.4), 0 12px 40px rgba(0,0,0,0.3)',
  },
  glass: {
    surface: 'rgba(30,28,26,0.7)',
    backdropFilter: 'blur(12px) saturate(180%)',
  },
  typography: {
    header: "'Fraunces', 'Reckless', Georgia, serif",
    body: "'DM Sans', -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 24,
  },
}

export const CLUSTERS = {
  momentum: {
    label: 'Momentum',
    blocks: ['ind.ema_cross', 'ind.macd', 'ind.rsi'],
    color: THERMAL.accents.primary,
  },
  meanReversion: {
    label: 'Mean Reversion',
    blocks: ['ind.rsi', 'ind.zscore', 'ind.bb'],
    color: THERMAL.accents.terracotta,
  },
  risk: {
    label: 'Risk Management',
    blocks: ['risk.killswitch', 'risk.parity', 'exec.twap', 'exec.vwap'],
    color: THERMAL.accents.sage,
  },
  ml: {
    label: 'ML / AI',
    blocks: ['ml.gbm', 'ml.lstm', 'ml.regime'],
    color: THERMAL.accents.violet,
  },
  data: {
    label: 'Data Sources',
    blocks: ['data.binance', 'data.coingecko', 'data.onchain', 'data.funding'],
    color: THERMAL.accents.dust,
  },
}

export const ACTIVE_STATES = {
  glow: (color: string) => ({
    boxShadow: `0 0 24px ${color}40, 0 0 0 1px ${color}30`,
    transform: 'translateY(-2px)',
  }),
  pulse: {
    animation: 'thermalPulse 2s ease-in-out infinite',
  },
}

export function getBlockClusterColor(blockId: string): string {
  for (const cluster of Object.values(CLUSTERS)) {
    if (cluster.blocks.includes(blockId)) return cluster.color
  }
  return THERMAL.accents.primary
}

export function getClusterForBlock(blockId: string): string | null {
  for (const [key, cluster] of Object.entries(CLUSTERS)) {
    if (cluster.blocks.includes(blockId)) return key
  }
  return null
}