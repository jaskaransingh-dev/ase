// ============================================================
// ASE Institutional Trading Simulator (v3)
// 
// Full architecture upgrade:
// - Event-driven multi-asset simulation
// - Kafka-like Event Bus
// - Multi-asset Portfolio Engine
// - Order Book (L2) Simulation
// - Monte Carlo Slippage Model
// - Vectorized Backtests
// ============================================================

// ──────────────────────────────────────────────────────────────
// 1. EVENT BUS ARCHITECTURE
// ──────────────────────────────────────────────────────────────

export interface Bar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Signal {
  strategyId: string
  asset: string
  direction: number     // -1 to 1
  confidence: number    // 0 to 1
  timestamp: string
}

export interface Order {
  id: string
  date: string
  asset: string
  side: 'BUY' | 'SELL'
  targetWeight: number  // -1 to 1
  targetShares?: number
  status: 'pending' | 'filled' | 'cancelled'
}

export interface Fill {
  orderId: string
  date: string
  asset: string
  side: 'BUY' | 'SELL'
  filledShares: number
  avgPrice: number
  commission: number
  slippageBps: number
}

export type Event =
  | { type: 'BAR'; asset: string; data: Bar }
  | { type: 'SIGNAL'; strategyId: string; asset: string; signal: Signal }
  | { type: 'ORDER'; order: Order }
  | { type: 'FILL'; fill: Fill }
  | { type: 'MARKET_UPDATE'; data: { assets: string[]; timestamp: string } }
  | { type: 'POSITION_UPDATE'; positions: PositionMap }

type EventHandler = (event: Event) => void

export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map()
  private eventLog: Event[] = []
  private replayIndex = 0

  on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
  }

  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType)
    if (!handlers) return
    const idx = handlers.indexOf(handler)
    if (idx >= 0) handlers.splice(idx, 1)
  }

  emit(event: Event): void {
    this.eventLog.push(event)
    const handlers = this.handlers.get(event.type)
    if (!handlers) return
    for (const h of handlers) {
      h(event)
    }
  }

  replay(): void {
    this.replayIndex = 0
    for (const event of this.eventLog) {
      const handlers = this.handlers.get(event.type)
      if (!handlers) continue
      for (const h of handlers) {
        h(event)
      }
    }
  }

  getEventLog(): Event[] {
    return [...this.eventLog]
  }

  clear(): void {
    this.eventLog = []
    this.replayIndex = 0
  }
}

// ──────────────────────────────────────────────────────────────
// 2. MULTI-ASSET PORTFOLIO ENGINE
// ──────────────────────────────────────────────────────────────

export interface PositionMap {
  [asset: string]: number  // weight in [-1, 1]
}

export interface PortfolioState {
  equity: number
  positions: PositionMap
  cash: number
  date: string
}

export class PortfolioEngine {
  equity = 100000
  initialEquity = 100000
  positions: PositionMap = {}
  cash: number = 0
  history: PortfolioState[] = []

  update(asset: string, returnValue: number, newPosition: number): void {
    const oldPosition = this.positions[asset] || 0
    const positionChange = oldPosition * returnValue * this.equity
    this.equity += positionChange
    this.positions[asset] = newPosition
  }

  getPositionChange(asset: string, newPosition: number): number {
    return (newPosition - (this.positions[asset] || 0)) * this.equity
  }

  rebalance(asset: string, newWeight: number): number {
    const currentWeight = this.positions[asset] || 0
    const weightDiff = newWeight - currentWeight
    return weightDiff * this.equity
  }

  getNetExposure(): number {
    return Object.values(this.positions).reduce((sum, w) => sum + Math.abs(w), 0)
  }

  getNetPosition(): number {
    return Object.values(this.positions).reduce((sum, w) => sum + w, 0)
  }

  getWeight(asset: string): number {
    return this.positions[asset] || 0
  }

  snapshot(date: string): void {
    this.history.push({
      equity: this.equity,
      positions: { ...this.positions },
      cash: this.cash,
      date,
    })
  }

