/**
 * Drag-drop block catalog for the Quant Lab agentic builder.
 * Each block is a typed primitive the AI (and user) can compose into a strategy.
 */

export type BlockKind = 'data' | 'indicator' | 'ml' | 'api' | 'risk' | 'execution' | 'signal'

export interface Block {
  id: string
  kind: BlockKind
  label: string
  description: string
  /** Hint the AI consumes when this block is dropped: "uses RSI on top10 crypto" */
  agentHint: string
  /** What field of AgentSpec this block influences */
  affects?: Array<'symbols' | 'alpha_type' | 'alpha_weights' | 'rebalance_freq' | 'forecast_horizon' | 'signal_scale_bps' | 'risk_aversion' | 'max_weight'>
}

export const BLOCKS: Block[] = [
  // ─── Data sources ────────────────────────────────────────
  { id: 'data.binance',    kind: 'data',   label: 'Binance OHLCV',    description: 'Spot OHLCV, 1m–1d',          agentHint: 'use Binance OHLCV bars',                 affects: ['symbols'] },
  { id: 'data.coingecko',  kind: 'data',   label: 'CoinGecko',        description: 'Market cap, volume, ranks',  agentHint: 'use CoinGecko market data',              affects: ['symbols'] },
  { id: 'data.yahoo',      kind: 'data',   label: 'Yahoo Finance',    description: 'Daily bars (fallback)',      agentHint: 'fall back to Yahoo Finance daily bars',  affects: ['symbols'] },
  { id: 'data.onchain',    kind: 'data',   label: 'On-chain (NUPL/SOPR)', description: 'Glassnode-style on-chain', agentHint: 'incorporate on-chain NUPL/SOPR signals', affects: ['alpha_type'] },
  { id: 'data.funding',    kind: 'data',   label: 'Funding Rates',    description: 'Perp funding (bias proxy)',  agentHint: 'consider perp funding rates as bias',    affects: ['alpha_type'] },

  // ─── Indicators ───────────────────────────────────────────
  { id: 'ind.rsi',         kind: 'indicator', label: 'RSI(14)',       description: 'Relative Strength Index',    agentHint: 'use RSI(14) for mean-reversion entries', affects: ['alpha_type'] },
  { id: 'ind.macd',        kind: 'indicator', label: 'MACD',          description: 'Moving Avg Convergence',     agentHint: 'use MACD for trend confirmation',        affects: ['alpha_type'] },
  { id: 'ind.bb',          kind: 'indicator', label: 'Bollinger',     description: '20σ Bollinger Bands',        agentHint: 'use Bollinger Bands (20σ) for vol breakouts', affects: ['alpha_type'] },
  { id: 'ind.atr',         kind: 'indicator', label: 'ATR',           description: 'Avg True Range',             agentHint: 'use ATR for position sizing',            affects: ['risk_aversion'] },
  { id: 'ind.ema_cross',   kind: 'indicator', label: 'EMA Cross',     description: 'Fast/Slow EMA crossover',    agentHint: 'EMA(12)/EMA(26) crossover for trend',    affects: ['alpha_type'] },
  { id: 'ind.zscore',      kind: 'indicator', label: 'Z-Score',       description: 'Rolling z-score (mean-rev)', agentHint: 'rolling z-score for mean-reversion',     affects: ['alpha_type'] },

  // ─── ML / Forecast ────────────────────────────────────────
  { id: 'ml.gbm',          kind: 'ml',     label: 'Gradient Boosted', description: 'Tabular tree ensemble',      agentHint: 'use a gradient-boosted forecaster',      affects: ['alpha_type', 'forecast_horizon'] },
  { id: 'ml.lstm',         kind: 'ml',     label: 'LSTM Forecaster',  description: 'Sequence model on prices',   agentHint: 'use an LSTM sequence forecaster',        affects: ['alpha_type', 'forecast_horizon'] },
  { id: 'ml.regime',       kind: 'ml',     label: 'HMM Regime',       description: 'Hidden Markov regime gate',  agentHint: 'gate signals through an HMM regime detector', affects: ['alpha_type'] },

  // ─── External APIs ────────────────────────────────────────
  { id: 'api.fear_greed',  kind: 'api',    label: 'Fear & Greed',     description: 'Crypto sentiment index',     agentHint: 'fade extremes on the Crypto Fear & Greed Index; use contrarian mean-reversion entries when index < 25 or > 75', affects: ['alpha_type'] },
  { id: 'api.alternative', kind: 'api',    label: 'Alternative.me',   description: 'Sentiment + macro',          agentHint: 'pull sentiment from alternative.me',     affects: ['alpha_type'] },
  { id: 'api.kraken',      kind: 'api',    label: 'Kraken Exec',      description: 'Live execution venue',       agentHint: 'route execution through Kraken',         affects: [] },
  { id: 'api.news',        kind: 'api',    label: 'Crypto News',      description: 'Live crypto news headlines', agentHint: 'incorporate real-time crypto news sentiment: positive headlines boost momentum signals, negative headlines trigger mean-reversion or de-risk', affects: ['alpha_type', 'signal_scale_bps'] },
  { id: 'api.satellite',   kind: 'api',    label: 'Satellite Data',   description: 'Alt-data: exchange flows',   agentHint: 'integrate satellite alternative data (exchange reserve flows, miner outflows); use as a macro signal layer to gate position sizing', affects: ['alpha_type', 'risk_aversion'] },
  { id: 'api.syne',        kind: 'api',    label: 'SYNE Terminal',    description: 'ASE live market intelligence', agentHint: 'pull live market data from ASE SYNE terminal: geo-macro events, news catalysts, on-chain alerts; blend into composite signal with 20% weight', affects: ['alpha_type', 'alpha_weights'] },

  // ─── Risk / Execution ────────────────────────────────────
  { id: 'risk.killswitch', kind: 'risk',   label: 'Kill Switch',      description: 'Halt at drawdown threshold', agentHint: 'add a max-drawdown kill switch',         affects: ['risk_aversion'] },
  { id: 'risk.parity',     kind: 'risk',   label: 'Risk Parity',      description: 'Equal-risk-contribution',    agentHint: 'use risk-parity weighting',              affects: ['risk_aversion', 'max_weight'] },
  { id: 'exec.twap',       kind: 'execution', label: 'TWAP',          description: 'Time-weighted execution',    agentHint: 'use TWAP execution',                     affects: [] },
  { id: 'exec.vwap',       kind: 'execution', label: 'VWAP',          description: 'Volume-weighted execution',  agentHint: 'use VWAP execution',                     affects: [] },

  // ─── Signal combinators ──────────────────────────────────
  { id: 'sig.composite',   kind: 'signal', label: 'Composite Blend',  description: 'Weighted alpha mixing',      agentHint: 'use a composite alpha blend (momentum + mean-reversion + volume)', affects: ['alpha_type', 'alpha_weights'] },
  { id: 'sig.consensus',   kind: 'signal', label: 'AI Consensus',     description: 'N-model consensus vote',     agentHint: 'gate signals through multi-model consensus voting', affects: ['alpha_type'] },
  { id: 'sig.majority',    kind: 'signal', label: 'Majority Vote',    description: '2-of-3 or 3-of-5 models',     agentHint: 'require majority agreement between momentum, mean-reversion, and ML models before executing', affects: ['alpha_type'] },
  { id: 'sig.unanimous',   kind: 'signal', label: 'Unanimous',       description: 'All models must agree',      agentHint: 'only execute when ALL models (momentum + mean-reversion + ML + sentiment) agree', affects: ['alpha_type'] },
  { id: 'sig.weighted',    kind: 'signal', label: 'Weighted Ensemble', description: 'Model weights 40/30/30',      agentHint: 'weighted ensemble: 40% momentum + 30% mean-reversion + 30% ML model', affects: ['alpha_type', 'alpha_weights'] },
  { id: 'sig.stacking',    kind: 'signal', label: 'Meta-Learner',     description: 'Stacked generalization',     agentHint: 'use a meta-learner (logistic regression) that takes base model predictions as features', affects: ['alpha_type'] },

  // ─── Extended catalog: 50+ additional blocks ─────────────────────────────
  // Data — DEX & on-chain
  { id: 'data.uniswap',    kind: 'data',   label: 'Uniswap v3 Pools',  description: 'Concentrated liquidity DEX', agentHint: 'pull Uniswap v3 pool ticks, depth, and TWAP for DEX-side execution and impact estimation', affects: ['symbols'] },
  { id: 'data.dex_tvl',    kind: 'data',   label: 'DEX TVL',           description: 'Total locked across DEXs',   agentHint: 'use DefiLlama TVL flows as a regime gauge — rising TVL ⇒ risk-on', affects: ['alpha_type'] },
  { id: 'data.cex_flows',  kind: 'data',   label: 'CEX Flows',         description: 'Exchange in/out balances',   agentHint: 'monitor BTC/ETH net flows to centralized exchanges; large outflows = bullish, inflows = bearish', affects: ['alpha_type'] },
  { id: 'data.stablecoin', kind: 'data',   label: 'Stablecoin Supply', description: 'USDT/USDC mint/burn flows',  agentHint: 'track stablecoin mints — surges in supply often precede crypto rallies', affects: ['alpha_type'] },
  { id: 'data.l1_fees',    kind: 'data',   label: 'L1 Gas Fees',       description: 'Eth/L2 fee market',          agentHint: 'use Ethereum gas fees as activity proxy; fee spikes correlate with risk-on regimes', affects: ['alpha_type'] },
  { id: 'data.miner',      kind: 'data',   label: 'Miner Revenue',     description: 'BTC miner economics',        agentHint: 'use BTC miner revenue/hash-price as miner-capitulation signal', affects: ['alpha_type'] },
  { id: 'data.whale',      kind: 'data',   label: 'Whale Tracker',     description: 'Large wallet movements',     agentHint: 'flag wallet moves >$10M; whale accumulation precedes upside', affects: ['alpha_type'] },
  { id: 'data.options',    kind: 'data',   label: 'Options Chain',     description: 'Deribit BTC/ETH options',    agentHint: 'pull Deribit IV surface, put/call ratios, and skew for vol-aware positioning', affects: ['alpha_type', 'risk_aversion'] },
  { id: 'data.perps',      kind: 'data',   label: 'Perp Open Interest', description: 'Aggregated perp OI',         agentHint: 'monitor perp open interest; rapid OI increases warn of crowded longs/shorts', affects: ['alpha_type'] },
  { id: 'data.basis',      kind: 'data',   label: 'Basis / Cash-Carry', description: 'Spot vs. futures spread',    agentHint: 'use BTC futures basis as risk appetite proxy; >10% annualized = euphoria', affects: ['alpha_type'] },
  { id: 'data.macro_dxy',  kind: 'data',   label: 'DXY / FX',          description: 'Dollar index + FX pairs',    agentHint: 'overlay DXY moves — strong dollar typically headwinds crypto', affects: ['alpha_type'] },
  { id: 'data.rates',      kind: 'data',   label: '2Y / 10Y Rates',    description: 'US Treasury yields',         agentHint: 'use 2Y/10Y curve and real yields as macro regime input', affects: ['alpha_type'] },
  { id: 'data.cpi',        kind: 'data',   label: 'CPI / Inflation',   description: 'BLS CPI prints',             agentHint: 'flag CPI print days; trade volatility expansion around release', affects: ['alpha_type', 'risk_aversion'] },
  { id: 'data.fomc',       kind: 'data',   label: 'FOMC Calendar',     description: 'Fed meeting + dot plot',     agentHint: 'reduce gross exposure into FOMC; reset post-statement', affects: ['risk_aversion'] },
  { id: 'data.equity',     kind: 'data',   label: 'SPY / NDX',         description: 'Equity benchmarks',          agentHint: 'cross-asset gate: hold off crypto longs when SPY breaking 50dma down', affects: ['alpha_type'] },

  // Indicators — momentum/volatility/volume/microstructure
  { id: 'ind.adx',         kind: 'indicator', label: 'ADX',            description: 'Trend strength',             agentHint: 'use ADX to gate trend-following signals; trade only when ADX > 25', affects: ['alpha_type'] },
  { id: 'ind.stoch',       kind: 'indicator', label: 'Stochastic',     description: '%K/%D oscillator',           agentHint: 'use Stochastic %K/%D crosses for short-term mean-reversion entries', affects: ['alpha_type'] },
  { id: 'ind.cci',         kind: 'indicator', label: 'CCI(20)',        description: 'Commodity Channel Index',    agentHint: 'use CCI to detect cyclic extremes (>+100 / <-100) for fade entries', affects: ['alpha_type'] },
  { id: 'ind.vwap',        kind: 'indicator', label: 'VWAP',           description: 'Session VWAP',               agentHint: 'use intraday VWAP as anchor for execution and pull-back entries', affects: ['alpha_type'] },
  { id: 'ind.obv',         kind: 'indicator', label: 'OBV',            description: 'On-Balance Volume',          agentHint: 'use OBV divergence vs price as volume-weighted confirmation', affects: ['alpha_type'] },
  { id: 'ind.donchian',    kind: 'indicator', label: 'Donchian',       description: '20/55 day breakout band',    agentHint: 'classic Donchian-channel breakout; long on new 20-day highs', affects: ['alpha_type'] },
  { id: 'ind.keltner',     kind: 'indicator', label: 'Keltner Channel', description: 'EMA + ATR envelope',         agentHint: 'use Keltner squeeze (low ATR) as breakout trigger', affects: ['alpha_type'] },
  { id: 'ind.heikin',      kind: 'indicator', label: 'Heikin-Ashi',    description: 'Smoothed candles',           agentHint: 'use Heikin-Ashi for cleaner trend confirmation than raw OHLC', affects: ['alpha_type'] },
  { id: 'ind.supertrend',  kind: 'indicator', label: 'SuperTrend',     description: 'ATR-based trailing stop',    agentHint: 'use SuperTrend(3, 10) as trailing stop and trend filter', affects: ['alpha_type', 'risk_aversion'] },
  { id: 'ind.fib',         kind: 'indicator', label: 'Fib Retracement', description: '0.382 / 0.5 / 0.618 levels', agentHint: 'use Fibonacci retracements for confluence entries off swing highs/lows', affects: ['alpha_type'] },
  { id: 'ind.ichimoku',    kind: 'indicator', label: 'Ichimoku Cloud', description: 'Multi-line trend system',    agentHint: 'use Ichimoku cloud break + tenkan/kijun cross for trend confirmation', affects: ['alpha_type'] },
  { id: 'ind.realvol',     kind: 'indicator', label: 'Realized Vol',   description: '20d realized vol',           agentHint: 'compute 20d realized vol; size positions inverse to vol (target volatility)', affects: ['risk_aversion'] },
  { id: 'ind.skew',        kind: 'indicator', label: 'Returns Skew',   description: '90d return skewness',        agentHint: 'use rolling return skew as fat-tail proxy; de-risk when skew goes deeply negative', affects: ['risk_aversion'] },

  // ML / forecasters
  { id: 'ml.transformer',  kind: 'ml',     label: 'Transformer',      description: 'Attention-based forecaster',  agentHint: 'use a small Transformer for multi-asset price forecasting', affects: ['alpha_type', 'forecast_horizon'] },
  { id: 'ml.cnn',          kind: 'ml',     label: 'CNN Image-Pred',   description: 'Chart-image classifier',     agentHint: 'render bars as candlestick image and classify with a small CNN', affects: ['alpha_type'] },
  { id: 'ml.rl',           kind: 'ml',     label: 'RL Agent',         description: 'PPO position-sizing',        agentHint: 'PPO-trained policy for sizing positions in [-1, 1]; reward = sharpe-adjusted PnL', affects: ['alpha_type'] },
  { id: 'ml.kalman',       kind: 'ml',     label: 'Kalman Filter',    description: 'State-space smoother',       agentHint: 'use Kalman filter to track latent fair value; trade reversion to filtered mean', affects: ['alpha_type'] },
  { id: 'ml.changepoint',  kind: 'ml',     label: 'Changepoint',      description: 'Bayesian online detection',  agentHint: 'detect regime changes with Bayesian Online Changepoint; freeze position on change', affects: ['alpha_type'] },
  { id: 'ml.embedding',    kind: 'ml',     label: 'News Embedding',   description: 'sentence-transformer NLP',   agentHint: 'embed news headlines with a sentence-transformer; trade headline-similarity to past pumps', affects: ['alpha_type'] },

  // Sentiment / Social
  { id: 'sent.twitter',    kind: 'api',    label: 'Twitter Sentiment', description: 'Crypto Twitter NLP',         agentHint: 'rolling sentiment from Crypto Twitter; fade extremes (>+90, <-90)', affects: ['alpha_type'] },
  { id: 'sent.reddit',     kind: 'api',    label: 'Reddit r/CC Buzz',  description: 'Reddit mention velocity',    agentHint: 'spike in r/CryptoCurrency mentions = retail FOMO; use as contrarian gate', affects: ['alpha_type'] },
  { id: 'sent.tg',         kind: 'api',    label: 'Telegram Pump Det.', description: 'Detect pump/group signals', agentHint: 'monitor major Telegram groups for coordinated buy signals; never trade with them', affects: ['alpha_type'] },
  { id: 'sent.gtrends',    kind: 'api',    label: 'Google Trends',     description: 'Search interest velocity',   agentHint: 'use Google Trends BTC/ETH search velocity as retail attention proxy', affects: ['alpha_type'] },

  // Macro / events APIs
  { id: 'api.tradingecon', kind: 'api',    label: 'TradingEconomics',  description: 'Global macro calendar',      agentHint: 'pull global macro calendar + actuals/forecasts; size down ahead of high-impact events', affects: ['risk_aversion'] },
  { id: 'api.glassnode',   kind: 'api',    label: 'Glassnode',         description: 'On-chain analytics',         agentHint: 'use Glassnode SOPR / NUPL / MVRV-Z as long-cycle valuation gates', affects: ['alpha_type'] },
  { id: 'api.santiment',   kind: 'api',    label: 'Santiment',         description: 'Social + dev activity',      agentHint: 'use Santiment dev-activity + social-volume as fundamental signals', affects: ['alpha_type'] },
  { id: 'api.coinmetrics', kind: 'api',    label: 'CoinMetrics',       description: 'Network state + flows',      agentHint: 'CoinMetrics ATONOMI for active addresses, transfer count, realized cap', affects: ['alpha_type'] },
  { id: 'api.dune',        kind: 'api',    label: 'Dune Analytics',    description: 'Custom on-chain queries',    agentHint: 'run pre-built Dune queries (DEX vol, NFT mints, DAO flows) every tick', affects: ['alpha_type'] },
  { id: 'api.flipside',    kind: 'api',    label: 'Flipside Crypto',   description: 'Indexed on-chain data',      agentHint: 'use Flipside for cross-chain holder/transfer breakdowns', affects: ['alpha_type'] },
  { id: 'api.cryptopanic', kind: 'api',    label: 'CryptoPanic News',  description: 'Aggregated headlines+vote',  agentHint: 'pull CryptoPanic weighted news; high "important" score = elevated vol regime', affects: ['alpha_type'] },
  { id: 'api.messari',     kind: 'api',    label: 'Messari',           description: 'Asset profiles + screeners', agentHint: 'use Messari token-classification to filter universe (e.g., L1 vs DeFi vs Meme)', affects: ['symbols'] },
  { id: 'api.dexscreener', kind: 'api',    label: 'DexScreener',       description: 'Live DEX pair scanner',      agentHint: 'scan DexScreener trending pairs for new-liquidity entries (with rugpull filter)', affects: ['symbols'] },

  // Risk / sizing primitives
  { id: 'risk.var',          kind: 'risk', label: 'VaR Cap',          description: '95% Value-at-Risk limit',    agentHint: 'cap portfolio so 1d 95% VaR < 4% of NAV', affects: ['risk_aversion', 'max_weight'] },
  { id: 'risk.cvar',         kind: 'risk', label: 'CVaR / Expected Shortfall', description: 'Tail-loss control',  agentHint: 'use CVaR(95%) instead of VaR — controls tail beyond the threshold', affects: ['risk_aversion'] },
  { id: 'risk.vol_target',   kind: 'risk', label: 'Vol Targeting',    description: 'Target 12% annualized vol',  agentHint: 'rescale gross weights to hit target portfolio vol (e.g., 12% annualized)', affects: ['risk_aversion', 'max_weight'] },
  { id: 'risk.kelly',        kind: 'risk', label: 'Kelly Sizing',     description: 'Fractional Kelly',           agentHint: 'use 0.25× fractional Kelly per signal; cap any single bet at 5% NAV', affects: ['max_weight'] },
  { id: 'risk.trailing',     kind: 'risk', label: 'Trailing Stop',    description: '5%/ATR trailing stop',       agentHint: 'attach 1.5×ATR trailing stop to every long position', affects: ['risk_aversion'] },
  { id: 'risk.circuit',      kind: 'risk', label: 'Circuit Breaker',  description: 'Halt on >X% intraday move',  agentHint: 'pause trading for 60 min if portfolio drawdown >3% in a single hour', affects: ['risk_aversion'] },
  { id: 'risk.exposure_cap', kind: 'risk', label: 'Asset Exposure Cap', description: 'Per-asset notional cap',   agentHint: 'cap notional per asset at 25% NAV regardless of signal strength', affects: ['max_weight'] },
  { id: 'risk.correlation',  kind: 'risk', label: 'Corr Limiter',     description: 'Cap correlated exposure',    agentHint: 'limit aggregate exposure to highly-correlated names (corr > 0.8) at 40% NAV', affects: ['max_weight'] },

  // Execution venues / styles
  { id: 'exec.iceberg',    kind: 'execution', label: 'Iceberg',       description: 'Hidden sliced order',        agentHint: 'use iceberg orders showing 10% of size; refresh as filled', affects: [] },
  { id: 'exec.poc',        kind: 'execution', label: 'POV',           description: 'Percent-of-volume execution', agentHint: 'execute as 10% of trailing 5-min volume to minimize impact', affects: [] },
  { id: 'exec.implementation', kind: 'execution', label: 'Imp. Shortfall', description: 'IS-aware scheduling',   agentHint: 'optimize for implementation shortfall vs decision price', affects: [] },
  { id: 'exec.coinbase',   kind: 'execution', label: 'Coinbase',      description: 'Coinbase Pro venue',         agentHint: 'route alongside Kraken — best-execution split', affects: [] },
  { id: 'exec.binance',    kind: 'execution', label: 'Binance Spot',  description: 'Binance USDT pairs',         agentHint: 'route via Binance for deeper crypto books', affects: [] },
  { id: 'exec.dydx',       kind: 'execution', label: 'dYdX Perp',     description: 'Decentralized perp DEX',     agentHint: 'route perps through dYdX for non-custodial leverage', affects: [] },
  { id: 'exec.gmx',        kind: 'execution', label: 'GMX',           description: 'On-chain perp trading',      agentHint: 'route smaller perp positions via GMX for self-custody', affects: [] },
  { id: 'exec.hyperliquid', kind: 'execution', label: 'Hyperliquid', description: 'L1 on-chain perps',          agentHint: 'route via Hyperliquid for low-latency on-chain perps', affects: [] },
  { id: 'exec.latency',    kind: 'execution', label: 'Latency Smart-Router', description: 'Route by venue latency', agentHint: 'send each child order to the lowest-latency venue at that tick', affects: [] },

  // Signal combinators
  { id: 'sig.bayesian',    kind: 'signal', label: 'Bayesian Average', description: 'Posterior signal blend',     agentHint: 'compute posterior over signals using each signal\'s historical Sharpe as prior weight', affects: ['alpha_type'] },
  { id: 'sig.regime_gate', kind: 'signal', label: 'Regime Gate',      description: 'Bull/bear filter',           agentHint: 'gate the strategy: trade momentum in bull regimes, mean-reversion in chop, flat in bear', affects: ['alpha_type'] },
  { id: 'sig.cross_asset', kind: 'signal', label: 'Cross-Asset Conf.', description: 'Confirm across BTC + Eth',  agentHint: 'only trade ETH momentum if BTC also showing trend in same direction (cross-asset confirmation)', affects: ['alpha_type'] },
  { id: 'sig.news_gate',   kind: 'signal', label: 'News Catalyst Gate', description: 'Block trades on red news', agentHint: 'block new entries for 30 min after high-impact negative crypto headlines', affects: ['alpha_type'] },
]

