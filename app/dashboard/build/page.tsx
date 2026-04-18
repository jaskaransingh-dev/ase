'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { 
  Play, Loader2, Code, RefreshCw, Copy, Check, Save, Zap,
  Eye, EyeOff, List, TrendingUp, File, Folder, FolderOpen, Terminal,
  Plus, Trash2, ChevronRight, ChevronDown, Database, Cpu, Layers, Box, ArrowRight,
  GitBranch, Clock, Rocket, Server, HardDrive, Network, Download, Upload,
  ExternalLink, AlertTriangle, CheckCircle, Info, Search, Filter, Wand2, Plug, Sparkles,
  PanelLeft, Sparkle, Wand, RefreshCcw, TrendingDown, Shield, BarChart3, Book, Activity
} from 'lucide-react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart } from 'recharts'

const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', blue2: '#6BA3FF',
  mint: '#16C784', mint2: '#2AD89A', mintDark: 'rgba(22,199,132,0.12)',
  red: '#FF5468', red2: '#FF7885',
  orange: '#F5B942', orange2: '#F7C864',
  purple: '#8B5CF6', purple2: '#A78BFA',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A',
  white: '#F7FAFF', gold: '#8AB8FF',
}

interface BacktestResult {
  totalReturnPct: number
  annualizedReturnPct: number
  sharpeRatio: number
  sortinoRatio: number
  maxDrawdownPct: number
  maxDrawdownDuration: number
  winRate: number
  winRatePct: number
  totalTrades: number
  avgWin?: number
  avgWinPct?: number
  avgLoss?: number
  avgLossPct?: number
  profitFactor: number
  feeImpactPct?: number
  tradesPerYear?: number
  calmarRatio?: number
  exposureTime?: number
}

// 20+ Free Data APIs - No API key required
interface DataAPI {
  id: string
  name: string
  category: 'crypto' | 'stocks' | 'forex' | 'macro' | 'alternative' | 'news'
  tier: 'free' | 'freemium'
  auth: 'none' | 'optional' | 'required' | 'local'
  rateLimit: string
  description: string
  endpoint: string
  docs: string
  sampleSymbol: string
  dataTypes: string[]
  implementation: string
}