  getHistory(): PortfolioState[] {
    return [...this.history]
  }

  reset(): void {
    this.equity = this.initialEquity
    this.positions = {}
    this.cash = 0
    this.history = []
  }
}

// ──────────────────────────────────────────────────────────────
// 3. ORDER BOOK SIMULATION (LEVEL 2 MODEL)
// ──────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number
  size: number
}

export class OrderBook {
  bids: OrderBookLevel[] = []
  asks: OrderBookLevel[] = []
  spread: number = 0.0002
  midPrice: number = 0

  constructor(midPrice: number = 0, spread: number = 0.0002) {
    this.midPrice = midPrice
    this.spread = spread
    this.initLevels()
  }

  private initLevels(): void {
    const bidStart = this.midPrice * (1 - this.spread)
    const askStart = this.midPrice * (1 + this.spread)
    
    this.bids = []
    this.asks = []
    
    for (let i = 0; i < 10; i++) {
      this.bids.push({ price: bidStart * (1 - i * 0.0001), size: 1000 * (10 - i) })
      this.asks.push({ price: askStart * (1 + i * 0.0001), size: 1000 * (10 - i) })
    }
  }

  updateMidPrice(price: number): void {
    this.midPrice = price
    this.initLevels()
  }

  getBestBid(): number {
    return this.bids[0]?.price || this.midPrice * (1 - this.spread)
  }

  getBestAsk(): number {
    return this.asks[0]?.price || this.midPrice * (1 + this.spread)
  }

  getSpread(): number {
    return this.getBestAsk() - this.getBestBid()
  }

  getMid(): number {
    return (this.getBestBid() + this.getBestAsk()) / 2
  }
}

// ──────────────────────────────────────────────────────────────
// 4. MONTE CARLO SLIPPAGE MODEL
// ──────────────────────────────────────────────────────────────

export class MonteCarloSlippage {
  private nSamples: number
  private random: () => number

  constructor(nSamples: number = 50, random?: () => number) {
    this.nSamples = nSamples
    this.random = random || (() => Math.random())
  }

  simulate(bar: Bar, size: number, side: number): number {
    const volatility = (bar.high - bar.low) / bar.close
    const absSize = Math.abs(size)
    
    const samples: number[] = []
    for (let i = 0; i < this.nSamples; i++) {
      const noise = (this.random() - 0.5) * 2 - 1
      const sample = noise * volatility * absSize * side
      samples.push(sample)
    }
    
    return samples.reduce((a, b) => a + b, 0) / samples.length
  }

  simulateDistribution(bar: Bar, size: number, side: number): {
    mean: number
    p10: number
    p50: number
    p90: number
    std: number
  } {
    const samples: number[] = []
    for (let i = 0; i < this.nSamples; i++) {
      const noise = (this.random() - 0.5) * 2 - 1
      const volatility = (bar.high - bar.low) / bar.close
      const sample = noise * volatility * Math.abs(size) * side
      samples.push(sample)
    }
    
    samples.sort((a, b) => a - b)
    
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const variance = samples.reduce((sum, s) => sum + (s - mean) ** 2, 0) / samples.length
    
    return {
      mean,
      p10: samples[Math.floor(samples.length * 0.1)],
      p50: samples[Math.floor(samples.length * 0.5)],
      p90: samples[Math.floor(samples.length * 0.9)],
      std: Math.sqrt(variance),
    }
  }
}

// ──────────────────────────────────────────────────────────────
// 5. VECTORIZED BACKTESTS
// ──────────────────────────────────────────────────────────────

export interface VectorBacktestResult {
  equity: number[]
  returns: number[]
  drawdown: number[]
  positions: number[]
  dates: string[]
  stats: VectorStats
}

export interface VectorStats {
  totalReturn: number
  annualizedReturn: number
  sharpeRatio: number
  sortinoRatio: number
  maxDrawdown: number
  maxDrawdownPct: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  volatility: number
}