export const BLOCKS_BY_KIND: Record<BlockKind, Block[]> = BLOCKS.reduce((acc, b) => {
  (acc[b.kind] ||= []).push(b)
  return acc
}, {} as Record<BlockKind, Block[]>)

/**
 * Purpose-driven groups for the builder UI. Each category answers a question
 * the user asks while composing a strategy:
 *   1. "Where does my data come from?"
 *   2. "How do I detect an edge?"
 *   3. "How do I combine signals?"
 *   4. "How do I size and protect positions?"
 *   5. "How do I execute trades?"
 */
export type BlockCategory = {
  id: 'data' | 'signal' | 'compositor' | 'risk' | 'execution'
  label: string
  description: string
  /** CSS variable name from globals.css for the accent color. */
  accentVar: string
  blockIds: string[]
}

export const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    id: 'data',
    label: 'Data Sources',
    description: 'Where the strategy reads from — markets, on-chain, macro, sentiment',
    accentVar: '--blue',
    blockIds: [
      // Markets
      'data.binance', 'data.coingecko', 'data.yahoo', 'data.uniswap', 'data.dex_tvl', 'data.cex_flows',
      // On-chain & derivatives
      'data.onchain', 'data.funding', 'data.options', 'data.perps', 'data.basis', 'data.stablecoin', 'data.l1_fees', 'data.miner', 'data.whale',
      // Macro
      'data.macro_dxy', 'data.rates', 'data.cpi', 'data.fomc', 'data.equity',
      // News / sentiment APIs
      'api.fear_greed', 'api.alternative', 'api.news', 'api.satellite', 'api.syne',
      'sent.twitter', 'sent.reddit', 'sent.tg', 'sent.gtrends',
      'api.tradingecon', 'api.glassnode', 'api.santiment', 'api.coinmetrics',
      'api.dune', 'api.flipside', 'api.cryptopanic', 'api.messari', 'api.dexscreener',
    ],
  },
  {
    id: 'signal',
    label: 'Signals & Models',
    description: 'How the strategy detects an edge',
    accentVar: '--mint',
    blockIds: [
      // Classical indicators
      'ind.rsi', 'ind.macd', 'ind.bb', 'ind.atr', 'ind.ema_cross', 'ind.zscore',
      'ind.adx', 'ind.stoch', 'ind.cci', 'ind.vwap', 'ind.obv', 'ind.donchian',
      'ind.keltner', 'ind.heikin', 'ind.supertrend', 'ind.fib', 'ind.ichimoku',
      'ind.realvol', 'ind.skew',
      // ML
      'ml.gbm', 'ml.lstm', 'ml.regime', 'ml.transformer', 'ml.cnn', 'ml.rl', 'ml.kalman', 'ml.changepoint', 'ml.embedding',
    ],
  },
  {
    id: 'compositor',
    label: 'Signal Combination',
    description: 'How signals vote and combine',
    accentVar: '--purple',
    blockIds: ['sig.composite', 'sig.consensus', 'sig.majority', 'sig.unanimous', 'sig.weighted', 'sig.stacking', 'sig.bayesian', 'sig.regime_gate', 'sig.cross_asset', 'sig.news_gate'],
  },
  {
    id: 'risk',
    label: 'Risk & Sizing',
    description: 'How positions are sized and protected',
    accentVar: '--orange',
    blockIds: ['risk.killswitch', 'risk.parity', 'risk.var', 'risk.cvar', 'risk.vol_target', 'risk.kelly', 'risk.trailing', 'risk.circuit', 'risk.exposure_cap', 'risk.correlation'],
  },
  {
    id: 'execution',
    label: 'Execution',
    description: 'How orders hit the market — venues + child-order styles',
    accentVar: '--cyan',
    blockIds: ['exec.twap', 'exec.vwap', 'exec.iceberg', 'exec.poc', 'exec.implementation', 'api.kraken', 'exec.coinbase', 'exec.binance', 'exec.dydx', 'exec.gmx', 'exec.hyperliquid', 'exec.latency'],
  },
]

export function getBlockById(id: string): Block | undefined {
  return BLOCKS.find(b => b.id === id)
}

export function blocksToHints(ids: string[]): string {
  if (!ids.length) return ''
  const found = ids.map(id => BLOCKS.find(b => b.id === id)).filter(Boolean) as Block[]
  if (!found.length) return ''
  return `Selected building blocks (the user dragged these — incorporate them into the spec):\n${found.map(b => `- [${b.kind}] ${b.label}: ${b.agentHint}`).join('\n')}`
}