const DATA_APIS: DataAPI[] = [
  {
    id: 'yfinance',
    name: 'Yahoo Finance',
    category: 'stocks',
    tier: 'free',
    auth: 'none',
    rateLimit: '2000/hour',
    description: '30,000+ global stocks, ETFs, indices, and crypto',
    endpoint: 'yfinance Python library',
    docs: 'https://pypi.org/project/yfinance/',
    sampleSymbol: 'AAPL, BTC-USD, SPY',
    dataTypes: ['OHLCV', 'fundamentals', 'dividends', 'splits'],
    implementation: `import yfinance as yf

def load_data(symbol: str, period: str = '1y') -> pd.DataFrame:
    """Load data from Yahoo Finance"""
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period)
    df.columns = [c.lower() for c in df.columns]
    return df[['open', 'high', 'low', 'close', 'volume']]

# Usage
df = load_data('AAPL', '2y')`,
  },
  {
    id: 'binance',
    name: 'Binance',
    category: 'crypto',
    tier: 'free',
    auth: 'optional',
    rateLimit: '1200/hour',
    description: 'World\'s largest crypto exchange, deep historical data',
    endpoint: 'https://api.binance.com/api/v3/klines',
    docs: 'https://developers.binance.com/',
    sampleSymbol: 'BTCUSDT, ETHUSDT',
    dataTypes: ['OHLCV', 'orderbook', 'trades', 'funding rate'],
    implementation: `import requests
import pandas as pd

def load_binance(symbol: str, interval: str = '1d', limit: int = 1000) -> pd.DataFrame:
    """Load klines from Binance public API"""
    url = f"https://api.binance.com/api/v3/klines"
    params = {'symbol': symbol, 'interval': interval, 'limit': limit}
    resp = requests.get(url, params=params).json()
    
    cols = ['open_time', 'open', 'high', 'low', 'close', 'volume',
            'close_time', 'quote_volume', 'trades', 'tb_base', 'tb_quote', 'ignore']
    df = pd.DataFrame(resp, columns=cols)
    df['open'] = df['open'].astype(float)
    df['high'] = df['high'].astype(float)
    df['low'] = df['low'].astype(float)
    df['close'] = df['close'].astype(float)
    df['volume'] = df['volume'].astype(float)
    return df[['open', 'high', 'low', 'close', 'volume']]

# Usage
df = load_binance('BTCUSDT', '1d', 500)`,
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    category: 'crypto',
    tier: 'free',
    auth: 'none',
    rateLimit: '10-50/min (pro: 100/min)',
    description: 'Comprehensive crypto data with market info and DeFi metrics',
    endpoint: 'https://api.coingecko.com/api/v3',
    docs: 'https://www.coingecko.com/en/api',
    sampleSymbol: 'bitcoin, ethereum, solana',
    dataTypes: ['OHLCV', 'market data', 'DeFi', 'NFT', 'historical'],
    implementation: `import requests
import pandas as pd

def load_coingecko(coin_id: str, days: int = 365) -> pd.DataFrame:
    """Load OHLCV from CoinGecko"""
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/ohlc"
    params = {'vs_currency': 'usd', 'days': days}
    resp = requests.get(url, params=params).json()
    
    df = pd.DataFrame(resp, columns=['timestamp', 'open', 'high', 'low', 'close'])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    return df

def get_coin_id(symbol: str) -> str:
    """Search CoinGecko for coin ID from symbol"""
    resp = requests.get("https://api.coingecko.com/api/v3/coins/list").json()
    for coin in resp:
        if coin['symbol'].lower() == symbol.lower():
            return coin['id']
    return symbol

# Usage
df = load_coingecko('bitcoin', 365)`,
  },
  {
    id: 'fred',
    name: 'FRED',
    category: 'macro',
    tier: 'free',
    auth: 'optional',
    rateLimit: '120/hour (key: 1000/hour)',
    description: 'Federal Reserve Economic Data - GDP, inflation, employment',
    endpoint: 'https://fred.stlouisfed.org/graph/fredgraph.csv',
    docs: 'https://fred.stlouisfed.org/docs/api/fred/',
    sampleSymbol: 'GDP, CPIAUCSL, UNRATE, DGS10',
    dataTypes: ['macro indicators', 'interest rates', 'employment', 'CPI'],
    implementation: `import pandas as pd
import requests

def load_fred(series_id: str) -> pd.DataFrame:
    """Load economic data from FRED"""
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv"
    params = {'id': series_id}
    df = pd.read_csv(url, parse_dates=['DATE'])
    df.columns = ['date', 'value']
    return df

# Common series IDs:
# GDP - Real GDP
# CPIAUCSL - CPI
# UNRATE - Unemployment
# DGS10 - 10-Year Treasury
# FEDFUNDS - Fed Funds Rate
df = load_fred('GDP')`,
  },
  {
    id: 'exchange_rates',
    name: 'Exchange Rates API',
    category: 'forex',
    tier: 'free',
    auth: 'none',
    rateLimit: '1500/month',
    description: '170+ currencies with historical rates',
    endpoint: 'https://api.exchangerate-api.com/v4/latest',
    docs: 'https://www.exchangerate-api.com/docs/overview',
    sampleSymbol: 'USD, EUR, JPY, GBP',
    dataTypes: ['exchange rates', 'historical', 'time-series'],
    implementation: `import requests
import pandas as pd

def load_forex(base: str = 'USD') -> dict:
    """Get current exchange rates"""
    url = f"https://api.exchangerate-api.com/v4/latest/{base}"
    return requests.get(url).json()

def load_historical_forex(base: str, target: str, date: str) -> float:
    """Get historical forex rate (date format: YYYY-MM-DD)"""
    url = f"https://api.exchangerate-api.com/v4/{date}/{base}"
    data = requests.get(url).json()
    return float(data['rates'][target])

# Usage
rates = load_forex('USD')
print(f"EUR rate: {rates['rates']['EUR']}")`,
  },
  {
    id: 'alpha_vantage',
    name: 'Alpha Vantage',
    category: 'stocks',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '25/day (free), 75/min (premium)',
    description: 'Stocks, FX, crypto with technical indicators',
    endpoint: 'https://www.alphavantage.co/query',
    docs: 'https://www.alphavantage.co/documentation/',
    sampleSymbol: 'IBM, MSFT, BTC, EUR',
    dataTypes: ['OHLCV', 'technicals', 'fundamentals', 'FX'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'  # Free at alphavantage.co

def load_alpha_vantage(symbol: str, function: str = 'TIME_SERIES_DAILY') -> pd.DataFrame:
    """Load data from Alpha Vantage"""
    url = 'https://www.alphavantage.co/query'
    params = {
        'function': function,
        'symbol': symbol,
        'apikey': API_KEY,
        'outputsize': 'full'
    }
    data = requests.get(url, params=params).json()
    
    # Parse time series
    ts_key = [k for k in data.keys() if 'Time Series' in k][0]
    df = pd.DataFrame.from_dict(data[ts_key], orient='index')
    df = df.astype(float)
    return df.rename(columns={
        '1. open': 'open', '2. high': 'high',
        '3. low': 'low', '4. close': 'close', '5. volume': 'volume'
    })

# Usage
df = load_alpha_vantage('IBM', 'TIME_SERIES_DAILY')`,
  },
  {
    id: 'polygon',
    name: 'Polygon.io',
    category: 'stocks',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '5/min (free), 100/min (startup)',
    description: 'Real-time and historical US market data',
    endpoint: 'https://api.polygon.io',
    docs: 'https://polygon.io/docs/getting-started',
    sampleSymbol: 'AAPL, TSLA, SPY',
    dataTypes: ['OHLCV', 'aggregates', 'tickers', 'news'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'  # Free tier at polygon.io

def load_polygon(symbol: str, from_date: str, to_date: str) -> pd.DataFrame:
    """Load daily aggregates from Polygon"""
    url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/{from_date}/{to_date}"
    params = {'adjusted': 'true', 'sort': 'asc', 'apiKey': API_KEY}
    data = requests.get(url, params=params).json()
    
    df = pd.DataFrame(data['results'])
    return df.rename(columns={
        'o': 'open', 'h': 'high', 'l': 'low',
        'c': 'close', 'v': 'volume', 't': 'timestamp'
    })

# Usage
df = load_polygon('AAPL', '2023-01-01', '2024-01-01')`,
  },
  {
    id: 'twelvedata',
    name: 'Twelvedata',
    category: 'stocks',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '800/day (free)',
    description: 'Stocks, crypto, FX, ETFs with 50+ indicators',
    endpoint: 'https://api.twelvedata.com',
    docs: 'https://twelvedata.com/docs',
    sampleSymbol: 'AAPL, BTC, EUR/USD',
    dataTypes: ['OHLCV', 'technicals', 'fundamentals', 'depth'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'  # Free tier at twelvedata.com

def load_twelvedata(symbol: str, interval: str = '1day') -> pd.DataFrame:
    """Load time series from Twelvedata"""
    url = 'https://api.twelvedata.com/time_series'
    params = {
        'symbol': symbol,
        'interval': interval,
        'apikey': API_KEY,
        'format': 'pandas'
    }
    data = requests.get(url, params=params).json()
    df = pd.DataFrame(data['values'])
    df['datetime'] = pd.to_datetime(df['datetime'])
    return df.set_index('datetime')

# Usage
df = load_twelvedata('AAPL', '1day')`,
  },
  {
    id: 'quandl',
    name: 'Nasdaq Data Link',
    category: 'stocks',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '500/day (free)',
    description: 'Alternative data, hedge fund data, financial metrics',
    endpoint: 'https://data.nasdaq.com/api/v3',
    docs: 'https://docs.data.nasdaq.com/',
    sampleSymbol: 'WIKI/AAPL, SHARADAR/FF',
    dataTypes: ['fundamentals', 'alternatives', 'SEDOL'],
    implementation: `import nasdaqdatalink
import pandas as pd

nasdaqdatalink.ApiConfig.api_key = 'YOUR_API_KEY'

def load_quandl(database: str, dataset: str) -> pd.DataFrame:
    """Load data from Nasdaq Data Link (formerly Quandl)"""
    data = nasdaqdatalink.get(f"{database}/{dataset}")
    return data

# Usage - WIKI database has fundamental data
df = load_quandl('WIKI', 'AAPL')`,
  },
  {
    id: 'worldtrading',
    name: 'World Trading Data',
    category: 'stocks',
    tier: 'free',
    auth: 'required',
    rateLimit: '100/day (free)',
    description: 'Real-time and historical stock data',
    endpoint: 'https://api.worldtradingdata.com/api/v1',
    docs: 'https://www.worldtradingdata.com/api.php',
    sampleSymbol: 'AAPL, MSFT, GOOGL',
    dataTypes: ['OHLCV', 'intraday', 'mutual funds'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'

def load_wtd(symbols: list) -> pd.DataFrame:
    """Load stock data from World Trading Data"""
    url = 'https://api.worldtradingdata.com/api/v1/stock'
    params = {'symbol': ','.join(symbols), 'api_token': API_KEY}
    data = requests.get(url, params=params).json()
    
    return pd.DataFrame(data['data'])

# Usage
df = load_wtd(['AAPL', 'MSFT', 'GOOGL'])`,
  },
  {
    id: 'tiingo',
    name: 'Tiingo',
    category: 'stocks',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '500/day (free)',
    description: 'End-of-day and intraday stock data with news',
    endpoint: 'https://api.tiingo.com/api',
    docs: 'https://www.tiingo.com/about/general/api documentation',
    sampleSymbol: 'AAPL, SPY',
    dataTypes: ['OHLCV', 'news', 'iex', 'crypto'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'
HEADERS = {'Content-Type': 'application/json', 'Authorization': f'Token {API_KEY}'}

def load_tiingo(symbol: str, resample: str = 'daily') -> pd.DataFrame:
    """Load data from Tiingo"""
    url = f'https://api.tiingo.com/iex/{symbol}/prices'
    params = {'startDate': '2020-01-01', 'resampleFreq': resample}
    data = requests.get(url, params=params, headers=HEADERS).json()
    
    return pd.DataFrame(data)

# Usage
df = load_tiingo('AAPL')`,
  },
  {
    id: 'metatrader',
    name: 'MetaTrader 5',
    category: 'forex',
    tier: 'free',
    auth: 'local',
    rateLimit: 'N/A (local)',
    description: 'MT5 terminal for forex, CFDs, and commodities',
    endpoint: 'MT5 Terminal',
    docs: 'https://www.mql5.com/en/docs',
    sampleSymbol: 'EURUSD, GBPUSD, XAUUSD',
    dataTypes: ['OHLCV', 'ticks', 'orderbook'],
    implementation: `# Requires MetaTrader 5 terminal installed

import MetaTrader5 as mt5
import pandas as pd

def load_mt5(symbol: str, timeframe: int = mt5.TIMEFRAME_D1, count: int = 1000):
    """Load data from MetaTrader 5 terminal"""
    if not mt5.initialize():
        print("MT5 initialization failed")
        return None
    
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
    mt5.shutdown()
    
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    return df[['time', 'open', 'high', 'low', 'close', 'tick_volume']]

# Usage
df = load_mt5('EURUSD', mt5.TIMEFRAME_D1, 500)`,
  },
  {
    id: 'stooq',
    name: 'Stooq',
    category: 'stocks',
    tier: 'free',
    auth: 'none',
    rateLimit: 'None stated',
    description: 'Free global index, stock, FX, and commodity data',
    endpoint: 'https://stooq.com/q/d/l/',
    docs: 'https://stooq.com/public/python/',
    sampleSymbol: 'AAPL.US, ^SPX, EURUSD',
    dataTypes: ['OHLCV', 'indices', 'FX'],
    implementation: `import pandas as pd

def load_stooq(symbol: str) -> pd.DataFrame:
    """Load data from Stooq (no API key needed)"""
    # Symbol format: TICKER.XX (country code)
    url = f"https://stooq.com/q/d/l/?s={symbol.lower()}&i=d"
    df = pd.read_csv(url, index_col='Date', parse_dates=True)
    df.index.name = 'date'
    df.columns = [c.lower() for c in df.columns]
    return df

# Usage - US stocks use .us suffix
df = load_stooq('aapl.us')
df = load_stooq('^spx')  # S&P 500
df = load_stooq('eurusd')  # EUR/USD`,
  },
  {
    id: 'investing',
    name: 'Investing.com',
    category: 'stocks',
    tier: 'free',
    auth: 'none',
    rateLimit: 'Rate limited',
    description: 'Global financial portal with historical data',
    endpoint: 'Web scraping or API',
    docs: 'https://www.investing.com/data-center/',
    sampleSymbol: '1, 2, 3 (instrument IDs)',
    dataTypes: ['OHLCV', 'economic', 'historical'],
    implementation: `# Requires scraping (use responsibly)
import requests
from io import StringIO
import pandas as pd

def load_investing(symbol_id: str, from_date: str, to_date: str) -> pd.DataFrame:
    """Scrape historical data from Investing.com (for personal use)"""
    # Note: Web scraping may violate ToS - use official API when available
    url = f"https://www.investing.com/instruments/HistoricalDataAjax"
    headers = {'X-Requested-With': 'XMLHttpRequest'}
    data = {
        'curr_id': symbol_id,
        'smlID': '300004',
        'st_date': from_date,
        'end_date': to_date,
        'sort_col': 'date',
        'sort_ord': 'DESC'
    }
    resp = requests.post(url, data=data, headers=headers)
    # Parse response...
    return df  # Implementation depends on response format`,
  },
  {
    id: 'metals',
    name: 'Metals-API',
    category: 'alternative',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '50/month (free)',
    description: 'Gold, silver, platinum, and other precious metals',
    endpoint: 'https://metals-api.com/api',
    docs: 'https://metals-api.com/docs',
    sampleSymbol: 'XAU, XAG, XPT, XPD',
    dataTypes: ['spot prices', 'historical', 'currency conversion'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'

def load_metals(base: str = 'USD') -> dict:
    """Get current metal prices"""
    url = 'https://metals-api.com/api/latest'
    params = {'access_key': API_KEY, 'base': base, 'symbols': 'XAU,XAG,XPT'}
    data = requests.get(url, params=params).json()
    return data['rates']

# Usage
prices = load_metals('USD')
gold = prices['XAU']  # Gold in USD per oz`,
  },
  {
    id: 'financial_modeling_prep',
    name: 'Financial Modeling Prep',
    category: 'stocks',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '250/day (free)',
    description: 'Financial statements, valuation, and stock data',
    endpoint: 'https://financialmodelingprep.com/api/v3',
    docs: 'https://site.financialmodelingprep.com/API/documentation',
    sampleSymbol: 'AAPL, MSFT, GOOGL',
    dataTypes: ['fundamentals', 'income', 'balance sheet', 'cashflow'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'

def load_fmp_income(symbol: str) -> pd.DataFrame:
    """Load income statement from FMP"""
    url = f"https://financialmodelingprep.com/api/v3/income-statement/{symbol}"
    params = {'apikey': API_KEY}
    data = requests.get(url, params=params).json()
    return pd.DataFrame(data)

def load_fmp_profile(symbol: str) -> dict:
    """Get company profile"""
    url = f"https://financialmodelingprep.com/api/v3/profile/{symbol}"
    params = {'apikey': API_KEY}
    return requests.get(url, params=params).json()[0]

# Usage
income = load_fmp_income('AAPL')
profile = load_fmp_profile('AAPL')`,
  },
  {
    id: 'sec',
    name: 'SEC EDGAR',
    category: 'alternative',
    tier: 'free',
    auth: 'none',
    rateLimit: '10/sec',
    description: 'SEC filings, financial statements, 13F holdings',
    endpoint: 'https://data.sec.gov',
    docs: 'https://www.sec.gov/developer',
    sampleSymbol: 'CIK numbers',
    dataTypes: ['10-K', '10-Q', '8-K', '13F', 'S-1'],
    implementation: `import requests
import pandas as pd

def load_sec_filings(cik: str) -> dict:
    """Load company filings from SEC EDGAR"""
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    headers = {'User-Agent': 'Research agent research@example.com'}
    return requests.get(url, headers=headers).json()

def load_sec_10k(cik: str, accession: str) -> str:
    """Load 10-K filing content"""
    url = f"https://www.sec.gov/Archives/edgar/full-index/{year}/{quarter}/master.idx"
    # Parse and download specific filing
    return content

# Get CIK for AAPL
# AAPL CIK: 0000320193
filings = load_sec_filings('0000320193')`,
  },
  {
    id: 'newspaper',
    name: 'News API',
    category: 'news',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '100/day (free)',
    description: 'News articles for sentiment analysis and event trading',
    endpoint: 'https://newsapi.org/v2',
    docs: 'https://newsapi.org/docs',
    sampleSymbol: 'AAPL, bitcoin, federal reserve',
    dataTypes: ['headlines', 'articles', 'sentiment'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'

def load_news(query: str, from_date: str = None) -> pd.DataFrame:
    """Get news articles related to query"""
    url = 'https://newsapi.org/v2/everything'
    params = {
        'q': query,
        'apiKey': API_KEY,
        'language': 'en',
        'sortBy': 'publishedAt',
        'pageSize': 100
    }
    if from_date:
        params['from'] = from_date
    
    data = requests.get(url, params=params).json()
    articles = data.get('articles', [])
    
    return pd.DataFrame([{
        'title': a['title'],
        'description': a['description'],
        'publishedAt': a['publishedAt'],
        'source': a['source']['name'],
        'url': a['url']
    } for a in articles])

# Usage
news = load_news('AAPL earnings')
news = load_news('federal reserve rate')`,
  },
  {
    id: 'github',
    name: 'GitHub Archive',
    category: 'alternative',
    tier: 'free',
    auth: 'optional',
    rateLimit: '5000/hour',
    description: 'GitHub activity data for developer sentiment',
    endpoint: 'https://api.github.com',
    docs: 'https://docs.github.com/en/rest',
    sampleSymbol: 'repositories, commits, issues',
    dataTypes: ['repo stats', 'commits', 'issues', 'stars'],
    implementation: `import requests
import pandas as pd

def load_github_repo_stats(owner: str, repo: str) -> dict:
    """Get repository statistics"""
    url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {'Accept': 'application/vnd.github.v3+json'}
    return requests.get(url, headers=headers).json()

def load_github_stars_history(owner: str, repo: str) -> list:
    """Get star count history"""
    url = f"https://api.github.com/repos/{owner}/{repo}/stargazers"
    resp = requests.get(url).json()
    return resp

# Usage - Track DeFi project activity
uniswap = load_github_repo_stats('Uniswap', 'uniswap-v3-core')
print(f"Stars: {uniswap['stargazers_count']}")`,
  },
  {
    id: 'crypto_compare',
    name: 'CryptoCompare',
    category: 'crypto',
    tier: 'freemium',
    auth: 'optional',
    rateLimit: '10-5000/day',
    description: 'Crypto data with social metrics and mining data',
    endpoint: 'https://min-api.cryptocompare.com',
    docs: 'https://www.cryptocompare.com/api/',
    sampleSymbol: 'BTC, ETH, LTC',
    dataTypes: ['OHLCV', 'social', 'mining', 'derivatives'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'  # Optional for basic endpoints

def load_cryptocompare(symbol: str, limit: int = 2000) -> pd.DataFrame:
    """Load OHLCV from CryptoCompare"""
    url = f"https://min-api.cryptocompare.com/data/v2/histoday"
    params = {'fsym': symbol, 'tsym': 'USD', 'limit': limit}
    if API_KEY:
        params['api_key'] = API_KEY
    
    data = requests.get(url, params=params).json()['Data']['Data']
    df = pd.DataFrame(data)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    return df[['time', 'open', 'high', 'low', 'close', 'volumefrom']]

def get_crypto_social(symbol: str) -> dict:
    """Get social media stats for crypto"""
    url = f"https://min-api.cryptocompare.com/data/social/coin/latest"
    params = {'id': symbol}  # Use numeric IDs
    return requests.get(url, params=params).json()

# Usage
df = load_cryptocompare('BTC', 365)`,
  },
  {
    id: 'defi_pulse',
    name: 'DeFi Pulse',
    category: 'alternative',
    tier: 'free',
    auth: 'none',
    rateLimit: 'N/A',
    description: 'DeFi protocol TVL and rankings',
    endpoint: 'https://api.defipulse.com',
    docs: 'https://defipulse.com/api',
    sampleSymbol: 'compound, aave, uniswap',
    dataTypes: ['TVL', 'protocol stats', 'rankings'],
    implementation: `import requests
import pandas as pd

def load_defi_tvl() -> pd.DataFrame:
    """Get DeFi protocol TVL rankings"""
    # Alternative: use DeFiLlama API (free, no auth)
    url = 'https://api.llama.fi/protocols'
    data = requests.get(url).json()
    
    return pd.DataFrame([{
        'name': p['name'],
        'symbol': p.get('symbol', ''),
        'chain': p.get('chain', ''),
        'category': p.get('category', ''),
        'tvl': p.get('tvl', 0),
        'change_1d': p.get('change_1d', 0),
        'change_7d': p.get('change_7d', 0)
    } for p in data])

def load_protocol_tvl(protocol: str) -> pd.DataFrame:
    """Get historical TVL for a protocol"""
    url = f'https://api.llama.fi/protocol/{protocol}'
    data = requests.get(url).json()
    
    return pd.DataFrame({
        'date': data.get('tvl', {}).keys(),
        'tvl': data.get('tvl', {}).values()
    })

# Usage
df = load_defi_tvl()
uniswap_tvl = load_protocol_tvl('uniswap')`,
  },
  {
    id: 'messari',
    name: 'Messari',
    category: 'crypto',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '100/day (free)',
    description: 'Crypto research, on-chain metrics, and market data',
    endpoint: 'https://data.messari.io/api/v1',
    docs: 'https://messari.io/api/docs',
    sampleSymbol: 'BTC, ETH, marketcap',
    dataTypes: ['OHLCV', 'on-chain', 'metrics', 'news'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'

def load_messari_price(symbol: str) -> dict:
    """Get price data from Messari"""
    url = f"https://data.messari.io/api/v1/assets/{symbol}/metrics/price/history"
    headers = {'Authorization': f'Bearer {API_KEY}'}
    return requests.get(url, headers=headers).json()

def load_messari_ohlcv(symbol: str, start: str, end: str) -> pd.DataFrame:
    """Get OHLCV from Messari"""
    url = f"https://data.messari.io/api/v1/markets/binance/{symbol}-usdt/ohlcv/day"
    params = {'start': start, 'end': end}
    data = requests.get(url, params=params).json()['data']['values']
    
    return pd.DataFrame(data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

# Usage
df = load_messari_ohlcv('BTC', '2023-01-01', '2024-01-01')`,
  },
  {
    id: 'lunar_crisis',
    name: 'LunarCrush',
    category: 'crypto',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '100/day (free)',
    description: 'Social metrics for crypto - influencer activity, sentiment',
    endpoint: 'https://lunarcrush.com/developers',
    docs: 'https://lunarcrush.com/docs',
    sampleSymbol: 'BTC, ETH, ALTCOIN',
    dataTypes: ['social', 'influencer', 'sentiment', 'galaxy scores'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'

def load_lunar_social(symbol: str) -> dict:
    """Get social metrics from LunarCrush"""
    url = 'https://lunarcrush.com/api/v3/coins/least'
    params = {'key': API_KEY, 'symbol': symbol, 'dataPoints': 30}
    return requests.get(url, params=params).json()

def load_lunar_galaxy_score(symbol: str) -> dict:
    """Get Galaxy Score (0-1000)"""
    url = f'https://lunarcrush.com/api/v3/coin/galaxyscore/{symbol}'
    params = {'key': API_KEY}
    return requests.get(url, params=params).json()

# Usage
btc_social = load_lunar_social('BTC')
print(f"Galaxy Score: {btc_social['data'][0]['galaxyScore']}")`,
  },
  {
    id: 'glassnode',
    name: 'Glassnode',
    category: 'crypto',
    tier: 'freemium',
    auth: 'required',
    rateLimit: '100/day (free)',
    description: 'On-chain metrics and blockchain data for crypto',
    endpoint: 'https://api.glassnode.com/v1',
    docs: 'https://docs.glassnode.com/',
    sampleSymbol: 'BTC, ETH',
    dataTypes: ['on-chain', 'wallets', 'exchanges', 'miners'],
    implementation: `import requests
import pandas as pd

API_KEY = 'YOUR_API_KEY'

def load_glassnode(metric: str, asset: str = 'BTC') -> pd.DataFrame:
    """Get on-chain metrics from Glassnode"""
    url = f'https://api.glassnode.com/v1/metrics/{metric}'
    headers = {'Authorization': f'Bearer {API_KEY}'}
    params = {
        'asset': asset,
        'a': asset,
        'i': '24h',  # daily
        's': str(int(pd.Timestamp('2023-01-01').timestamp())),
        'e': str(int(pd.Timestamp('2024-01-01').timestamp()))
    }
    data = requests.get(url, headers=headers, params=params).json()
    
    return pd.DataFrame([{
        'timestamp': pd.to_datetime(d['t'], unit='s'),
        'value': d['v']
    } for d in data])

# Usage
df = load_glassnode('indicators/sopr')  # Spent Output Profit Ratio
df = load_glassnode('addresses/count')   # Active addresses`,
  },
  {
    id: 'alternative',
    name: 'Alternative.me',
    category: 'alternative',
    tier: 'free',
    auth: 'none',
    rateLimit: 'N/A',
    description: 'Fear & Greed Index and sentiment data',
    endpoint: 'https://api.alternative.me/fng',
    docs: 'https://alternative.me/crypto-api/',
    sampleSymbol: 'feargreed',
    dataTypes: ['fear & greed', 'sentiment'],
    implementation: `import requests
import pandas as pd

def load_fear_greed(limit: int = 100) -> pd.DataFrame:
    """Get Fear & Greed Index history"""
    url = f'https://api.alternative.me/fng'
    params = {'limit': limit}
    data = requests.get(url, params=params).json()['data']
    
    return pd.DataFrame([{
        'timestamp': pd.to_datetime(int(d['timestamp']), unit='s'),
        'value': int(d['value']),
        'classification': d['value_classification']
    } for d in data])

# Usage
fg_data = load_fear_greed(365)
print(f"Current Fear & Greed: {fg_data.iloc[0]['value']}")`,
  },
]

interface StrategyTemplate {
  id: string
  name: string
  description: string
  category: 'momentum' | 'mean-reversion' | 'breakout' | 'multi-factor' | 'arbitrage' | 'oscillator' | 'volume' | 'trend'
  code: string
  params: Record<string, number>
  icon: string
}

const STRATEGY_TEMPLATES: Record<string, StrategyTemplate> = {
  momentum_crossover: {
    id: 'momentum_crossover',
    name: 'Momentum Crossover',
    description: 'EMA fast/slow crossover - classic trend following (uses close price from any data source)',
    category: 'momentum',
    icon: '⊛',
    params: { fast: 20, slow: 50 },
    code: `import pandas as pd

class MomentumStrategy:
    """
    EMA fast/slow crossover strategy.
    Data: Uses 'close' price - works with any data source (Binance, Yahoo, etc.)
    Signals: +1 = golden cross (BUY), -1 = death cross (SELL)
    """
    def __init__(self, fast=20, slow=50):
        self.fast = fast
        self.slow = slow
        
    def generate_signals(self, df):
        # Ensure we have required columns
        if 'close' not in df.columns:
            raise ValueError("DataFrame must contain 'close' price column")
        
        # Calculate EMAs
        df['fast_ema'] = df['close'].ewm(span=self.fast, adjust=False).mean()
        df['slow_ema'] = df['close'].ewm(span=self.slow, adjust=False).mean()
        
        # Detect crossovers (avoid lookahead bias with shift(1))
        golden_cross = (df['fast_ema'] > df['slow_ema']) & (df['fast_ema'].shift(1) <= df['slow_ema'].shift(1))
        death_cross = (df['fast_ema'] < df['slow_ema']) & (df['fast_ema'].shift(1) >= df['slow_ema'].shift(1))
        
        df['signal'] = 0
        df.loc[golden_cross, 'signal'] = 1   # BUY
        df.loc[death_cross, 'signal'] = -1  # SELL
        
        return df`,
  },
  mean_reversion: {
    id: 'mean_reversion',
    name: 'Mean Reversion',
    description: 'Bollinger Band reversion with Z-score (uses close, works with any data)',
    category: 'mean-reversion',
    icon: '◎',
    params: { window: 20, threshold: 2 },
    code: `import pandas as pd

class MeanReversionStrategy:
    """
    Mean reversion using Bollinger Bands.
    Data: Uses 'close' price from OHLC data
    Signals: +1 = price below lower band (BUY), -1 = above upper band (SELL)
    """
    def __init__(self, window=20, threshold=2):
        self.window = window
        self.threshold = threshold
        
    def generate_signals(self, df):
        if 'close' not in df.columns:
            raise ValueError("DataFrame must contain 'close' price column")
        
        sma = df['close'].rolling(self.window).mean()
        std = df['close'].rolling(self.window).std()
        
        # Bollinger Bands
        df['bb_lower'] = sma - self.threshold * std
        df['bb_middle'] = sma
        df['bb_upper'] = sma + self.threshold * std
        
        # Z-score for additional confirmation
        df['zscore'] = (df['close'] - sma) / std
        
        # Mean reversion signals
        df['signal'] = 0
        df.loc[df['close'] < df['bb_lower'], 'signal'] = 1   # Oversold - BUY
        df.loc[df['close'] > df['bb_upper'], 'signal'] = -1  # Overbought - SELL
        
        return df`,
  },
  rsi_trend: {
    id: 'rsi_trend',
    name: 'RSI Trend Filter',
    description: 'RSI oversold/overbought with trend confirmation (uses close)',
    category: 'mean-reversion',
    icon: '⊗',
    params: { period: 14, oversold: 30, overbought: 70 },
    code: `import pandas as pd

class RSIStrategy:
    """
    RSI strategy with overbought/oversold levels.
    Data: Uses 'close' price for RSI calculation
    Signals: +1 = RSI < oversold (BUY), -1 = RSI > overbought (SELL)
    """
    def __init__(self, period=14, oversold=30, overbought=70):
        self.period = period
        self.oversold = oversold
        self.overbought = overbought
        
    def generate_signals(self, df):
        if 'close' not in df.columns:
            raise ValueError("DataFrame must contain 'close' price column")
        
        # Calculate RSI
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0).rolling(self.period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(self.period).mean()
        
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # Generate signals
        df['signal'] = 0
        df.loc[df['rsi'] < self.oversold, 'signal'] = 1   # Oversold - BUY
        df.loc[df['rsi'] > self.overbought, 'signal'] = -1  # Overbought - SELL
        
        return df`,
  },
  volatility_breakout: {
    id: 'volatility_breakout',
    name: 'Volatility Breakout',
    description: 'ATR-based breakout with dynamic stops (uses OHLC data)',
    category: 'breakout',
    icon: '⊡',
    params: { window: 40, atr: 14, multiplier: 1.5 },
    code: `import pandas as pd
import numpy as np

class BreakoutStrategy:
    """
    ATR-based volatility breakout strategy.
    Data: Uses 'high', 'low', 'close' for ATR calculation
    Signals: +1 = break above N-period high (BUY), -1 = below low - ATR*multiplier (SELL)
    """
    def __init__(self, window=40, atr=14, multiplier=1.5):
        self.window = window
        self.atr = atr
        self.multiplier = multiplier
        
    def generate_signals(self, df):
        # Calculate rolling high/low for breakout detection
        df['roll_high'] = df['high'].rolling(self.window).max()
        df['roll_low'] = df['low'].rolling(self.window).min()
        
        # True Range for ATR
        high_low = df['high'] - df['low']
        tr1 = np.abs(df['high'] - df['close'].shift())
        tr2 = np.abs(df['low'] - df['close'].shift())
        tr = pd.concat([high_low, tr1, tr2], axis=1).max(axis=1)
        df['atr'] = tr.rolling(self.atr).mean()
        
        # Generate signals
        df['signal'] = 0
        df.loc[df['close'] > df['roll_high'], 'signal'] = 1   # Breakout BUY
        df.loc[df['close'] < (df['roll_low'] - df['atr'] * self.multiplier), 'signal'] = -1  # Stop loss SELL
        
        return df`,
  },
  dual_momentum: {
    id: 'dual_momentum',
    name: 'Dual Momentum',
    description: 'Absolute + relative momentum allocation (uses close returns)',
    category: 'multi-factor',
    icon: '⊕',
    params: { abs_r: 12, rel_r: 6 },
    code: `import pandas as pd

class DualMomentumStrategy:
    """
    Dual momentum: absolute momentum (trend) + relative momentum (relative strength).
    Data: Uses 'close' price - compare multiple assets for relative strength
    Signals: +1 = positive momentum (BUY), -1 = negative momentum (SELL)
    """
    def __init__(self, abs_r=12, rel_r=6):
        self.abs_r = abs_r   # Absolute momentum lookback (months)
        self.rel_r = rel_r    # Relative momentum lookback
        
    def generate_signals(self, df):
        if 'close' not in df.columns:
            raise ValueError("DataFrame must contain 'close' price column")
        
        # Absolute momentum (12-month returns)
        df['abs_mom'] = df['close'].pct_change(self.abs_r)
        
        # Relative momentum (6-month returns)  
        df['rel_mom'] = df['close'].pct_change(self.rel_r)
        
        # Signal based on absolute momentum direction
        df['signal'] = 0
        df.loc[df['abs_mom'] > 0, 'signal'] = 1    # Uptrend - BUY
        df.loc[df['abs_mom'] <= 0, 'signal'] = -1   # Downtrend - SELL
        
        return df`,
  },
  macd_crossover: {
    id: 'macd_crossover',
    name: 'MACD Crossover',
    description: 'MACD histogram crossover with signal line (uses close)',
    category: 'momentum',
    icon: '⊖',
    params: { fast: 12, slow: 26, signal: 9 },
    code: `import pandas as pd

class MACDStrategy:
    """
    MACD (Moving Average Convergence Divergence) strategy.
    Data: Uses 'close' price from OHLC data
    Signals: +1 = MACD crosses above signal (BUY), -1 = below (SELL)
    """
    def __init__(self, fast=12, slow=26, signal=9):
        self.fast = fast
        self.slow = slow
        self.signal = signal
        
    def generate_signals(self, df):
        if 'close' not in df.columns:
            raise ValueError("DataFrame must contain 'close' price column")
        
        # Calculate MACD components
        exp1 = df['close'].ewm(span=self.fast, adjust=False).mean()
        exp2 = df['close'].ewm(span=self.slow, adjust=False).mean()
        df['macd'] = exp1 - exp2
        df['signal_line'] = df['macd'].ewm(span=self.signal, adjust=False).mean()
        df['histogram'] = df['macd'] - df['signal_line']
        
        # Crossover signals
        df['signal'] = 0
        df.loc[(df['macd'] > df['signal_line']) & (df['macd'].shift(1) <= df['signal_line'].shift(1)), 'signal'] = 1   # BUY
        df.loc[(df['macd'] < df['signal_line']) & (df['macd'].shift(1) >= df['signal_line'].shift(1)), 'signal'] = -1  # SELL
        
        return df`,
  },
  stochastic_oscillator: {
    id: 'stochastic_oscillator',
    name: 'Stochastic Oscillator',
    description: 'K/D stochastic crossover with overbought/oversold (uses OHLC)',
    category: 'oscillator',
    icon: '⊜',
    params: { k_period: 14, d_period: 3, overbought: 80, oversold: 20 },
    code: `import pandas as pd

class StochasticStrategy:
    """
    Stochastic Oscillator strategy.
    Data: Uses 'high', 'low', 'close' (OHLC data)
    Signals: +1 = %K crosses above %D below oversold (BUY)
            -1 = %K crosses below %D above overbought (SELL)
    """
    def __init__(self, k_period=14, d_period=3, overbought=80, oversold=20):
        self.k_period = k_period
        self.d_period = d_period
        self.overbought = overbought
        self.oversold = oversold
        
    def generate_signals(self, df):
        required = ['high', 'low', 'close']
        for col in required:
            if col not in df.columns:
                raise ValueError(f"DataFrame must contain '{col}' column")
        
        # Calculate %K
        low_min = df['low'].rolling(self.k_period).min()
        high_max = df['high'].rolling(self.k_period).max()
        df['stoch_k'] = 100 * (df['close'] - low_min) / (high_max - low_min)
        
        # Calculate %D (smoothed %K)
        df['stoch_d'] = df['stoch_k'].rolling(self.d_period).mean()
        
        # Generate signals
        df['signal'] = 0
        
        # BUY: %K crosses above %D in oversold region
        buy_signal = (df['stoch_k'] > df['stoch_d']) & (df['stoch_k'].shift(1) <= df['stoch_d'].shift(1))
        buy_signal = buy_signal & (df['stoch_k'] < self.oversold)
        df.loc[buy_signal, 'signal'] = 1
        
        # SELL: %K crosses below %D in overbought region
        sell_signal = (df['stoch_k'] < df['stoch_d']) & (df['stoch_k'].shift(1) >= df['stoch_d'].shift(1))
        sell_signal = sell_signal & (df['stoch_k'] > self.overbought)
        df.loc[sell_signal, 'signal'] = -1
        
        return df`,
  },
  volume_price_trend: {
    id: 'volume_price_trend',
    name: 'Volume-Price Trend',
    description: 'OBV-based trend confirmation with volume (uses OHLCV)',
    category: 'volume',
    icon: '⊠',
    params: { volume_ma: 20, price_ma: 20 },
    code: `import pandas as pd

class VolumePriceStrategy:
    """
    Volume-Price Trend using On-Balance Volume (OBV).
    Data: Uses 'close' and 'volume' from OHLCV data
    Signals: +1 = OBV trending up + price above SMA (BUY)
            -1 = OBV trending down + price below SMA (SELL)
    """
    def __init__(self, volume_ma=20, price_ma=20):
        self.volume_ma = volume_ma
        self.price_ma = price_ma
        
    def generate_signals(self, df):
        if 'close' not in df.columns or 'volume' not in df.columns:
            raise ValueError("DataFrame must contain 'close' and 'volume' columns")
        
        # Calculate On-Balance Volume
        df['obv'] = (np.sign(df['close'].diff()) * df['volume']).fillna(0).cumsum()
        
        # Calculate moving averages
        df['volume_sma'] = df['volume'].rolling(self.volume_ma).mean()
        df['price_sma'] = df['close'].rolling(self.price_ma).mean()
        
        # Trend direction
        df['obv_trend'] = np.where(df['obv'] > df['obv'].shift(1), 1, -1)
        
        # Generate signals
        df['signal'] = 0
        # BUY: Price above SMA + OBV trending up
        buy = (df['close'] > df['price_sma']) & (df['obv_trend'] == 1)
        df.loc[buy, 'signal'] = 1
        
        # SELL: Price below SMA + OBV trending down
        sell = (df['close'] < df['price_sma']) & (df['obv_trend'] == -1)
        df.loc[sell, 'signal'] = -1
        
        return df`,
  },
  adx_trend_strength: {
    id: 'adx_trend_strength',
    name: 'ADX Trend Strength',
    description: 'Average directional index for trend strength (uses OHLC)',
    category: 'trend',
    icon: '⊝',
    params: { period: 14, adx_threshold: 25 },
    code: `import pandas as pd
import numpy as np

class ADXStrategy:
    """
    Average Directional Index (ADX) trend strength strategy.
    Data: Uses 'high', 'low', 'close' (OHLC data)
    Signals: +1 = ADX > threshold + DI+ > DI- (BUY)
            -1 = ADX > threshold + DI- > DI+ (SELL)
            0 = ADX < threshold (no trend)
    """
    def __init__(self, period=14, adx_threshold=25):
        self.period = period
        self.adx_threshold = adx_threshold
        
    def generate_signals(self, df):
        if not all(c in df.columns for c in ['high', 'low', 'close']):
            raise ValueError("DataFrame must contain 'high', 'low', 'close' columns")
        
        # Calculate True Range and DM
        high, low, close = df['high'], df['low'], df['close']
        
        tr1 = high - low
        tr2 = np.abs(high - close.shift(1))
        tr3 = np.abs(low - close.shift(1))
        df['tr'] = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        
        plus_dm = np.where((high - high.shift(1)) > (low.shift(1) - low), high - high.shift(1), 0)
        minus_dm = np.where((low.shift(1) - low) > (high - high.shift(1)), low.shift(1) - low, 0)
        
        # Smooth averages
        df['atr'] = df['tr'].rolling(self.period).mean()
        df['plus_dm'] = pd.Series(plus_dm).rolling(self.period).mean()
        df['minus_dm'] = pd.Series(minus_dm).rolling(self.period).mean()
        
        # Calculate DI+ and DI-
        df['di_plus'] = 100 * df['plus_dm'] / df['atr']
        df['di_minus'] = 100 * df['minus_dm'] / df['atr']
        
        # Calculate DX and ADX
        df['dx'] = 100 * np.abs(df['di_plus'] - df['di_minus']) / (df['di_plus'] + df['di_minus'])
        df['adx'] = df['dx'].rolling(self.period).mean()
        
        # Generate signals
        df['signal'] = 0
        
        # Strong uptrend: ADX > threshold + DI+ > DI-
        df.loc[(df['adx'] > self.adx_threshold) & (df['di_plus'] > df['di_minus']), 'signal'] = 1
        
        # Strong downtrend: ADX > threshold + DI- > DI+
        df.loc[(df['adx'] > self.adx_threshold) & (df['di_minus'] > df['di_plus']), 'signal'] = -1
        
        return df`,
  },
  arbitrage_spread: {
    id: 'arbitrage_spread',
    name: 'Arbitrage Spread',
    description: 'Cross-asset spread with Z-score',
    category: 'arbitrage',
    icon: '⇄',
    params: { window: 30, zscore: 2 },
    code: `import pandas as pd
import numpy as np

class ArbitrageStrategy:
    def __init__(self, window=30, zscore=2):
        self.window = window
        self.zscore = zscore
        
    def generate_signals(self, df):
        spread = df['close'] - df.get('close_btc', df['close'])
        
        mean = spread.rolling(self.window).mean()
        std = spread.rolling(self.window).std()
        z = (spread - mean) / std
        
        df['signal'] = 0
        df.loc[z < -self.zscore, 'signal'] = 1
        df.loc[z > self.zscore, 'signal'] = -1
        return df`,
  },
}

const CATEGORY_COLORS: Record<string, string> = {
  momentum: C.blue,
  'mean-reversion': C.mint,
  breakout: C.orange,
  'multi-factor': C.purple,
  arbitrage: C.red,
  oscillator: C.purple,
  volume: C.orange,
  trend: C.blue,
}

const DATA_SOURCES = [
  { id: 'binance', name: 'Binance', badge: 'PRIMARY · CRYPTO', badgeColor: '#F0B90B', noKey: true, description: 'World\'s largest crypto exchange. Zero API key required.', endpoint: 'https://api.binance.com/api/v3/klines', status: 'available' },
  { id: 'yahoo', name: 'Yahoo Finance', badge: 'PRIMARY · EQUITIES', badgeColor: '#5B8CFF', noKey: true, description: '30,000+ global equities, ETFs, indices.', endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart', status: 'available' },
  { id: 'coingecko', name: 'CoinGecko', badge: 'CRYPTO · FUNDAMENTALS', badgeColor: '#22F0B5', noKey: true, description: 'Comprehensive crypto market data.', endpoint: 'https://api.coingecko.com/api/v3', status: 'available' },
  { id: 'kraken', name: 'Kraken', badge: 'CRYPTO · RELIABLE', badgeColor: '#A78BFA', noKey: true, description: 'Professional crypto exchange API.', endpoint: 'https://api.kraken.com/0/public/OHLC', status: 'available' },
  { id: 'fred', name: 'FRED', badge: 'MACRO · ECONOMIC', badgeColor: '#FF5468', noKey: true, description: 'Federal Reserve Economic Data.', endpoint: 'https://fred.stlouisfed.org/graph/fredgraph.csv', status: 'available' },
]

const INDICATORS = [
  { id: 'ema', name: 'EMA', abbrev: 'EMA', category: 'trend', formula: 'EMA = α × price + (1-α) × EMA_prev', description: 'Exponential Moving Average' },
  { id: 'sma', name: 'SMA', abbrev: 'SMA', category: 'trend', formula: 'SMA = Sum(close, n) / n', description: 'Simple Moving Average' },
  { id: 'rsi', name: 'RSI', abbrev: 'RSI', category: 'oscillator', formula: 'RSI = 100 - 100/(1+RS)', description: 'Relative Strength Index' },
  { id: 'macd', name: 'MACD', abbrev: 'MACD', category: 'momentum', formula: 'MACD = EMA_12 - EMA_26', description: 'Moving Average Convergence Divergence' },
  { id: 'bb', name: 'Bollinger Bands', abbrev: 'BB', category: 'volatility', formula: 'BB = SMA ± 2 × std', description: 'Price volatility bands' },
  { id: 'atr', name: 'ATR', abbrev: 'ATR', category: 'volatility', formula: 'ATR = Average(True Range)', description: 'Average True Range' },
  { id: 'stoch', name: 'Stochastic', abbrev: 'STOCH', category: 'oscillator', formula: '%K = 100 × (C-L)/(H-L)', description: 'Stochastic Oscillator' },
  { id: 'adx', name: 'ADX', abbrev: 'ADX', category: 'trend', formula: 'ADX = 100 × Avg(+DI - -DI)', description: 'Average Directional Index' },
]

const RISK_METRICS = [
  { id: 'sharpe', name: 'Sharpe Ratio', abbrev: 'SHARPE', category: 'ratio', formula: '(Return - RiskFree) / StdDev', description: 'Risk-adjusted return measure' },
  { id: 'sortino', name: 'Sortino Ratio', abbrev: 'SORTINO', category: 'ratio', formula: '(Return - Target) / DownsideDev', description: 'Downside risk-adjusted return' },
  { id: 'maxdd', name: 'Max Drawdown', abbrev: 'MAXDD', category: 'risk', formula: 'Max(Peak - Trough) / Peak', description: 'Largest peak-to-trough decline' },
  { id: 'calmar', name: 'Calmar Ratio', abbrev: 'CALMAR', category: 'ratio', formula: 'AnnualReturn / MaxDD', description: 'Return per unit drawdown risk' },
  { id: 'winrate', name: 'Win Rate', abbrev: 'WIN%', category: 'trade', formula: 'Wins / TotalTrades', description: 'Percentage of profitable trades' },
  { id: 'profitfactor', name: 'Profit Factor', abbrev: 'PF', category: 'trade', formula: 'GrossProfit / GrossLoss', description: 'Total profits vs losses' },
]

const BACKTEST_PITFALLS = [
  { name: 'Lookahead Bias', severity: 'CRITICAL', description: 'Using future information in signals', fix: 'Use shift(1) to prevent forward-looking bias' },
  { name: 'Survivorship Bias', severity: 'HIGH', description: 'Testing only on surviving assets', fix: 'Include delisted/failed assets in test period' },
  { name: 'Overfitting', severity: 'HIGH', description: 'Optimizing too many parameters', fix: 'Use walk-forward analysis or out-of-sample testing' },
  { name: 'Transaction Costs', severity: 'MEDIUM', description: 'Ignoring fees and slippage', fix: 'Include realistic fee model (0.1% per trade)' },
]

const CRYPTOS = [
  { value: 'BTC-USD', label: 'Bitcoin', icon: '₿' },
  { value: 'ETH-USD', label: 'Ethereum', icon: 'Ξ' },
  { value: 'SOL-USD', label: 'Solana', icon: '◎' },
  { value: 'BNB-USD', label: 'BNB', icon: '⬡' },
  { value: 'XRP-USD', label: 'XRP', icon: '✕' },
  { value: 'ADA-USD', label: 'Cardano', icon: '₳' },
  { value: 'DOGE-USD', label: 'Dogecoin', icon: 'Ð' },
  { value: 'AVAX-USD', label: 'Avalanche', icon: '▲' },
]

const PERIODS = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: '2y', label: '2 years' },
  { value: '5y', label: '5 years' },
]

const TIMEFRAMES = [
  { value: '1d', label: '1 day' },
  { value: '1h', label: '1 hour' },
  { value: '30m', label: '30 min' },
  { value: '15m', label: '15 min' },
  { value: '5m', label: '5 min' },
]

const AI_SUGGESTIONS = [
  { label: 'Add stop-loss', prompt: 'Add a 5% stop-loss mechanism to protect against losses' },
  { label: 'Optimize Sharpe', prompt: 'Optimize for better risk-adjusted returns (higher Sharpe ratio)' },
  { label: 'Add data source', prompt: 'Show me how to add a new data source to my strategy' },
  { label: 'Add take-profit', prompt: 'Add a 10% take-profit exit to lock in gains' },
  { label: 'ATR stops', prompt: 'Use ATR-based trailing stops for dynamic risk management' },
  { label: 'Multi-symbol', prompt: 'Modify this strategy to work with multiple symbols' },
]

interface SavedAgent {
  id: string
  name: string
  strategyId: string
  code: string
  params: Record<string, number>
  symbol: string
  timeframe: string
  period: string
  createdAt: string
  updatedAt: string
}

interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  content?: string
  children?: FileNode[]
}

interface ChartPoint {
  date: string
  strategy: number
  buyHold: number
}

interface TradeStats {
  date: string
  action: string
  price: number
  returnPct?: number
}

function generateId() {
  return Math.random().toString(36).substring(2, 11)
}

const DEFAULT_FILES: FileNode[] = [
  { id: 'strategies', name: 'strategies', type: 'folder', children: [
    { id: 'momentum.py', name: 'momentum.py', type: 'file', content: STRATEGY_TEMPLATES.momentum_crossover.code },
    { id: 'mean_reversion.py', name: 'mean_reversion.py', type: 'file', content: STRATEGY_TEMPLATES.mean_reversion.code },
    { id: 'breakout.py', name: 'breakout.py', type: 'file', content: STRATEGY_TEMPLATES.volatility_breakout.code },
  ]},
  { id: 'data', name: 'data', type: 'folder', children: [
    { id: 'fetch.py', name: 'fetch.py', type: 'file', content: `"""
Data fetching module for multiple sources.
"""
import pandas as pd
import requests
from typing import Optional

class DataFetcher:
    def __init__(self, source: str = "yahoo"):
        self.source = source
    
    def fetch_crypto(self, symbol: str, interval: str = "1d", 
                     limit: int = 365) -> pd.DataFrame:
        """Fetch crypto data from Binance"""
        if self.source == "binance":
            return self._fetch_binance(symbol, interval, limit)
        return self._fetch_yahoo(symbol, interval, limit)
    
    def _fetch_binance(self, symbol: str, interval: str, 
                       limit: int) -> pd.DataFrame:
        """Binance API fetch"""
        sym = symbol.replace("-USD", "USDT")
        url = f"https://api.binance.com/api/v3/klines"
        params = {
            "symbol": sym, "interval": interval, "limit": limit
        }
        cols = ["open_time", "open", "high", "low", "close", 
                "volume", "close_time", "quote_volume"]
        try:
            r = requests.get(url, params=params, timeout=10)
            data = r.json()
            df = pd.DataFrame(data, columns=cols)
            df["date"] = pd.to_datetime(df["open_time"], unit="ms")
            df[cols[1:6]] = df[cols[1:6]].astype(float)
            return df[["date", "open", "high", "low", "close", "volume"]]
        except Exception as e:
            raise ValueError(f"Binance fetch failed: {e}")
    
    def _fetch_yahoo(self, symbol: str, interval: str, 
                      limit: int) -> pd.DataFrame:
        """Yahoo Finance fetch via yfinance"""
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=f"{limit}d", interval=interval)
        df = df.reset_index()
        df.columns = [c.lower() for c in df.columns]
        return df` },
    { id: 'preprocess.py', name: 'preprocess.py', type: 'file', content: `"""
Data preprocessing and feature engineering.
"""
import pandas as pd
import numpy as np

def calculate_returns(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate log returns and simple returns"""
    df["returns"] = df["close"].pct_change()
    df["log_returns"] = np.log(df["close"] / df["close"].shift(1))
    return df

def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add calendar-based features"""
    df["date"] = pd.to_datetime(df["date"])
    df["day_of_week"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month
    df["quarter"] = df["date"].dt.quarter
    df["is_month_start"] = df["date"].dt.is_month_start.astype(int)
    df["is_month_end"] = df["date"].dt.is_month_end.astype(int)
    return df

def resample_ohlc(df: pd.DataFrame, freq: str = "W") -> pd.DataFrame:
    """Resample OHLC to different frequency"""
    df = df.set_index("date")
    ohlc = df[["open", "high", "low", "close", "volume"]].resample(freq).agg({
        "open": "first", "high": "max", "low": "min", 
        "close": "last", "volume": "sum"
    }).dropna()
    return ohlc.reset_index()

def detect_outliers(df: pd.DataFrame, column: str = "returns",
                   n_std: float = 3.0) -> pd.Series:
    """Detect outliers using z-score"""
    mean = df[column].mean()
    std = df[column].std()
    return np.abs(df[column] - mean) > (n_std * std)` },
  ]},
  { id: 'utils', name: 'utils', type: 'folder', children: [
    { id: 'indicators.py', name: 'indicators.py', type: 'file', content: `"""
Technical indicators library.
"""
import pandas as pd
import numpy as np

def ema(series: pd.Series, span: int) -> pd.Series:
    """Exponential moving average"""
    return series.ewm(span=span, adjust=False).mean()

def sma(series: pd.Series, window: int) -> pd.Series:
    """Simple moving average"""
    return series.rolling(window).mean()

def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (Wilder smoothing)"""
    delta = series.diff()
    gain = delta.where(delta > 0, 0).ewm(alpha=1/period, adjust=False).mean()
    loss = (-delta.where(delta < 0, 0)).ewm(alpha=1/period, adjust=False).mean()
    rs = gain / loss.replace(0, np.inf)
    return 100 - (100 / (1 + rs))

def macd(series: pd.Series, fast: int = 12, 
         slow: int = 26, signal: int = 9) -> pd.DataFrame:
    """MACD indicator"""
    ema_fast = ema(series, fast)
    ema_slow = ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "hist": histogram})

def bollinger_bands(series: pd.Series, window: int = 20,
                    num_std: float = 2.0) -> pd.DataFrame:
    """Bollinger Bands"""
    sma = series.rolling(window).mean()
    std = series.rolling(window).std()
    return pd.DataFrame({
        "upper": sma + (std * num_std),
        "middle": sma,
        "lower": sma - (std * num_std)
    })

def atr(high: pd.Series, low: pd.Series, close: pd.Series,
        period: int = 14) -> pd.Series:
    """Average True Range"""
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, adjust=False).mean()

def stochastics(high: pd.Series, low: pd.Series, close: pd.Series,
                k_period: int = 14, d_period: int = 3) -> pd.DataFrame:
    """Stochastic Oscillator"""
    lowest_low = low.rolling(k_period).min()
    highest_high = high.rolling(k_period).max()
    k = 100 * (close - lowest_low) / (highest_high - lowest_low)
    d = k.rolling(d_period).mean()
    return pd.DataFrame({"k": k, "d": d})` },
    { id: 'risk.py', name: 'risk.py', type: 'file', content: `"""
Risk management utilities.
"""
import pandas as pd
import numpy as np

def position_size(capital: float, risk_pct: float, 
                 entry: float, stop: float) -> float:
    """Calculate position size based on risk"""
    risk_amount = capital * risk_pct
    risk_per_share = abs(entry - stop)
    return risk_amount / risk_per_share if risk_per_share > 0 else 0

def trailing_stop(prices: pd.Series, positions: pd.Series,
                  atr_mult: float = 2.0, period: int = 14) -> pd.Series:
    """Dynamic trailing stop using ATR"""
    from .indicators import atr, high, low, close
    stop = atr(high, low, close, period) * atr_mult
    trailing = pd.Series(index=prices.index, dtype=float)
    for i in range(len(prices)):
        if i == 0:
            trailing.iloc[i] = prices.iloc[i] - stop.iloc[i]
        else:
            prev = trailing.iloc[i-1]
            curr = prices.iloc[i] - stop.iloc[i]
            if positions.iloc[i] == 1:
                trailing.iloc[i] = max(prev, curr)
            else:
                trailing.iloc[i] = curr
    return trailing

def max_drawdown(equity: pd.Series) -> tuple:
    """Calculate max drawdown and duration"""
    peak = equity.expanding().max()
    drawdown = (equity - peak) / peak
    max_dd = drawdown.min()
    max_dd_idx = drawdown.idxmin()
    peak_idx = equity[:max_dd_idx].idxmax()
    duration = (max_dd_idx - peak_idx).days if peak_idx else 0
    return max_dd, duration, peak_idx, max_dd_idx

def sharpe_ratio(returns: pd.Series, risk_free: float = 0.02) -> float:
    """Annualized Sharpe ratio"""
    excess = returns - risk_free / 252
    return np.sqrt(252) * excess.mean() / excess.std() if excess.std() > 0 else 0

def sortino_ratio(returns: pd.Series, risk_free: float = 0.02) -> float:
    """Sortino ratio (downside deviation)"""
    excess = returns - risk_free / 252
    downside = excess[excess < 0]
    downside_std = np.sqrt((downside ** 2).mean()) * np.sqrt(252)
    return excess.mean() * 252 / downside_std if downside_std > 0 else 0` },
    { id: 'portfolio.py', name: 'portfolio.py', type: 'file', content: `"""
Portfolio management and execution simulation.
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Optional

@dataclass
class Trade:
    entry_date: pd.Timestamp
    entry_price: float
    quantity: float
    exit_date: Optional[pd.Timestamp] = None
    exit_price: Optional[float] = None
    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None
    
    def close(self, date: pd.Timestamp, price: float):
        self.exit_date = date
        self.exit_price = price
        self.pnl = (price - self.entry_price) * self.quantity
        self.pnl_pct = (price / self.entry_price - 1) * 100

class Portfolio:
    def __init__(self, initial_capital: float = 100_000,
                 fee: float = 0.001, slippage: float = 0.0005):
        self.capital = initial_capital
        self.initial = initial_capital
        self.cash = initial_capital
        self.position = 0
        self.fee = fee
        self.slippage = slippage
        self.trades: list[Trade] = []
        self.equity_curve: list[float] = []
        
    def buy(self, date: pd.Timestamp, price: float, quantity: float):
        """Execute buy order"""
        cost = price * quantity * (1 + self.fee + self.slippage)
        if cost > self.cash:
            quantity = self.cash / (price * (1 + self.fee + self.slippage))
            cost = price * quantity * (1 + self.fee + self.slippage)
        self.cash -= cost
        self.position += quantity
        self.trades.append(Trade(date, price, quantity))
        
    def sell(self, date: pd.Timestamp, price: float):
        """Execute sell order"""
        if self.position > 0:
            proceeds = price * self.position * (1 - self.fee - self.slippage)
            self.cash += proceeds
            self.trades[-1].close(date, price)
            self.position = 0
            
    def update_equity(self, price: float):
        """Update current equity"""
        equity = self.cash + self.position * price
        self.equity_curve.append(equity)
        return equity
    
    def get_stats(self) -> dict:
        """Calculate portfolio statistics"""
        returns = pd.Series(self.equity_curve).pct_change().dropna()
        wins = [t for t in self.trades if t.pnl and t.pnl > 0]
        losses = [t for t in self.trades if t.pnl and t.pnl <= 0]
        return {
            "total_return": (self.cash + self.position * self.equity_curve[-1] - self.initial) / self.initial * 100,
            "n_trades": len(self.trades),
            "win_rate": len(wins) / len(self.trades) * 100 if self.trades else 0,
            "avg_win": np.mean([t.pnl_pct for t in wins]) if wins else 0,
            "avg_loss": np.mean([t.pnl_pct for t in losses]) if losses else 0,
            "sharpe": sharpe_ratio(returns) if len(returns) > 0 else 0,
        }` },
  ]},
  { id: 'backtest.py', name: 'backtest.py', type: 'file', content: `"""
Backtesting engine.
"""
import pandas as pd
import numpy as np
from .portfolio import Portfolio
from .indicators import ema, rsi, macd, bollinger_bands, atr

def run_backtest(df: pd.DataFrame, signals: pd.Series,
                 initial_capital: float = 100_000,
                 fee: float = 0.001) -> dict:
    """
    Run backtest with given signals.
    
    Args:
        df: OHLCV data with date index
        signals: 1 for long, 0 for flat
        initial_capital: Starting capital
        fee: Trading fee (decimal)
    
    Returns:
        Dictionary with equity curve, trades, and statistics
    """
    portfolio = Portfolio(initial_capital, fee)
    
    for i, (date, row) in enumerate(df.iterrows()):
        if i == 0:
            portfolio.update_equity(row["close"])
            continue
            
        prev_signal = signals.iloc[i-1] if i > 0 else 0
        curr_signal = signals.iloc[i]
        
        # Entry
        if curr_signal == 1 and prev_signal == 0:
            shares = portfolio.cash / row["close"]
            portfolio.buy(date, row["close"], shares)
            
        # Exit
        elif curr_signal == 0 and prev_signal == 1:
            portfolio.sell(date, row["close"])
            
        portfolio.update_equity(row["close"])
    
    return {
        "equity_curve": portfolio.equity_curve,
        "trades": portfolio.trades,
        "final_value": portfolio.equity_curve[-1] if portfolio.equity_curve else initial_capital,
        "stats": portfolio.get_stats()
    }

def walk_forward(df: pd.DataFrame, strategy_func,
                 train_days: int = 252, test_days: int = 63,
                 **kwargs) -> list[dict]:
    """Walk-forward analysis"""
    results = []
    for i in range(0, len(df) - train_days - test_days, test_days):
        train = df.iloc[i:i+train_days]
        test = df.iloc[i+train_days:i+train_days+test_days]
        
        # Optimize on train
        best_params = strategy_func(train, optimize=True, **kwargs)
        
        # Test on out-of-sample
        signals = strategy_func(test, params=best_params, **kwargs)
        result = run_backtest(test, signals)
        
        results.append({
            "train_period": f"{train.index[0]} to {train.index[-1]}",
            "test_period": f"{test.index[0]} to {test.index[-1]}",
            "test_return": result["stats"]["total_return"],
            **result["stats"]
        })
    
    return results` },
  { id: 'config.py', name: 'config.py', type: 'file', content: `"""
Strategy configuration.
"""
from dataclasses import dataclass
from typing import Optional

@dataclass
class StrategyConfig:
    name: str
    symbol: str = "BTC-USD"
    initial_capital: float = 100_000
    max_position_size: float = 1.0
    risk_per_trade: float = 0.02
    fee: float = 0.001
    slippage: float = 0.0005
    max_drawdown_limit: float = 0.25
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    
    def validate(self) -> bool:
        """Validate configuration"""
        if self.initial_capital <= 0:
            raise ValueError("Initial capital must be positive")
        if not 0 <= self.risk_per_trade <= 1:
            raise ValueError("Risk per trade must be 0-1")
        if self.max_position_size > 1:
            raise ValueError("Max position size cannot exceed 100%")
        return True

# Default configs for different strategies
MOMENTUM_CONFIG = StrategyConfig(
    name="momentum",
    max_position_size=0.95,
    risk_per_trade=0.02
)

MEAN_REVERSION_CONFIG = StrategyConfig(
    name="mean_reversion",
    max_position_size=0.90,
    risk_per_trade=0.01
)

BREAKOUT_CONFIG = StrategyConfig(
    name="breakout",
    max_position_size=0.95,
    risk_per_trade=0.025,
    stop_loss_pct=0.05
)` },
]

export default function BuildPage() {
  const [view, setView] = useState<'editor' | 'docs' | 'data' | 'create'>('editor')
  
  const [files, setFiles] = useState<FileNode[]>(DEFAULT_FILES)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['strategies', 'data', 'utils']))
  const [selectedFile, setSelectedFile] = useState<string | null>('momentum.py')
  const [activeFileContent, setActiveFileContent] = useState(STRATEGY_TEMPLATES.momentum_crossover.code)
  
  const [strategy, setStrategy] = useState<StrategyTemplate>(STRATEGY_TEMPLATES.momentum_crossover)
  const [code, setCode] = useState(STRATEGY_TEMPLATES.momentum_crossover.code)
  const [params, setParams] = useState(STRATEGY_TEMPLATES.momentum_crossover.params)
  
  const [symbol, setSymbol] = useState('BTC-USD')
  const [period, setPeriod] = useState('1y')
  const [timeframe, setTimeframe] = useState('1d')
  
  const [leftPanel, setLeftPanel] = useState<'docs' | 'data'>('docs')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  const [showSettings, setShowSettings] = useState(false)
  const [fee, setFee] = useState(0.1)
  const [slippage, setSlippage] = useState(0.05)
  
  const [rightPanel, setRightPanel] = useState<'ai' | 'docs'>('ai')
  
  const [backtesting, setBacktesting] = useState(false)
  const [btResult, setBtResult] = useState<BacktestResult | null>(null)
  const [trades, setTrades] = useState<TradeStats[]>([])
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [buyHoldResult, setBuyHoldResult] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showChart, setShowChart] = useState(false)
  const [backtestStatus, setBacktestStatus] = useState<string>('')
  
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    '🏛️ ASE Agent Studio v1.0.0',
    '¥ Connected to ASE backend',
    '¥ Type "help" for available commands',
    '',
  ])
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalLoading, setTerminalLoading] = useState(false)
  
  const [docsSection, setDocsSection] = useState<'overview' | 'api' | 'strategies' | 'indicators' | 'risk' | 'data'>('overview')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  
  const [savedAgents, setSavedAgents] = useState<SavedAgent[]>([])
  const [agentName, setAgentName] = useState('')
  
  // Data API search
  const [dataSearch, setDataSearch] = useState('')
  const [dataCategory, setDataCategory] = useState<string>('all')
  const [selectedAPI, setSelectedAPI] = useState<DataAPI | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('saved_agents')
    if (saved) {
      try {
        setSavedAgents(JSON.parse(saved))
      } catch {}
    }
  }, [])

  useEffect(() => {
    const savedId = localStorage.getItem('build_strategy_id')
    if (savedId && STRATEGY_TEMPLATES[savedId]) {
      const s = STRATEGY_TEMPLATES[savedId]
      setStrategy(s)
      setCode(s.code)
      setParams(s.params)
    }
  }, [])

  // Filter data APIs based on search and category
  const filteredAPIs = useMemo(() => {
    return DATA_APIS.filter(api => {
      const matchesSearch = dataSearch === '' || 
        api.name.toLowerCase().includes(dataSearch.toLowerCase()) ||
        api.description.toLowerCase().includes(dataSearch.toLowerCase()) ||
        api.dataTypes.some(dt => dt.toLowerCase().includes(dataSearch.toLowerCase()))
      const matchesCategory = api.category === 'crypto' && (dataCategory === 'all' || dataCategory === 'crypto')
      return matchesSearch && matchesCategory
    })
  }, [dataSearch, dataCategory])

  // AI context for data APIs
  const askAIForAPI = (api: DataAPI) => {
    setView('editor')
    setRightPanel('ai')
    setSelectedAPI(api)
    
    const prompt = `Integrate ${api.name} data into my trading strategy.

Strategy: ${strategy.name} | Symbol: ${symbol} | Timeframe: ${timeframe}

${api.name}: ${api.description}
- Endpoint: ${api.endpoint}
- Auth: ${api.auth} (${api.rateLimit})
- Data: ${api.dataTypes.join(', ')}

Write Python code to:
1. Load data from ${api.name}
2. Generate BUY/SELL signals based on this data
3. Integrate with my current strategy

Signal format: signal: buy, {price} OR signal: sell, {price}`

    setTimeout(() => sendToAi(prompt, true), 100)
  }

  const implementAPI = (api: DataAPI) => {
    // Add the implementation code to the editor
    const loaderCode = `
# ${api.name} Data Loader
# ${api.description}
# Auth: ${api.auth} | Rate: ${api.rateLimit}

${api.implementation}

# Load data for your strategy
# data = load_${api.id.replace('_', '')}(${api.sampleSymbol.split(',')[0].trim()})
# print(data.head())
`
    setCode(prev => prev + '\n\n' + loaderCode)
    setTerminalOutput(prev => [...prev, `✓ Added ${api.name} loader to code`])
    setLeftPanel('docs')
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') {
          e.preventDefault()
          runBacktest()
        } else if (e.key === 's') {
          e.preventDefault()
          saveAgent()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [code, params, symbol, timeframe, period])

  const saveAgent = () => {
    if (!agentName.trim()) {
      setTerminalOutput(prev => [...prev, `Error: Please enter an agent name`])
      return
    }
    
    const agent: SavedAgent = {
      id: generateId(),
      name: agentName,
      strategyId: strategy.id,
      code,
      params: { ...params },
      symbol,
      timeframe,
      period,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    const updated = [...savedAgents, agent]
    setSavedAgents(updated)
    localStorage.setItem('saved_agents', JSON.stringify(updated))
    setTerminalOutput(prev => [...prev, `✓ Agent "${agentName}" saved successfully`])
    setAgentName('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const loadAgent = (agent: SavedAgent) => {
    const s = STRATEGY_TEMPLATES[agent.strategyId]
    if (s) {
      setStrategy(s)
      setCode(agent.code)
      setParams(agent.params)
      setSymbol(agent.symbol)
      setTimeframe(agent.timeframe)
      setPeriod(agent.period)
      setTerminalOutput(prev => [...prev, `✓ Loaded agent: ${agent.name}`])
    }
  }

  const deleteAgent = (id: string) => {
    const updated = savedAgents.filter(a => a.id !== id)
    setSavedAgents(updated)
    localStorage.setItem('saved_agents', JSON.stringify(updated))
    setTerminalOutput(prev => [...prev, `✓ Agent deleted`])
  }

  const extractCode = (text: string): string | null => {
    const match = text.match(/```python\n([\s\S]*?)```/) || text.match(/___CODE_START___([\s\S]*?)___CODE_END___/)
    return match ? match[1].trim() : null
  }

  const handleTemplateSelect = (id: string) => {
    const s = STRATEGY_TEMPLATES[id]
    if (s) {
      setStrategy(s)
      setCode(s.code)
      setParams(s.params)
      localStorage.setItem('build_strategy_id', id)
      setTerminalOutput(prev => [...prev, `✓ Loaded template: ${s.name}`])
    }
  }

  const handleParamChange = (key: string, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }))
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const runTerminalCommand = async (cmd: string) => {
    const trimmed = cmd.trim()
    if (!trimmed) return
    
    setTerminalOutput(prev => [...prev, `¥ ${trimmed}`])
    setTerminalInput('')
    setTerminalLoading(true)
    
    await new Promise(r => setTimeout(r, 300))
    
    const parts = trimmed.split(' ')
    const command = parts[0]
    const args = parts.slice(1).join(' ')
    
    switch (command) {
      case 'help':
        setTerminalOutput(prev => [...prev,
          'Available commands:',
          '  run, backtest    - Run backtest',
          '  validate       - Validate code syntax',
          '  templates      - List strategy templates',
          '  save <name>    - Save current agent',
          '  load <name>   - Load saved agent',
          '  delete <name> - Delete saved agent',
          '  docs          - Open documentation',
          '  clear         - Clear terminal',
          '  exit          - Return to editor',
        ])
        break
        
      case 'backtest':
      case 'run':
        setTerminalOutput(prev => [...prev, 'Running backtest...'])
        runBacktest()
        break
        
      case 'validate':
        setTerminalOutput(prev => [...prev, 'Validating code...'])
        try {
          new Function(code)
          setTerminalOutput(prev => [...prev, '✓ Code is valid (Python syntax not checked in browser)'])
        } catch (e) {
          setTerminalOutput(prev => [...prev, `✗ Syntax error: ${e}`])
        }
        break
        
      case 'templates':
        setTerminalOutput(prev => [...prev, 'Available templates:'])
        Object.values(STRATEGY_TEMPLATES).forEach(s => {
          setTerminalOutput(prev => [...prev, `  ${s.id} - ${s.name}`])
        })
        break
        
      case 'save':
        if (args) {
          setAgentName(args)
          saveAgent()
        } else {
          setTerminalOutput(prev => [...prev, 'Usage: save <agent_name>'])
        }
        break
        
      case 'load':
        const found = savedAgents.find(a => a.name.toLowerCase() === args.toLowerCase())
        if (found) {
          loadAgent(found)
        } else {
          setTerminalOutput(prev => [...prev, `Agent not found: ${args}`])
        }
        break
        
      case 'delete':
        const toDelete = savedAgents.find(a => a.name.toLowerCase() === args.toLowerCase())
        if (toDelete) {
          deleteAgent(toDelete.id)
        } else {
          setTerminalOutput(prev => [...prev, `Agent not found: ${args}`])
        }
        break
        
      case 'docs':
        setView('docs')
        setTerminalOutput(prev => [...prev, 'Opening documentation...'])
        break
        
      case 'clear':
        setTerminalOutput(['¥ Terminal cleared', ''])
        break
        
      case 'exit':
        setView('editor')
        break
        
      case 'list':
      case 'ls':
        setTerminalOutput(prev => [...prev, 'Saved agents:'])
        if (savedAgents.length === 0) {
          setTerminalOutput(prev => [...prev, '  (none)'])
        } else {
          savedAgents.forEach(a => {
            setTerminalOutput(prev => [...prev, `  ${a.name} (${a.strategyId})`])
          })
        }
        break
        
      default:
        setTerminalOutput(prev => [...prev, `Unknown command: ${command}. Type "help" for available commands.`])
    }
    
    setTerminalLoading(false)
  }

  const sendToAi = async (prompt?: string, silent?: boolean) => {
    const userMsg = prompt || aiInput
    if (!userMsg.trim() || aiLoading) return
    
    setAiInput('')
    if (!silent) {
      setAiMessages(prev => [...prev, { role: 'user', content: userMsg }])
    }
    setAiLoading(true)
    
    const strategyNames: Record<string, string> = {
      momentum_crossover: 'Momentum Crossover',
      mean_reversion: 'Mean Reversion',
      breakout_trend: 'Breakout Trend',
      rsi_trend_filter: 'RSI Trend Filter',
      volatility_breakout: 'Volatility Breakout',
      dual_momentum: 'Dual Momentum',
      rsi_mean_reversion: 'RSI Mean Reversion',
      macd_trend: 'MACD Trend',
    }
    
const contextPrompt = `You are an expert quant developer at ASE Quant - a platform for building and deploying trading agents.

ROLE: Help users create profitable, risk-aware trading strategies with clean, working Python code.

PLATFORM BASICS:
• Users write Python code that emits BUY/SELL signals
• Platform handles: position sizing, fees (0.1%), slippage, equity tracking
• Run "Quick Test" (30d) for fast iteration, "Sandbox Test" (2yr) for validation
• Results: Return, Sharpe, Max DD, Win Rate, Trades, Avg Win/Loss, Profit Factor

CORE RULES:
• Always provide working, runnable Python code
• Use the signal format: signal: buy, {price} OR signal: sell, {price}
• Keep code clean and well-commented
• Always apply code automatically when user requests improvements

RESPONSE STYLE:
• Be concise but actionable
• Always explain WHY (e.g., "RSI < 30 catches oversold bounces")
• Warn about pitfalls (overfitting, lookahead bias, fee impact)
• End with specific next steps or questions

CURRENT CONTEXT:
- Strategy: ${strategyNames[strategy.id] || strategy.name}
- Symbol: ${symbol}
- Timeframe: ${timeframe}

Your code:
\`\`\`python
${code}
\`\`\`

User request: ${userMsg}

Provide your response with:
1. Brief explanation of approach
2. Working Python code in markdown blocks
3. Specific parameter suggestions with rationale`

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: contextPrompt }]
        })
      })
      const data = await res.json()
      
      if (data.reply) {
        const reply = data.reply
        setAiMessages(prev => [...prev, { role: 'assistant', content: reply }])
        
        // Auto-apply code changes if AI provides new code
        const codeMatch = reply.match(/```python\n([\s\S]*?)```/)?.[1] || reply.match(/```\n([\s\S]*?)```/)?.[1]
        if (codeMatch && (userMsg.toLowerCase().includes('improve') || userMsg.toLowerCase().includes('strategy') || userMsg.toLowerCase().includes('add') || userMsg.toLowerCase().includes('optimize') || userMsg.toLowerCase().includes('incorporate') || userMsg.toLowerCase().includes('integrate') || userMsg.toLowerCase().includes('rsi') || userMsg.toLowerCase().includes('macd') || userMsg.toLowerCase().includes('bollinger') || userMsg.toLowerCase().includes('stop') || userMsg.toLowerCase().includes('volume'))) {
          const cleanedCode = codeMatch.replace(/^#.*$/gm, '').trim()
          if (cleanedCode.length > 100) {
            setCode(cleanedCode)
            setTimeout(() => setAiMessages(prev => [...prev, { role: 'assistant', content: '✨ Applied code changes automatically!' }]), 500)
          }
        }
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', content: data.error || 'AI unavailable - check your API key configuration' }])
      }
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Request failed - please try again' }])
    } finally {
      setAiLoading(false)
    }
  }

  const askAI = (type: 'explain' | 'improve' | 'indicators' | 'risks' | 'data' | 'optimize') => {
    const prompts = {
      explain: `Explain how this strategy works. What triggers the buy/sell signals? Which indicators are used and what are the threshold values?`,
      improve: `Analyze the current strategy and suggest 2-3 specific improvements. Generate code with the same signal format (# BUY at price or signal: buy, price).`,
      indicators: `Add a relevant indicator (like RSI, MACD, or Bollinger Bands) to improve signal quality. Show the updated code with clear signal comments.`,
      risks: `Add proper risk management with stop losses or trailing stops. Use the signal format: # STOP_LOSS at price or # TRAILING_STOP at price`,
      data: `How could we integrate additional data (volume, volatility, on-chain metrics) to enhance this strategy's signals?`,
      optimize: `Based on the strategy type and market, what parameter values would work best? Provide specific numbers with explanations.`
    }
    sendToAi(prompts[type], true)
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  const runBacktest = async () => {
    setBacktesting(true)
    setBtResult(null)
    setTrades([])
    setError('')
    setBacktestStatus('Fetching market data...')

    try {
      // Check if using custom code or built-in strategy
      const isCustomCode = code && code !== strategy.code
      setBacktestStatus('Running backtest simulation...')
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strategy: isCustomCode ? undefined : strategy.id,
          code: isCustomCode ? code : undefined,
          params,
          period,
          interval: timeframe,
          fee: fee / 100,
        }),
      })
      setBacktestStatus('Processing results...')
      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setTerminalOutput(prev => [...prev, `Error: ${data.error}`])
      } else if (data.stats) {
        const INITIAL_CAPITAL = 100000
        const equityPoints: { date: string; strategy: number; buyHold: number }[] = []
        const tradeList: TradeStats[] = []

        let strategyEquity = INITIAL_CAPITAL
        let position = 0
        let entryPrice = 0
        let finalBuyHold = INITIAL_CAPITAL
        const startPrice = data.bars?.[0]?.close || 1

        // Downsample bars for visualization (max 200 points)
        const bars = data.bars || []
        const maxChartPoints = 200
        const step = Math.max(1, Math.ceil(bars.length / maxChartPoints))

        bars.forEach((bar: any, i: number) => {
          if (i > 0 && bars[i-1].position === 1) {
            strategyEquity *= (bar.close / bars[i-1].close)
          }

          const buyHoldEquity = INITIAL_CAPITAL * (bar.close / startPrice)
          finalBuyHold = buyHoldEquity

          // Add all points for trades, but downsample for chart display
          if (i % step === 0 || i === bars.length - 1) {
            equityPoints.push({
              date: bar.date,
              strategy: strategyEquity,
              buyHold: buyHoldEquity,
            })
          }

          if (bar.position === 1 && position === 0) {
            entryPrice = bar.close
            tradeList.push({ date: bar.date, action: 'BUY', price: bar.close })
            position = 1
          } else if (bar.position === 0 && position === 1) {
            const retPct = ((bar.close - entryPrice) / entryPrice) * 100
            tradeList.push({ date: bar.date, action: 'SELL', price: bar.close, returnPct: retPct })
            position = 0
          }
        })

        const bhReturnPct = ((finalBuyHold / INITIAL_CAPITAL) - 1) * 100
        
        // Store full results for the analytics page
        const fullResult = {
          symbol,
          strategy: strategy.name,
          period,
          stats: {
            totalReturnPct: data.stats.totalReturnPct || 0,
            annualizedReturnPct: data.stats.annualizedReturnPct || 0,
            sharpeRatio: data.stats.sharpeRatio || 0,
            sortinoRatio: data.stats.sortinoRatio || 0,
            maxDrawdownPct: data.stats.maxDrawdownPct || 0,
            maxDrawdownDuration: data.stats.maxDrawdownDuration || 0,
            winRate: data.stats.winRate || 0,
            totalTrades: data.stats.totalTrades || 0,
            profitFactor: data.stats.profitFactor || 0,
            calmarRatio: data.stats.calmarRatio || 0,
            exposureTime: data.stats.exposureTime || 0,
            cagr: data.stats.cagr || data.stats.annualizedReturnPct || 0,
            avgTradeReturn: data.stats.avgTradeReturnPct || 0,
            bestTrade: data.stats.bestTradePct || 0,
            worstTrade: data.stats.worstTradePct || 0,
            avgWin: data.stats.avgWin || 0,
            avgLoss: data.stats.avgLoss || 0,
            avgTradeDuration: data.stats.avgTradeDurationDays || 0,
          },
          equityCurve: equityPoints,
          trades: tradeList,
          benchmarks: {
            spy: { return: bhReturnPct, sharpe: 0.8, maxDD: 20 },
            qqq: { return: bhReturnPct * 1.2, sharpe: 1.0, maxDD: 25 },
            btc: { return: symbol.includes('BTC') ? data.stats.totalReturnPct : bhReturnPct * 2, sharpe: 0.9, maxDD: 80 },
          },
        }
        
        localStorage.setItem('backtest_result', JSON.stringify(fullResult))
        setTerminalOutput(prev => [...prev, 
          `✓ Backtest complete:`,
          `  Return: ${data.stats.totalReturnPct?.toFixed(1)}% | Sharpe: ${data.stats.sharpeRatio?.toFixed(2)} | MaxDD: ${data.stats.maxDrawdownPct?.toFixed(1)}%`,
        ])
        
        // Set local results and show View Results button
        setBtResult({
          totalReturnPct: data.stats.totalReturnPct || 0,
          annualizedReturnPct: data.stats.annualizedReturnPct || 0,
          sharpeRatio: data.stats.sharpeRatio || 0,
          sortinoRatio: data.stats.sortinoRatio || 0,
          maxDrawdownPct: data.stats.maxDrawdownPct || 0,
          maxDrawdownDuration: data.stats.maxDrawdownDuration || 0,
          winRate: data.stats.winRate || 0,
          winRatePct: data.stats.winRate || 0,
          totalTrades: data.stats.totalTrades || 0,
          profitFactor: data.stats.profitFactor || 0,
          calmarRatio: data.stats.calmarRatio || 0,
          exposureTime: data.stats.exposureTime || 0,
          avgWin: data.stats.avgWin || 0,
          avgWinPct: data.stats.avgWin || 0,
          avgLoss: data.stats.avgLoss || 0,
          avgLossPct: data.stats.avgLoss || 0,
          feeImpactPct: data.stats.feeImpactPct || 0,
          tradesPerYear: data.stats.tradesPerYear || 0,
        })
        setTrades(tradeList.slice(-50))
        setChartData(equityPoints)
        setBuyHoldResult(bhReturnPct)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed'
      setError(msg)
      setTerminalOutput(prev => [...prev, `Error: ${msg}`])
    } finally {
      setBacktesting(false)
      setBacktestStatus('')
    }
  }

  const runQuickTest = async () => {
    setBacktesting(true)
    setBtResult(null)
    setTrades([])
    setError('')
    setBacktestStatus('Quick test...')

    try {
      const isCustomCode = code && code !== strategy.code
      
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strategy: isCustomCode ? undefined : strategy.id,
          code: isCustomCode ? code : undefined,
          params,
          simulate: true,
          simPeriod: '30d',
          simInterval: '1h',
          fee: fee / 100,
          includeTrades: true,
        }),
      })
      
      setBacktestStatus('Processing...')
      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setTerminalOutput(prev => [...prev, `Error: ${data.error}`])
        return
      }

      const INITIAL_CAPITAL = 100000
      const equityPoints: { date: string; strategy: number; buyHold: number }[] = []
      const tradeList: TradeStats[] = []

      let strategyEquity = INITIAL_CAPITAL
      let position = 0
      let entryPrice = 0
      const startPrice = data.bars?.[0]?.close || 1

      const bars = data.bars || []
      const step = Math.max(1, Math.ceil(bars.length / 100))

      bars.forEach((bar: any, i: number) => {
        if (i > 0 && bars[i-1].position === 1) {
          strategyEquity *= (bar.close / bars[i-1].close)
        }
        const buyHoldEquity = INITIAL_CAPITAL * (bar.close / startPrice)

        if (i % step === 0 || i === bars.length - 1) {
          equityPoints.push({ date: bar.date, strategy: strategyEquity, buyHold: buyHoldEquity })
        }

        if (bar.position === 1 && position === 0) {
          entryPrice = bar.close
          tradeList.push({ date: bar.date, action: 'BUY', price: bar.close })
          position = 1
        } else if (bar.position === 0 && position === 1) {
          const retPct = ((bar.close - entryPrice) / entryPrice) * 100
          tradeList.push({ date: bar.date, action: 'SELL', price: bar.close, returnPct: retPct })
          position = 0
        }
      })
      
      const feeImpact = data.stats.feeImpactPct || 0
      const tradesPerYear = data.stats.tradesPerYear || 0
      
      const fullResult = {
        symbol,
        strategy: strategy.name,
        period: '30d quick',
        mode: 'simulation',
        barsAnalyzed: data.barsAnalyzed,
        stats: {
          totalReturnPct: data.stats.netReturnPct || 0,
          grossReturnPct: data.stats.grossReturnPct || 0,
          feeImpactPct: feeImpact,
          annualizedReturnPct: data.stats.annualizedReturnPct || 0,
          sharpeRatio: data.stats.sharpeRatio || 0,
          sortinoRatio: data.stats.sortinoRatio || 0,
          maxDrawdownPct: data.stats.maxDrawdownPct || 0,
          maxDrawdownDuration: data.stats.maxDrawdownDuration || 0,
          winRate: data.stats.winRate || 0,
          totalTrades: data.stats.totalTrades || 0,
          profitFactor: data.stats.profitFactor || 0,
          calmarRatio: data.stats.calmarRatio || 0,
          exposureTime: data.stats.exposureTime || 0,
          tradesPerYear,
        },
        equityCurve: equityPoints,
        trades: tradeList,
      }

      setBtResult({
        totalReturnPct: data.stats.netReturnPct || 0,
        annualizedReturnPct: data.stats.annualizedReturnPct || 0,
        sharpeRatio: data.stats.sharpeRatio || 0,
        sortinoRatio: data.stats.sortinoRatio || 0,
        maxDrawdownPct: data.stats.maxDrawdownPct || 0,
        maxDrawdownDuration: data.stats.maxDrawdownDuration || 0,
        winRate: data.stats.winRate || 0,
        winRatePct: data.stats.winRate || 0,
        totalTrades: data.stats.totalTrades || 0,
        avgWin: data.stats.avgWin || 0,
        avgWinPct: data.stats.avgWin || 0,
        avgLoss: data.stats.avgLoss || 0,
        avgLossPct: data.stats.avgLoss || 0,
        profitFactor: data.stats.profitFactor || 0,
        feeImpactPct: feeImpact,
        tradesPerYear,
      })
      setTrades(tradeList)
      setChartData(equityPoints)
      setShowChart(true)
      setTerminalOutput(prev => [...prev, `✓ Quick test complete: ${(data.stats.netReturnPct || 0) >= 0 ? '+' : ''}${(data.stats.netReturnPct || 0).toFixed(1)}% (${(data.stats.totalTrades || 0)} trades)`])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed')
      setTerminalOutput(prev => [...prev, `Error: ${e}`])
    } finally {
      setBacktesting(false)
      setBacktestStatus('')
    }
  }

  const runSimulation = async () => {
    setBacktesting(true)
    setBtResult(null)
    setTrades([])
    setError('')
    setBacktestStatus('Running blind simulation...')

    try {
      const isCustomCode = code && code !== strategy.code
      setBacktestStatus('Analyzing market data...')

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strategy: isCustomCode ? undefined : strategy.id,
          code: isCustomCode ? code : undefined,
          params,
          simulate: true,
          simPeriod: '2y',
          simInterval: '1d',
          fee: fee / 100,
          includeTrades: true,
        }),
      })
      
      setBacktestStatus('Processing results...')
      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setTerminalOutput(prev => [...prev, `Error: ${data.error}`])
        return
      }

      const INITIAL_CAPITAL = 100000
      const equityPoints: { date: string; strategy: number; buyHold: number }[] = []
      const tradeList: TradeStats[] = []

      let strategyEquity = INITIAL_CAPITAL
      let position = 0
      let entryPrice = 0
      const startPrice = data.bars?.[0]?.close || 1

      // Downsample for visualization (max 200 points)
      const bars = data.bars || []
      const maxChartPoints = 200
      const step = Math.max(1, Math.ceil(bars.length / maxChartPoints))

      bars.forEach((bar: any, i: number) => {
        if (i > 0 && bars[i-1].position === 1) {
          strategyEquity *= (bar.close / bars[i-1].close)
        }
        const buyHoldEquity = INITIAL_CAPITAL * (bar.close / startPrice)

        // Downsample for chart display
        if (i % step === 0 || i === bars.length - 1) {
          equityPoints.push({ date: bar.date, strategy: strategyEquity, buyHold: buyHoldEquity })
        }

        if (bar.position === 1 && position === 0) {
          entryPrice = bar.close
          tradeList.push({ date: bar.date, action: 'BUY', price: bar.close })
          position = 1
        } else if (bar.position === 0 && position === 1) {
          const retPct = ((bar.close - entryPrice) / entryPrice) * 100
          tradeList.push({ date: bar.date, action: 'SELL', price: bar.close, returnPct: retPct })
          position = 0
        }
      })
      
      const feeImpact = data.stats.feeImpactPct || 0
      const tradesPerYear = data.stats.tradesPerYear || 0
      
      const fullResult = {
        symbol,
        strategy: strategy.name,
        period: '5y simulation',
        mode: 'simulation',
        barsAnalyzed: data.barsAnalyzed,
        stats: {
          totalReturnPct: data.stats.netReturnPct || 0,
          grossReturnPct: data.stats.grossReturnPct || 0,
          feeImpactPct: feeImpact,
          annualizedReturnPct: data.stats.annualizedReturnPct || 0,
          sharpeRatio: data.stats.sharpeRatio || 0,
          sortinoRatio: data.stats.sortinoRatio || 0,
          maxDrawdownPct: data.stats.maxDrawdownPct || 0,
          maxDrawdownDuration: data.stats.maxDrawdownDuration || 0,
          winRate: data.stats.winRate || 0,
          totalTrades: data.stats.totalTrades || 0,
          profitFactor: data.stats.profitFactor || 0,
          calmarRatio: data.stats.calmarRatio || 0,
          exposureTime: data.stats.exposureTime || 0,
          tradesPerYear,
        },
        equityCurve: equityPoints,
        trades: tradeList,
      }
      
      localStorage.setItem('backtest_result', JSON.stringify(fullResult))
      setTerminalOutput(prev => [...prev,
        `✓ Simulation complete (blind test):`,
        `  ${data.barsAnalyzed} bars analyzed over ${data.dateRange?.start} to ${data.dateRange?.end}`,
        `  Return: ${data.stats.netReturnPct?.toFixed(1)}% | Trades: ${data.stats.totalTrades} (${tradesPerYear.toFixed(0)}/yr)`,
        `  Win Rate: ${data.stats.winRate?.toFixed(0)}% | Fee Impact: -${feeImpact.toFixed(1)}%`,
      ])
      
      setBtResult({
        totalReturnPct: data.stats.netReturnPct || 0,
        annualizedReturnPct: data.stats.annualizedReturnPct || 0,
        sharpeRatio: data.stats.sharpeRatio || 0,
        sortinoRatio: data.stats.sortinoRatio || 0,
        maxDrawdownPct: data.stats.maxDrawdownPct || 0,
        maxDrawdownDuration: data.stats.maxDrawdownDuration || 0,
        winRate: data.stats.winRate || 0,
        winRatePct: data.stats.winRate || 0,
        totalTrades: data.stats.totalTrades || 0,
        profitFactor: data.stats.profitFactor || 0,
        calmarRatio: data.stats.calmarRatio || 0,
        exposureTime: data.stats.exposureTime || 0,
        avgWin: data.stats.avgWin || 0,
        avgWinPct: data.stats.avgWin || 0,
        avgLoss: data.stats.avgLoss || 0,
        avgLossPct: data.stats.avgLoss || 0,
        feeImpactPct: feeImpact,
        tradesPerYear,
      })
      setTrades(tradeList.slice(-100))
      setChartData(equityPoints.filter((_, i) => i % Math.ceil(equityPoints.length / 200) === 0))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Simulation failed'
      setError(msg)
      setTerminalOutput(prev => [...prev, `Error: ${msg}`])
    } finally {
      setBacktesting(false)
      setBacktestStatus('')
    }
  }

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => (
      <div key={node.id}>
        <div 
          onClick={() => {
            if (node.type === 'folder') {
              toggleFolder(node.id)
            } else {
              setSelectedFile(node.id)
              setActiveFileContent(node.content || '')
              if (node.id.endsWith('.py')) {
                const s = Object.values(STRATEGY_TEMPLATES).find(t => 
                  node.id.includes(t.id.replace(/_/g, ''))
                )
                if (s) {
                  setStrategy(s)
                  setCode(s.code)
                  setParams(s.params)
                }
              }
            }
          }}
          style={{ 
            padding: '0.25rem 0.5rem', 
            paddingLeft: `${0.5 + depth * 0.75}rem`,
            display: 'flex', 
            alignItems: 'center', 
            gap: 4, 
            cursor: 'pointer',
            background: selectedFile === node.id ? C.bg3 : 'transparent',
            borderRadius: 3,
            fontSize: '0.65rem',
          }}
        >
          {node.type === 'folder' ? (
            <>
              {expandedFolders.has(node.id) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {expandedFolders.has(node.id) ? <FolderOpen size={12} style={{ color: C.orange }} /> : <Folder size={12} style={{ color: C.orange }} />}
            </>
          ) : (
            <>
              <span style={{ width: 10 }} />
              <Code size={11} style={{ color: C.blue }} />
            </>
          )}
          <span style={{ color: C.text, fontSize: '0.65rem' }}>{node.name}</span>
        </div>
        {node.type === 'folder' && node.children && expandedFolders.has(node.id) && renderFileTree(node.children, depth + 1)}
      </div>
    ))
  }

  const renderDocs = () => {
    const currentStrategy = STRATEGY_TEMPLATES[strategy.id] || STRATEGY_TEMPLATES.momentum_crossover
    
    switch (docsSection) {
      case 'overview':
        return (
          <div style={{ padding: '1rem', overflow: 'auto' }}>
            <div style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>Quick Start</h2>
              <p style={{ fontSize: '0.75rem', color: C.muted, margin: 0 }}>Build and test your trading strategy in minutes</p>
            </div>
            
            {/* Current Context */}
            <div style={{ background: `${C.blue}15`, border: `1px solid ${C.blue}40`, borderRadius: 8, padding: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: C.faint, marginBottom: '0.35rem' }}>CURRENT SETUP</div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                <span><span style={{ color: C.muted }}>Strategy:</span> <span style={{ color: C.white }}>{currentStrategy.name}</span></span>
                <span><span style={{ color: C.muted }}>Asset:</span> <span style={{ color: C.white }}>{symbol}</span></span>
              </div>
            </div>
            
            {/* Quick Actions */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <button onClick={() => sendToAi('Give me a simple RSI strategy that buys when oversold and sells when overbought. Show me the code.', true)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg3, color: C.text, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={12} style={{ color: C.mint }} /> RSI Strategy
                </button>
                <button onClick={() => sendToAi('Show me a momentum strategy that uses EMA crossovers to catch trends early', true)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg3, color: C.text, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={12} style={{ color: C.blue }} /> Momentum Strategy
                </button>
                <button onClick={() => sendToAi('Add stop losses to my current strategy to limit downside risk', true)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg3, color: C.text, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Shield size={12} style={{ color: C.red }} /> Add Stop Loss
                </button>
                <button onClick={() => setDocsSection('strategies')} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg3, color: C.text, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Book size={12} style={{ color: C.orange }} /> Browse Templates
                </button>
              </div>
            </div>
            
            {/* AI Suggestions */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem' }}>AI Suggestions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <button onClick={() => sendToAi('Incorporate additional data sources (like on-chain metrics, sentiment, or alternative data) to improve my strategy signals', true)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${C.purple}40`, background: `${C.purple}10`, color: C.text, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={12} style={{ color: C.purple }} /> Incorporate More Data
                </button>
                <button onClick={() => sendToAi('Improve my current strategy by optimizing parameters, adding filters, or reducing drawdown', true)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${C.orange}40`, background: `${C.orange}10`, color: C.text, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={12} style={{ color: C.orange }} /> Improve Strategy
                </button>
                <button onClick={() => sendToAi('Analyze my current code and suggest specific improvements for better returns or lower risk', true)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${C.blue}40`, background: `${C.blue}10`, color: C.text, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Code size={12} style={{ color: C.blue }} /> Optimize My Code
                </button>
              </div>
            </div>
            
            {/* How It Works */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Workflow</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[
                  { step: '1', title: 'Write Code', desc: 'Create signal logic', color: C.blue },
                  { step: '2', title: 'Sandbox Test', desc: 'Run 5yr simulation', color: C.purple },
                  { step: '3', title: 'Check Metrics', desc: 'Return, Sharpe, Win Rate', color: C.mint },
                  { step: '4', title: 'Deploy', desc: 'Go live with capital', color: C.orange },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${s.color}20`, color: s.color, fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.step}</div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.white }}>{s.title}</div>
                      <div style={{ fontSize: '0.65rem', color: C.muted }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Signal Format */}
            <div style={{ background: C.bg3, borderRadius: 8, padding: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.mint, marginBottom: '0.5rem' }}>Signal Format</div>
              <pre style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: C.text, margin: 0, lineHeight: 1.5 }}>
{`signal: buy, {price}   # Entry
signal: sell, {price}  # Exit`}
              </pre>
            </div>
          </div>
        )

      case 'api':
        return (
          <div style={{ padding: '1rem', overflow: 'auto' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>Signal API</h2>
            <p style={{ fontSize: '0.75rem', color: C.muted, marginBottom: '1rem' }}>Available variables and functions</p>
            
            {/* Variables */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Variables</div>
              <div style={{ background: C.bg3, borderRadius: 8, padding: '0.75rem', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                <div style={{ color: C.mint }}>price</div>
                <div style={{ color: C.muted }}>current price (float)</div>
                <div style={{ color: C.mint, marginTop: '0.5rem' }}>position</div>
                <div style={{ color: C.muted }}>0 = flat, 1 = in position</div>
                <div style={{ color: C.mint, marginTop: '0.5rem' }}>RSI, EMA, MACD, ATR</div>
                <div style={{ color: C.muted }}>pre-calculated indicators</div>
              </div>
            </div>
            
            {/* Functions */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Helper Functions</div>
              <div style={{ background: C.bg3, borderRadius: 8, padding: '0.75rem', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                <div style={{ color: C.blue }}>calculate_rsi(prices, period=14)</div>
                <div style={{ color: C.blue, marginTop: '0.5rem' }}>calculate_ema(prices, period=20)</div>
                <div style={{ color: C.blue, marginTop: '0.5rem' }}>calculate_macd(prices)</div>
              </div>
            </div>
            
            {/* Examples */}
            <div>
              <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Examples</div>
              <div style={{ background: C.bg3, borderRadius: 8, padding: '0.75rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                <div style={{ color: C.faint }}># RSI oversold/overbought</div>
                <div style={{ color: C.mint }}>if RSI &lt; 30 and position == 0:</div>
                <div style={{ color: C.mint }}>{"    signal: buy, {price}"}</div>
                <div style={{ color: C.muted }}>{" # RSI > 70 sell here"}</div>
                <div style={{ marginTop: '0.75rem', color: C.faint }}># EMA crossover</div>
                <div style={{ color: C.mint }}>if EMA_8 &gt; EMA_21 and position == 0:</div>
                <div style={{ color: C.mint }}>{"    signal: buy, {price}"}</div>
              </div>
            </div>
          </div>
        )
        
      case 'strategies':
        return (
          <div style={{ padding: '1rem', overflow: 'auto' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>Templates</h2>
            <p style={{ fontSize: '0.75rem', color: C.muted, marginBottom: '1rem' }}>Click to use template</p>
            
            {Object.values(STRATEGY_TEMPLATES).map(s => (
              <div key={s.id} style={{ marginBottom: '0.75rem', padding: '0.75rem', borderRadius: 8, border: `1px solid ${strategy.id === s.id ? C.mint : C.border}`, background: strategy.id === s.id ? C.mintDark : C.bg3, cursor: 'pointer' }}
                onClick={() => handleTemplateSelect(s.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '1rem' }}>{s.icon}</span>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.white }}>{s.name}</div>
                  {strategy.id === s.id && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: C.mint }}>Active</span>}
                </div>
                <p style={{ fontSize: '0.7rem', color: C.muted, margin: 0, lineHeight: 1.4 }}>{s.description}</p>
              </div>
            ))}
          </div>
        )
        
      case 'indicators':
        return (
          <div style={{ padding: '1rem', overflow: 'auto' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>Indicators</h2>
            <p style={{ fontSize: '0.75rem', color: C.muted, marginBottom: '1rem' }}>Available in your code</p>
            
            {INDICATORS.map(ind => (
              <div key={ind.id} style={{ marginBottom: '0.75rem', padding: '0.75rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: C.blue, background: `${C.blue}15`, padding: '0.15rem 0.4rem', borderRadius: 3 }}>{ind.abbrev}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: C.white }}>{ind.name}</span>
                </div>
                <div style={{ fontSize: '0.65rem', color: C.mint, fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>{ind.formula}</div>
                <div style={{ fontSize: '0.7rem', color: C.muted }}>{ind.description}</div>
              </div>
            ))}
          </div>
        )

      case 'risk':
        return (
          <div style={{ padding: '1rem', overflow: 'auto' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: C.white, marginBottom: '1rem' }}>Risk Management</h2>
            
            {/* Critical Info */}
            <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.red, marginBottom: '0.35rem' }}>Fee Impact Warning</div>
              <div style={{ fontSize: '0.7rem', color: C.text, lineHeight: 1.5 }}>
                Strategies need <span style={{ color: C.mint, fontWeight: 600 }}>&gt;55% win rate</span> or <span style={{ color: C.mint, fontWeight: 600 }}>&gt;1.2% avg win</span> to be profitable after fees.
              </div>
            </div>
            
            {/* Target Metrics */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Target Metrics</div>
              {[
                { name: 'Win Rate', target: '&gt;55%', color: C.mint },
                { name: 'Avg Win/Loss', target: '&gt;1.2x', color: C.blue },
                { name: 'Max DD', target: '&lt;20%', color: C.red },
                { name: 'Sharpe', target: '&gt;1.0', color: C.orange },
              ].map(item => (
                <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderRadius: 4, background: C.bg3, marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.75rem', color: C.text }}>{item.name}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: item.color }} dangerouslySetInnerHTML={{ __html: item.target }} />
                </div>
              ))}
            </div>
            
            {/* Tips */}
            <div>
              <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Tips</div>
              <div style={{ fontSize: '0.7rem', color: C.muted, lineHeight: 1.5 }}>
                <div style={{ marginBottom: '0.5rem' }}>• Use stop losses to limit single-trade losses</div>
                <div style={{ marginBottom: '0.5rem' }}>• Lower timeframe = more trades = higher fees</div>
                <div>• Test with 5yr simulation before deploying</div>
              </div>
            </div>
          </div>
        )
        
      case 'data':
        return (
          <div style={{ padding: '1rem', overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>Data Sources</h2>
              <p style={{ fontSize: '0.7rem', color: C.muted, margin: 0 }}>APIs for fetching market data. Click "Integrate" to add via AI.</p>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button onClick={() => setDataCategory('all')} style={{ padding: '0.3rem 0.6rem', borderRadius: 4, border: `1px solid ${dataCategory === 'all' ? C.blue : C.border}`, background: dataCategory === 'all' ? `${C.blue}20` : 'transparent', color: dataCategory === 'all' ? C.blue : C.muted, fontSize: '0.65rem', cursor: 'pointer' }}>All Crypto</button>
              <button onClick={() => setDataCategory('crypto')} style={{ padding: '0.3rem 0.6rem', borderRadius: 4, border: `1px solid ${dataCategory === 'crypto' ? C.blue : C.border}`, background: dataCategory === 'crypto' ? `${C.blue}20` : 'transparent', color: dataCategory === 'crypto' ? C.blue : C.muted, fontSize: '0.65rem', cursor: 'pointer', textTransform: 'capitalize' }}>Crypto</button>
            </div>
            
            <input 
              type="text" 
              placeholder="Search APIs..." 
              value={dataSearch}
              onChange={e => setDataSearch(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg3, color: C.text, fontSize: '0.75rem', marginBottom: '1rem', width: '100%' }}
            />
            
            <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem', alignContent: 'start' }}>
              {filteredAPIs.map(api => (
                <div key={api.id} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.6rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.white }}>{api.name}</span>
                    <span style={{ fontSize: '0.5rem', padding: '0.1rem 0.3rem', borderRadius: 3, background: api.tier === 'free' ? `${C.mint}20` : `${C.orange}20`, color: api.tier === 'free' ? C.mint : C.orange }}>{api.tier}</span>
                  </div>
                  <div style={{ fontSize: '0.6rem', color: C.muted, marginBottom: '0.35rem', flex: 1 }}>{api.description}</div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                    {api.dataTypes.slice(0, 3).map(dt => (
                      <span key={dt} style={{ fontSize: '0.5rem', padding: '0.1rem 0.25rem', borderRadius: 2, background: C.bg3, color: C.faint }}>{dt}</span>
                    ))}
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedAPI(api)
                      askAIForAPI(api)
                    }}
                    style={{ width: '100%', padding: '0.3rem', borderRadius: 4, border: 'none', background: C.purple, color: C.white, fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Integrate with AI
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
    }
  }

  const excessReturn = btResult && buyHoldResult ? btResult.totalReturnPct - buyHoldResult : null

  if (view === 'create') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
          <button onClick={() => setView('editor')} style={{ padding: '0.3rem 0.5rem', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: '0.7rem', cursor: 'pointer' }}>
            ← Back
          </button>
          <h1 style={{ fontSize: '1rem', fontWeight: 600, color: C.white, margin: 0 }}>Create New Agent</h1>
        </header>
        
        <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.55rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Agent Name</div>
              <input 
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                placeholder="Enter agent name..."
                style={{ width: '100%', padding: '0.6rem', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: '0.85rem' }}
              />
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.55rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Choose Template</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {Object.values(STRATEGY_TEMPLATES).map(s => (
                  <button 
                    key={s.id}
                    onClick={() => handleTemplateSelect(s.id)}
                    style={{ padding: '0.75rem', borderRadius: 6, border: `1px solid ${strategy.id === s.id ? C.mint : C.border}`, background: strategy.id === s.id ? C.mintDark : C.bg2, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{s.icon}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.white, marginBottom: '0.15rem' }}>{s.name}</div>
                    <div style={{ fontSize: '0.55rem', color: C.muted }}>{s.description}</div>
                  </button>
                ))}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.55rem', color: C.faint, marginBottom: '0.25rem' }}>Asset</div>
                <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: '0.75rem' }}>
                  <optgroup label="Crypto">
                    {CRYPTOS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </optgroup>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.55rem', color: C.faint, marginBottom: '0.25rem' }}>Timeframe</div>
                <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: '0.75rem' }}>
                  {TIMEFRAMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.55rem', color: C.faint, marginBottom: '0.25rem' }}>Period</div>
                <select value={period} onChange={e => setPeriod(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: '0.75rem' }}>
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button onClick={() => setView('editor')} style={{ padding: '0.5rem 1rem', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: '0.75rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveAgent} style={{ padding: '0.5rem 1rem', borderRadius: 4, border: 'none', background: C.mint, color: C.bg, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Save size={14} />Save Agent
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'docs') {
    return (
      <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.text }}>
        <aside style={{ width: 180, borderRight: `1px solid ${C.border}`, background: C.bg2, padding: '0.5rem' }}>
          <button onClick={() => setView('editor')} style={{ width: '100%', padding: '0.4rem', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: '0.6rem', cursor: 'pointer', marginBottom: '0.5rem', textAlign: 'left' }}>
            ← Back to Editor
          </button>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.white, marginBottom: '0.5rem' }}>Documentation</div>
          
          {[
            { id: 'data', label: 'Data Sources', icon: '◈' },
            { id: 'indicators', label: 'Indicators', icon: '∿' },
            { id: 'strategies', label: 'Strategies', icon: '◎' },
            { id: 'metrics', label: 'Metrics', icon: '⊗' },
            { id: 'pitfalls', label: 'Pitfalls', icon: '⚠' },
          ].map(s => (
            <button 
              key={s.id}
              onClick={() => setDocsSection(s.id as any)}
              style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 4, border: 'none', background: docsSection === s.id ? C.bg3 : 'transparent', color: docsSection === s.id ? C.white : C.muted, fontSize: '0.6rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span>{s.icon}</span>{s.label}
            </button>
          ))}
        </aside>
        
        <main style={{ flex: 1, overflow: 'auto' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
            <div>
              <h1 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: 0 }}>ASE Quant Library</h1>
              <div style={{ fontSize: '0.55rem', color: C.muted }}>Reference documentation for building strategies</div>
            </div>
          </header>
          
          <div>{renderDocs()}</div>
        </main>
      </div>
    )
  }

  if (view === 'data') {
    return (
      <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.text }}>
        <aside style={{ width: 180, borderRight: `1px solid ${C.border}`, background: C.bg2, padding: '0.5rem' }}>
          <button onClick={() => setView('editor')} style={{ width: '100%', padding: '0.4rem', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: '0.6rem', cursor: 'pointer', marginBottom: '0.5rem', textAlign: 'left' }}>
            ← Back to Editor
          </button>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.white, marginBottom: '0.5rem' }}>Data APIs</div>
          
          {['crypto'].map(cat => (
            <button 
              key={cat}
              onClick={() => setDataCategory(cat)}
              style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 4, border: 'none', background: dataCategory === cat ? C.bg3 : 'transparent', color: dataCategory === cat ? C.white : C.muted, fontSize: '0.6rem', cursor: 'pointer', textAlign: 'left', textTransform: 'capitalize' }}
            >
              {cat}
            </button>
          ))}
        </aside>
        
        <main style={{ flex: 1, overflow: 'auto' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
            <div>
              <h1 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: 0 }}>Data Sources</h1>
              <div style={{ fontSize: '0.55rem', color: C.muted }}>APIs available for fetching market data</div>
            </div>
            <input 
              type="text" 
              placeholder="Search APIs..." 
              value={dataSearch}
              onChange={e => setDataSearch(e.target.value)}
              style={{ padding: '0.3rem 0.6rem', borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg3, color: C.text, fontSize: '0.75rem', width: 180 }}
            />
          </header>
          
          <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
            {filteredAPIs.map(api => (
              <div key={api.id} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: C.white }}>{api.name}</span>
                  <span style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem', borderRadius: 4, background: api.tier === 'free' ? `${C.mint}20` : `${C.orange}20`, color: api.tier === 'free' ? C.mint : C.orange }}>{api.tier}</span>
                </div>
                <div style={{ fontSize: '0.65rem', color: C.muted, marginBottom: '0.5rem' }}>{api.description}</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {api.dataTypes.map(dt => (
                    <span key={dt} style={{ fontSize: '0.55rem', padding: '0.1rem 0.3rem', borderRadius: 3, background: C.bg3, color: C.faint }}>{dt}</span>
                  ))}
                </div>
                <div style={{ fontSize: '0.55rem', color: C.faint, marginBottom: '0.5rem' }}>Rate limit: {api.rateLimit}</div>
                <button 
                  onClick={() => {
                    setSelectedAPI(api)
                    askAIForAPI(api)
                  }}
                  style={{ width: '100%', padding: '0.35rem', borderRadius: 4, border: 'none', background: C.purple, color: C.white, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Integrate with AI
                </button>
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: C.bg, color: C.text, overflow: 'hidden' }}>
      {/* Strategy Studio Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, gap: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', background: 'linear-gradient(135deg, #16C78420, #4F8CFF20)', borderRadius: 6 }}>
            <Rocket size={16} style={{ color: C.mint }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.white, letterSpacing: '-0.02em' }}>Strategy Studio</span>
          </div>

          <div style={{ height: 16, width: 1, background: C.border }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: C.white }}>{strategy.name}</span>
            <span style={{ fontSize: '0.75rem', color: C.faint }}>•</span>
            <span style={{ fontSize: '0.8rem', color: C.muted }}>{symbol}</span>
            <span style={{ fontSize: '0.75rem', color: C.faint }}>•</span>
            <select value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '0.15rem 0.3rem', borderRadius: 3, border: 'none', background: C.bg3, color: C.text, fontSize: '0.7rem' }}>
              <option value="30d">30D</option>
              <option value="90d">90D</option>
              <option value="1y">1Y</option>
              <option value="2y">2Y</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {btResult && (
            <button 
              onClick={() => window.location.href = '/dashboard/build/backtest'}
              style={{ padding: '0.4rem 1rem', borderRadius: 6, border: `1px solid ${C.blue}`, background: `${C.blue}20`, color: C.blue, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <BarChart3 size={14} />Results
            </button>
          )}
          
          {/* Secondary - Paper Trade */}
          <button onClick={runQuickTest} disabled={backtesting} style={{ padding: '0.45rem 0.85rem', borderRadius: 6, border: `1px solid ${C.blue}50`, background: 'transparent', color: C.blue, fontSize: '0.8rem', fontWeight: 600, cursor: backtesting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
            {backtesting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}{backtesting ? backtestStatus || '...' : 'Paper Trade'}
          </button>
          
          {/* Primary - Sandbox Test */}
          <button onClick={runSimulation} disabled={backtesting} style={{ padding: '0.45rem 1rem', borderRadius: 6, border: 'none', background: backtesting ? C.border : C.mint, color: C.bg, fontSize: '0.8rem', fontWeight: 600, cursor: backtesting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(22,199,132,0.3)' }}>
            {backtesting ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}{backtesting ? backtestStatus || 'Running...' : 'Sandbox Test'}
          </button>
          
          {/* Ghost */}
          <button onClick={() => setView('docs')} style={{ padding: '0.45rem 0.75rem', borderRadius: 6, border: 'none', background: 'transparent', color: C.muted, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Book size={14} />Docs
          </button>
          
          {/* Accent */}
          <button onClick={() => setView('create' as typeof view)} style={{ padding: '0.45rem 0.85rem', borderRadius: 6, border: 'none', background: C.purple, color: C.white, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(139,92,246,0.3)' }}>
            <Plus size={14} />Publish
          </button>
          
          {/* AI Panel Toggle */}
          <button onClick={() => setRightPanel(rightPanel === 'ai' ? 'docs' : 'ai')} style={{ padding: '0.45rem', borderRadius: 6, border: `1px solid ${rightPanel === 'ai' ? C.orange : C.border}`, background: rightPanel === 'ai' ? `${C.orange}20` : 'transparent', color: rightPanel === 'ai' ? C.orange : C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Sparkle size={16} />
          </button>
        </div>
      </div>

      {btResult && (
        <div style={{ display: 'flex', gap: '1.5rem', padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}`, background: 'linear-gradient(180deg, #0B1728 0%, #06111F 100%)', overflowX: 'auto', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center', minWidth: 70 }}>
              <div style={{ fontSize: '0.5rem', color: C.faint, textTransform: 'uppercase', marginBottom: 2, letterSpacing: '0.05em' }}>Return</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: btResult.totalReturnPct >= 0 ? C.mint : C.red, textShadow: btResult.totalReturnPct >= 0 ? '0 0 10px rgba(22,199,132,0.3)' : 'none' }}>
                {btResult.totalReturnPct >= 0 ? '+' : ''}{btResult.totalReturnPct.toFixed(1)}%
              </div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontSize: '0.5rem', color: C.faint, textTransform: 'uppercase', marginBottom: 2, letterSpacing: '0.05em' }}>Sharpe</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: btResult.sharpeRatio >= 1 ? C.mint : btResult.sharpeRatio >= 0 ? C.orange : C.red }}>{btResult.sharpeRatio.toFixed(2)}</div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontSize: '0.5rem', color: C.faint, textTransform: 'uppercase', marginBottom: 2, letterSpacing: '0.05em' }}>Max DD</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: C.red }}>-{btResult.maxDrawdownPct.toFixed(1)}%</div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontSize: '0.5rem', color: C.faint, textTransform: 'uppercase', marginBottom: 2, letterSpacing: '0.05em' }}>Win Rate</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: btResult.winRate >= 55 ? C.mint : btResult.winRate >= 50 ? C.orange : C.red }}>{btResult.winRate.toFixed(0)}%</div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ textAlign: 'center', minWidth: 50 }}>
              <div style={{ fontSize: '0.5rem', color: C.faint, textTransform: 'uppercase', marginBottom: 2, letterSpacing: '0.05em' }}>Trades</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: C.white }}>{btResult.totalTrades}</div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontSize: '0.5rem', color: C.faint, textTransform: 'uppercase', marginBottom: 2, letterSpacing: '0.05em' }}>CAGR</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: btResult.annualizedReturnPct >= 0 ? C.mint : C.red }}>{btResult.annualizedReturnPct >= 0 ? '+' : ''}{btResult.annualizedReturnPct.toFixed(1)}%</div>
            </div>
          </div>
          <button onClick={() => setShowChart(!showChart)} style={{ marginLeft: 'auto', padding: '0.35rem 0.75rem', borderRadius: 6, border: `1px solid ${showChart ? C.blue : C.border}`, background: showChart ? `${C.blue}20` : 'transparent', color: C.text, fontSize: '0.75rem', cursor: 'pointer' }}>
            {showChart ? 'Hide' : 'Chart'}
          </button>
          {btResult.totalTrades > 0 && (
            <button 
              onClick={() => window.location.href = '/dashboard/build/backtest'}
              style={{ padding: '0.35rem 0.75rem', borderRadius: 6, border: `1px solid ${C.mint}`, background: `${C.mint}15`, color: C.mint, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Full Report
            </button>
          )}
        </div>
      )}

      {error && <div style={{ padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,84,104,0.1)', color: C.red, fontSize: '0.85rem' }}>{error}</div>}

      {showChart && chartData.length > 0 && (
        <div style={{ height: 200, padding: '0.5rem 1rem', borderBottom: `1px solid ${C.border}`, background: C.bg3 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(v) => v.substring(5)} interval={Math.floor(chartData.length / 8)} />
              <YAxis tick={{ fontSize: 11, fill: C.faint }} domain={['auto', 'auto']} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} width={55} />
              <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.85rem' }} />
              <Area type="monotone" dataKey="strategy" stroke={C.mint} fill={C.mint} fillOpacity={0.15} strokeWidth={2} name="Strategy" />
              <Line type="monotone" dataKey="buyHold" stroke={C.faint} strokeDasharray="5 5" strokeWidth={2} name="Buy & Hold" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {(view === 'editor' || view === 'docs' || view === 'data' || view === 'create') && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Panel - Builder Modules */}
          {!sidebarCollapsed && (
            <div style={{ width: 260, borderRight: `1px solid ${C.border}`, background: 'linear-gradient(180deg, #0B1728 0%, #06111F 100%)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, padding: '0.6rem 0.75rem', background: C.bg2 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.white, letterSpacing: '-0.02em' }}>Builder Modules</span>
                <button onClick={() => setSidebarCollapsed(true)} style={{ padding: '0.25rem', border: 'none', borderRadius: 4, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
                  <PanelLeft size={14} />
                </button>
              </div>
              
              <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
                {[
                  { id: 'overview', label: 'Quick Start', icon: Book, color: C.mint, desc: 'Get started building' },
                  { id: 'api', label: 'Signal API', icon: Code, color: C.blue, desc: 'Signal format & variables' },
                  { id: 'strategies', label: 'Templates', icon: TrendingUp, color: C.orange, desc: 'Strategy patterns' },
                  { id: 'indicators', label: 'Indicators', icon: Activity, color: C.purple, desc: 'RSI, MACD, BB...' },
                  { id: 'risk', label: 'Risk Controls', icon: Shield, color: C.red, desc: 'Stops, position sizing' },
                  { id: 'data', label: 'Market Data', icon: Database, color: C.blue, desc: 'Data sources' },
                ].map(doc => (
                  <button 
                    key={doc.id}
                    onClick={() => {
                      setRightPanel('ai')
                      if (doc.id === 'data') {
                        setView('data')
                      } else if (doc.id === 'overview') {
                        sendToAi('Show me how to get started with building a strategy. What are the key concepts I should know?', true)
                      } else if (doc.id === 'api') {
                        sendToAi('Explain the signal format and API for writing trading strategies. Show me examples of how to emit buy/sell signals.', true)
                      } else if (doc.id === 'strategies') {
                        sendToAi('Show me the different strategy patterns available (momentum, mean reversion, breakout, etc.) and when to use each one.', true)
                      } else if (doc.id === 'indicators') {
                        sendToAi('Explain the technical indicators available (RSI, MACD, Bollinger Bands, etc.) and how to use them in strategies.', true)
                      } else if (doc.id === 'risk') {
                        sendToAi('Explain risk management best practices - position sizing, stop losses, max drawdown limits, and fee impact calculations.', true)
                      } else {
                        setDocsSection(doc.id as any)
                        setView('editor')
                      }
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '0.6rem 0.75rem', 
                      border: 'none',
                      borderRadius: 6,
                      background: docsSection === doc.id ? 'linear-gradient(135deg, rgba(79,140,255,0.15), rgba(139,92,246,0.1))' : 'transparent',
                      color: docsSection === doc.id ? C.white : C.muted, 
                      fontSize: '0.75rem', 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 10,
                      textAlign: 'left',
                      marginBottom: '0.25rem',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ 
                      width: 28, 
                      height: 28, 
                      borderRadius: 6, 
                      background: `${doc.color}15`, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center' 
                    }}>
                      <doc.icon size={14} style={{ color: doc.color }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: docsSection === doc.id ? C.white : C.text }}>{doc.label}</div>
                      <div style={{ fontSize: '0.6rem', color: C.faint }}>{doc.desc}</div>
                    </div>
                    <CheckCircle size={12} style={{ color: C.mint, opacity: docsSection === doc.id ? 1 : 0 }} />
                  </button>
                ))}
              </div>
              
              {/* Current Context - Premium Card */}
              <div style={{ padding: '0.75rem', borderTop: `1px solid ${C.border}`, background: C.bg2 }}>
                <div style={{ fontSize: '0.6rem', color: C.faint, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Active Strategy</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: C.bg, borderRadius: 6, border: `1px solid ${C.mint}40` }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.mint, boxShadow: '0 0 8px rgba(22,199,132,0.5)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.white }}>{strategy.name}</div>
                    <div style={{ fontSize: '0.6rem', color: C.muted }}>{symbol} • {timeframe}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Center - Code Studio */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
            {/* Editor Header with Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.75rem', borderBottom: `1px solid ${C.border}`, background: 'linear-gradient(180deg, #111D2E 0%, #0B1728 100%)', gap: '0.5rem' }}>
              {sidebarCollapsed && (
                <button onClick={() => setSidebarCollapsed(false)} style={{ padding: '0.35rem', border: 'none', borderRadius: 4, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
                  <PanelLeft size={14} />
                </button>
              )}
              
              {/* File Tabs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {files[0]?.children?.slice(0, 3).map((file: FileNode) => (
                  <button 
                    key={file.id}
                    onClick={() => { setSelectedFile(file.name); setActiveFileContent(file.content || '') }}
                    style={{ 
                      padding: '0.35rem 0.75rem', 
                      borderRadius: 4, 
                      border: 'none', 
                      background: selectedFile === file.name ? C.bg : 'transparent', 
                      color: selectedFile === file.name ? C.white : C.muted, 
                      fontSize: '0.75rem', 
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Code size={10} style={{ color: selectedFile === file.name ? C.blue : C.faint }} />
                    {file.name}
                  </button>
                ))}
              </div>
              
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Save Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: C.mint }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.mint, boxShadow: '0 0 6px rgba(22,199,132,0.5)' }} />
                  Saved
                </div>
                <button onClick={copyCode} style={{ fontSize: '0.75rem', color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={() => setCode(strategy.code)} style={{ fontSize: '0.75rem', color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={12} />Reset
                </button>
              </div>
            </div>
            
            {/* Editor with Line Numbers */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Line Numbers */}
              <div style={{ 
                padding: '1rem 0.75rem', 
                background: C.bg2, 
                color: C.faint, 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.85rem', 
                lineHeight: 1.7,
                textAlign: 'right',
                userSelect: 'none',
                borderRight: `1px solid ${C.border}`,
                minWidth: 50,
              }}>
                {code.split('\n').map((_, i) => (
                  <div key={i} style={{ color: C.faint, opacity: 0.5 }}>{i + 1}</div>
                ))}
              </div>
              
              {/* Code Area */}
              <textarea 
                value={code} 
                onChange={e => setCode(e.target.value)} 
                spellCheck={false} 
                style={{ 
                  flex: 1, 
                  padding: '1rem', 
                  background: C.bg, 
                  color: C.text, 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '0.9rem', 
                  lineHeight: 1.7, 
                  border: 'none', 
                  outline: 'none', 
                  resize: 'none', 
                  whiteSpace: 'pre',
                  overflow: 'auto',
                }} 
              />
            </div>
          </div>

          {/* Right Panel - AI Assistant */}
          {rightPanel === 'ai' && (
            <div style={{ width: 340, borderLeft: `1px solid ${C.border}`, background: C.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkle size={16} style={{ color: C.orange }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white }}>AI Assistant</span>
                </div>
                <button onClick={() => { setAiMessages([]); setCode(strategy.code) }} style={{ fontSize: '0.7rem', color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCcw size={12} />Reset
                </button>
              </div>
              
              {/* Chat Messages */}
              <div style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {aiMessages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: C.faint }}>
                    <div style={{ width: 48, height: 48, margin: '0 auto 1rem', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #4F8CFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>
                      <Sparkle size={24} style={{ color: C.white }} />
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, marginBottom: '0.5rem' }}>AI Quant Copilot</div>
                    <div style={{ fontSize: '0.75rem', lineHeight: 1.6, color: C.muted }}>
                      I'll help you build smarter strategies.<br/>
                      Ask me to explain, improve, or optimize.
                    </div>
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <div key={i} style={{ 
                    padding: '0.75rem', 
                    borderRadius: 8, 
                    background: msg.role === 'user' ? C.blue : C.bg3, 
                    fontSize: '0.85rem', 
                    maxWidth: '95%', 
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {msg.role === 'user' ? msg.content : (
                      <div style={{ lineHeight: 1.6 }}>
                        {msg.content.split(/```python\n[\s\S]*?```|```\n[\s\S]*?```/g).map((part, idx) => {
                          const codeMatch = msg.content.match(/```python\n([\s\S]*?)```/g)
                          if (codeMatch && codeMatch[idx - 1]) {
                            const code = codeMatch[idx - 1].replace(/```python\n?/, '').replace(/```$/, '')
                            return (
                              <div key={idx}>
                                <pre style={{ 
                                  background: C.bg, 
                                  padding: '0.75rem', 
                                  borderRadius: 6, 
                                  marginTop: '0.75rem',
                                  marginBottom: '0.75rem',
                                  overflow: 'auto',
                                  fontSize: '0.75rem',
                                  border: `1px solid ${C.border}`,
                                  position: 'relative'
                                }}>
                                  <button 
                                    onClick={() => {
                                      setCode(code)
                                      setAiMessages(prev => [...prev, { role: 'user' as const, content: 'Applied code changes!' }])
                                    }}
                                    style={{ 
                                      position: 'absolute', 
                                      top: 8, 
                                      right: 8, 
                                      padding: '0.25rem 0.5rem', 
                                      fontSize: '0.65rem',
                                      border: `1px solid ${C.mint}`,
                                      background: `${C.mint}20`,
                                      color: C.mint,
                                      borderRadius: 4,
                                      cursor: 'pointer'
                                    }}
                                  >Apply</button>
                                  <code style={{ color: C.mint }}>{code}</code>
                                </pre>
                                <span>{part}</span>
                              </div>
                            )
                          }
                          return <span key={idx}>{part}</span>
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {aiLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem', color: C.faint, fontSize: '0.85rem' }}>
                    <Sparkles size={16} style={{ animation: 'pulse 1s infinite' }} />
                    <span>Thinking...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              
              {/* Input */}
              <div style={{ padding: '0.75rem', borderTop: `1px solid ${C.border}`, background: 'linear-gradient(0deg, #0B1728 0%, transparent 100%)' }}>
                {/* Smart Default Message */}
                {aiMessages.length === 0 && (
                  <div style={{ marginBottom: '0.75rem', padding: '0.6rem', background: 'linear-gradient(135deg, rgba(245,185,66,0.1), rgba(139,92,246,0.1))', borderRadius: 6, border: `1px solid ${C.orange}30` }}>
                    <div style={{ fontSize: '0.65rem', color: C.orange, fontWeight: 600, marginBottom: '0.25rem' }}>💡 Your agent has no risk controls</div>
                    <button onClick={() => sendToAi('Add a 5% stop-loss mechanism to protect against losses', true)} style={{ width: '100%', padding: '0.35rem', borderRadius: 4, border: 'none', background: C.orange, color: C.bg, fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>
                      Add Stop-Loss with AI
                    </button>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: 8, marginBottom: '0.6rem' }}>
                  <input 
                    value={aiInput} 
                    onChange={e => setAiInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendToAi())} 
                    placeholder="Ask AI to improve your strategy..." 
                    style={{ 
                      flex: 1, 
                      padding: '0.6rem 0.75rem', 
                      borderRadius: 6, 
                      border: `1px solid ${C.border}`, 
                      background: C.bg, 
                      color: C.text, 
                      fontSize: '0.8rem' 
                    }} 
                  />
                  <button 
                    onClick={() => sendToAi()} 
                    disabled={aiLoading || !aiInput.trim()} 
                    style={{ 
                      padding: '0.6rem 0.9rem', 
                      borderRadius: 6, 
                      border: 'none', 
                      background: aiLoading ? C.border : C.orange, 
                      color: C.bg, 
                      cursor: aiLoading ? 'not-allowed' : 'pointer', 
                      fontWeight: 600,
                      boxShadow: aiLoading ? 'none' : '0 2px 8px rgba(245,185,66,0.3)'
                    }}
                  >
                    <Sparkle size={14} />
                  </button>
                </div>
                
                {/* Quick Action Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
                  <button onClick={() => sendToAi('Improve returns by adding take-profit at 10% to lock in gains', true)} style={{ padding: '0.4rem 0.5rem', borderRadius: 4, border: `1px solid ${C.mint}30`, background: `${C.mint}10`, color: C.mint, fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer' }}>↑ Improve Returns</button>
                  <button onClick={() => sendToAi('Reduce drawdown by adding ATR-based trailing stops', true)} style={{ padding: '0.4rem 0.5rem', borderRadius: 4, border: `1px solid ${C.red}30`, background: `${C.red}10`, color: C.red, fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer' }}>↓ Reduce DD</button>
                  <button onClick={() => sendToAi('Explain how this strategy works and what the key parameters do', true)} style={{ padding: '0.4rem 0.5rem', borderRadius: 4, border: `1px solid ${C.blue}30`, background: `${C.blue}10`, color: C.blue, fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer' }}>📖 Explain</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