export class VectorBacktest {
  run(
    dates: string[],
    closes: number[],
    positions: number[],
    initialEquity: number = 100000,
  ): VectorBacktestResult {
    const returns = this.computeReturns(closes)
    const equity = this.computeEquity(returns, positions, initialEquity)
    const drawdown = this.computeDrawdown(equity)
    const stats = this.computeStats(returns, equity, drawdown, positions)
    
    return {
      equity,
      returns,
      drawdown,
      positions,
      dates,
      stats,
    }
  }

  private computeReturns(closes: number[]): number[] {
    const returns = new Array(closes.length).fill(0)
    for (let i = 1; i < closes.length; i++) {
      returns[i] = (closes[i] - closes[i - 1]) / closes[i - 1]
    }
    return returns
  }

  private computeEquity(
    returns: number[],
    positions: number[],
    initialEquity: number,
  ): number[] {
    const equity = new Array(returns.length)
    equity[0] = initialEquity
    
    for (let i = 1; i < returns.length; i++) {
      const positionReturn = positions[i - 1] * returns[i]
      equity[i] = equity[i - 1] * (1 + positionReturn)
    }
    
    return equity
  }

  private computeDrawdown(equity: number[]): number[] {
    const drawdown = new Array(equity.length).fill(0)
    let peak = equity[0]
    
    for (let i = 0; i < equity.length; i++) {
      if (equity[i] > peak) peak = equity[i]
      drawdown[i] = (peak - equity[i]) / peak
    }
    
    return drawdown
  }

  private computeStats(
    returns: number[],
    equity: number[],
    drawdown: number[],
    positions: number[],
  ): VectorStats {
    const totalReturn = (equity[equity.length - 1] / equity[0]) - 1
    
    const nPeriods = returns.length
    const periodsPerYear = 252
    const annualizedReturn = Math.pow(1 + totalReturn, periodsPerYear / nPeriods) - 1
    
    const positionReturns = returns.map((r, i) => r * positions[i])
    
    const avgReturn = positionReturns.reduce((a, b) => a + b, 0) / nPeriods
    const variance = positionReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / nPeriods
    const std = Math.sqrt(variance)
    
    const avgVol = std * Math.sqrt(periodsPerYear)
    const sharpeRatio = avgVol > 0 ? annualizedReturn / avgVol : 0
    
    const negativeReturns = positionReturns.filter(r => r < 0)
    const downsidedVariance = negativeReturns.length > 0
      ? negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length
      : 0
    const downsideVol = Math.sqrt(downsidedVariance) * Math.sqrt(periodsPerYear)
    const sortinoRatio = downsideVol > 0 ? annualizedReturn / downsideVol : 0
    
    const maxDrawdownPct = Math.max(...drawdown)
    const maxDrawdown = maxDrawdownPct * equity[0]
    
    const wins = positionReturns.filter(r => r > 0)
    const losses = positionReturns.filter(r => r < 0)
    const winRate = nPeriods > 0 ? wins.length / nPeriods : 0
    
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
    const avgLoss = losses.length > 0 
      ? losses.reduce((a, b) => a + b, 0) / losses.length 
      : 0
    
    const profitFactor = avgLoss < 0 
      ? Math.abs(avgWin * wins.length / (avgLoss * losses.length))
      : 0
    
    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownPct,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      volatility: avgVol,
    }
  }

  runMultiAsset(
    dates: string[],
    assetReturns: Record<string, number[]>,
    positions: Record<string, number[]>,
    initialEquity: number = 100000,
  ): VectorBacktestResult {
    const nPeriods = dates.length
    
    const totalReturns = new Array(nPeriods).fill(0)
    for (const asset of Object.keys(assetReturns)) {
      const returns = assetReturns[asset]
      const pos = positions[asset] || new Array(nPeriods).fill(0)
      for (let i = 0; i < nPeriods; i++) {
        totalReturns[i] += returns[i] * pos[i]
      }
    }
    
    const equity = new Array(nPeriods)
    equity[0] = initialEquity
    for (let i = 1; i < nPeriods; i++) {
      equity[i] = equity[i - 1] * (1 + totalReturns[i])
    }
    
    const drawdown = this.computeDrawdown(equity)
    
    const combinedPositions = new Array(nPeriods).fill(0)
    for (const asset of Object.keys(positions)) {
      for (let i = 0; i < nPeriods; i++) {
        combinedPositions[i] += positions[asset][i]
      }
    }
    
    const stats = this.computeStats(totalReturns, equity, drawdown, combinedPositions)
    
    return {
      equity,
      returns: totalReturns,
      drawdown,
      positions: combinedPositions,
      dates,
      stats,
    }
  }
}

// ──────────────────────────────────────────────────────────────
// 6. L2 EXECUTION ENGINE
// ──────────────────────────────────────────────────────────────

export interface ExecutionResult {
  price: number
  slippage: number
  fee: number
  fillQty: number
}

export class L2ExecutionEngine {
  private defaultFeeBps = 0.5
  private impactCoefficient = 0.00001

  execute(order: Order, bar: Bar): ExecutionResult {
    const mid = bar.close
    const absWeight = Math.abs(order.targetWeight)
    
    const impact = absWeight * bar.volume * this.impactCoefficient
    const slippage = impact
    
    const price = order.side === 'BUY'
      ? mid * (1 + slippage)
      : mid * (1 - slippage)
    
    const fee = absWeight * this.defaultFeeBps * 0.0001 * bar.close
    
    const fillQty = order.targetShares || absWeight * bar.volume
    
    return {
      price,
      slippage,
      fee,
      fillQty,
    }
  }

  executeWithOrderBook(order: Order, book: OrderBook): ExecutionResult {
    const mid = book.getMid()
    const absWeight = Math.abs(order.targetWeight)
    
    let price: number
    if (order.side === 'BUY') {
      const avgAsk = book.asks.slice(0, Math.ceil(absWeight * 10)).reduce((sum, l) => sum + l.price * l.size, 0) /
        book.asks.slice(0, Math.ceil(absWeight * 10)).reduce((sum, l) => sum + l.size, 0)
      price = avgAsk || mid * (1 + book.spread)
    } else {
      const avgBid = book.bids.slice(0, Math.ceil(absWeight * 10)).reduce((sum, l) => sum + l.price * l.size, 0) /
        book.bids.slice(0, Math.ceil(absWeight * 10)).reduce((sum, l) => sum + l.size, 0)
      price = avgBid || mid * (1 - book.spread)
    }
    
    const slippage = Math.abs(price - mid) / mid
    const fee = absWeight * this.defaultFeeBps * 0.0001 * price
    
    const fillQty = order.targetShares || absWeight * 1000000
    
    return {
      price,
      slippage,
      fee,
      fillQty,
    }
  }
}

// ──────────────────────────────────────────────────────────────
// 7. UNIFIED INSTITUTIONAL SIMULATOR
// ──────────────────────────────────────────────────────────────

export interface SimulatorConfig {
  initialEquity: number
  feeBps: number
  slippageModel: 'fixed' | 'volatility' | 'monte_carlo'
  useOrderBook: boolean
  monteCarloSamples: number
}

export interface SimulatedTrade {
  date: string
  asset: string
  side: 'BUY' | 'SELL'
  weight: number
  price: number
  shares: number
  pnl: number
  commission: number
}

export class InstitutionalSimulator {
  private eventBus: EventBus
  private portfolio: PortfolioEngine
  private orderBook: Map<string, OrderBook>
  private slippageModel: MonteCarloSlippage
  private executionEngine: L2ExecutionEngine
  private vectorEngine: VectorBacktest
  private config: SimulatorConfig
  private currentDate: string = ''
  private trades: SimulatedTrade[] = []

  constructor(config?: Partial<SimulatorConfig>) {
    this.config = {
      initialEquity: config?.initialEquity || 100000,
      feeBps: config?.feeBps || 0.5,
      slippageModel: config?.slippageModel || 'volatility',
      useOrderBook: config?.useOrderBook || false,
      monteCarloSamples: config?.monteCarloSamples || 50,
    }

    this.eventBus = new EventBus()
    this.portfolio = new PortfolioEngine()
    this.portfolio.equity = this.config.initialEquity
    this.portfolio.initialEquity = this.config.initialEquity
    this.orderBook = new Map()
    this.slippageModel = new MonteCarloSlippage(this.config.monteCarloSamples)
    this.executionEngine = new L2ExecutionEngine()
    this.vectorEngine = new VectorBacktest()

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.eventBus.on('BAR', (event) => {
      if (event.type === 'BAR') {
        this.handleBar(event.asset, event.data)
      }
    })

    this.eventBus.on('SIGNAL', (event) => {
      if (event.type === 'SIGNAL') {
        this.handleSignal(event.strategyId, event.asset, event.signal)
      }
    })
  }

  private handleBar(asset: string, bar: Bar): void {
    this.currentDate = bar.date
    
    if (this.config.useOrderBook) {
      const book = this.orderBook.get(asset)
      if (book) {
        book.updateMidPrice(bar.close)
      } else {
        this.orderBook.set(asset, new OrderBook(bar.close))
      }
    }
  }

  private handleSignal(strategyId: string, asset: string, signal: Signal): void {
    const currentWeight = this.portfolio.getWeight(asset)
    const targetWeight = signal.direction * signal.confidence
    
    if (Math.abs(targetWeight - currentWeight) > 0.01) {
      const order: Order = {
        id: `${strategyId}-${asset}-${Date.now()}`,
        date: this.currentDate,
        asset,
        side: targetWeight > currentWeight ? 'BUY' : 'SELL',
        targetWeight,
        status: 'pending',
      }

      this.eventBus.emit({ type: 'ORDER', order })

      const book = this.orderBook.get(asset)
      const bar = { date: this.currentDate, open: 0, high: 0, low: 0, close: 0, volume: 1000000 }

      const result = book && this.config.useOrderBook
        ? this.executionEngine.executeWithOrderBook(order, book)
        : this.executionEngine.execute(order, bar)

      this.portfolio.update(asset, 0, targetWeight)

      const fill: Fill = {
        orderId: order.id,
        date: this.currentDate,
        asset,
        side: order.side,
        filledShares: result.fillQty,
        avgPrice: result.price,
        commission: result.fee,
        slippageBps: result.slippage * 10000,
      }

      this.eventBus.emit({ type: 'FILL', fill })
    }
  }

  feedBar(asset: string, bar: Bar): void {
    this.eventBus.emit({ type: 'BAR', asset, data: bar })
  }

  sendSignal(strategyId: string, asset: string, signal: Signal): void {
    this.eventBus.emit({
      type: 'SIGNAL',
      strategyId,
      asset,
      signal,
    })
  }

  runVectorBacktest(
    dates: string[],
    closes: number[],
    positions: number[],
  ): VectorBacktestResult {
    return this.vectorEngine.run(dates, closes, positions, this.config.initialEquity)
  }

  runMultiAssetVector(
    dates: string[],
    assetReturns: Record<string, number[]>,
    positions: Record<string, number[]>,
  ): VectorBacktestResult {
    return this.vectorEngine.runMultiAsset(
      dates,
      assetReturns,
      positions,
      this.config.initialEquity,
    )
  }

  getEventBus(): EventBus {
    return this.eventBus
  }

  getPortfolio(): PortfolioEngine {
    return this.portfolio
  }

  getTrades(): SimulatedTrade[] {
    return [...this.trades]
  }

  getPositions(): PositionMap {
    return { ...this.portfolio.positions }
  }

  getEquity(): number {
    return this.portfolio.equity
  }

  reset(): void {
    this.eventBus.clear()
    this.portfolio.reset()
    this.orderBook.clear()
    this.trades = []
    this.currentDate = ''
  }
}