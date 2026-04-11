'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  ShieldCheck, 
  Cpu, 
  ArrowRight, 
  BarChart3, 
  Zap, 
  Lock, 
  Users,
  LineChart,
  Calculator
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  ResponsiveContainer, 
  YAxis, 
  XAxis, 
  Tooltip 
} from 'recharts';
import Link from 'next/link';

// --- Mock Data ---
// Use static data to avoid hydration mismatches between Server and Client
const MOCK_HERO_DATA = [
  { time: 0, value: 4500 }, { time: 1, value: 4700 }, { time: 2, value: 4600 },
  { time: 3, value: 4900 }, { time: 4, value: 5100 }, { time: 5, value: 5000 },
  { time: 6, value: 5300 }, { time: 7, value: 5500 }, { time: 8, value: 5400 },
  { time: 9, value: 5700 }, { time: 10, value: 5900 }, { time: 11, value: 5800 },
  { time: 12, value: 6100 }, { time: 13, value: 6300 }, { time: 14, value: 6200 },
  { time: 15, value: 6500 }, { time: 16, value: 6700 }, { time: 17, value: 6600 },
  { time: 18, value: 6900 }, { time: 19, value: 7100 }
];

const AGENTS = [
  {
    id: 'btc-momentum',
    name: 'BTC Momentum',
    description: '20/50 EMA crossover strategy optimized for volatile regimes.',
    returns: '+24.5%',
    sharpe: '1.82',
    risk: 'Medium',
    data: [30, 45, 32, 60, 55, 80, 75, 95]
  },
  {
    id: 'eth-mean-revert',
    name: 'ETH Mean Revert',
    description: 'RSI-based oscillator strategy targeting oversold bounce points.',
    returns: '+18.2%',
    sharpe: '2.10',
    risk: 'Low',
    data: [40, 38, 42, 39, 45, 43, 48, 46]
  },
  {
    id: 'sol-breakout',
    name: 'SOL Breakout',
    description: 'Bollinger Band expansion strategy for high-velocity moves.',
    returns: '+42.1%',
    sharpe: '1.45',
    risk: 'High',
    data: [20, 25, 40, 35, 60, 55, 90, 110]
  }
];

const PARTNERS = [
  { name: 'Supabase', logo: 'https://supabase.com/dashboard/img/supabase-logo.svg' },
  { name: 'Alpaca', logo: 'https://alpaca.markets/img/logo.svg' },
  { name: 'Stripe', logo: 'https://images.ctfassets.net/q602vtcuu3w3/69ZfQ6pv6Onp6ON6Onp6ON/69ZfQ6pv6Onp6ON6Onp6ON/Stripe_logo.svg' },
  { name: 'Cloudflare', logo: 'https://www.cloudflare.com/img/logo-cloudflare-dark.svg' }
];

// --- Components ---

/**
 * 1. Dynamic Hero Section
 * Agent Signal Core - layered visualization of intelligence processing financial data
 */
const Hero = () => {
  const [textIndex, setTextIndex] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [activeAgent, setActiveAgent] = useState(0);
  const words = ["Algorithm", "Future", "Alpha"];

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % words.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const agentInterval = setInterval(() => {
      setActiveAgent(prev => (prev + 1) % AGENTS.length);
    }, 2500);
    return () => clearInterval(agentInterval);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setMousePos({ x, y });
  };

  const AGENT_DATA = [
    { label: 'BUY', symbol: 'ETH', qty: '0.42', price: '3124.12', signal: 'Volatility Breakout', returns: '+24.5%' },
    { label: 'SELL', symbol: 'SOL', qty: '12.5', price: '98.42', signal: 'RSI Oversold', returns: '+18.2%' },
    { label: 'BUY', symbol: 'BTC', qty: '0.08', price: '67432.50', signal: 'EMA Crossover', returns: '+42.1%' },
    { label: 'HOLD', symbol: 'AVAX', qty: '2.1', price: '35.18', signal: 'Range Bound', returns: '+8.4%' },
  ];

  const currentAgent = AGENT_DATA[activeAgent];
  const intensity = isHovering ? 1.5 : 1;
  const glowScale = 1 + (Math.abs(mousePos.x) + Math.abs(mousePos.y)) * 0.15;
  const pullX = mousePos.x * 20;
  const pullY = mousePos.y * 20;

  const BG_DATA = Array.from({ length: 20 }, (_, i) => ({
    time: `T-${20 - i}`,
    value: 3000 + Math.random() * 500 + i * 20,
  }));

  return (
    <section 
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => { setIsHovering(false); setMousePos({ x: 0, y: 0 }); }}
    >
      <div className="absolute inset-0 overflow-hidden">

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-50" 
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)' }} 
      />
      
      {/* Noise texture */}
      <div className="absolute inset-0 pointer-events-none z-40 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Background layer with pull effect */}
      <motion.div 
        className="absolute inset-0 z-0 opacity-10 pointer-events-none"
        animate={{ x: pullX, y: pullY }}
        transition={{ type: "spring", stiffness: 100, damping: 30 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={BG_DATA}>
            <defs>
              <linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity={0.15}/>
                <stop offset="100%" stopColor="#00E5FF" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="#00E5FF" fill="url(#bgGradient)" strokeWidth={1} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Signal lines with pull effect */}
      <motion.div 
        className="absolute inset-0 z-20 opacity-15 pointer-events-none"
        animate={{ x: pullX * 0.5, y: pullY * 0.5 }}
        transition={{ type: "spring", stiffness: 150, damping: 25 }}
      >
        <svg className="w-full h-full">
          {[30, 50, 70, 40, 60].map((y, i) => (
            <line 
              key={i}
              x1="0%" y1={`${y}%`} x2="100%" y2={`${y + 15}%`}
              stroke="#00E5FF"
              strokeWidth={0.5}
              strokeDasharray="6 12"
              opacity={0.3}
            />
          ))}
        </svg>
      </motion.div>

      {/* Interactive Core - Agent Intelligence Core */}
      <motion.div 
        className="absolute left-1/2 top-1/2 z-30 pointer-events-none"
        animate={{ 
          x: mousePos.x * 50,
          y: mousePos.y * 50,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      >
        <motion.div
          animate={{ 
            scale: glowScale * intensity,
          }}
          transition={{ type: "spring", stiffness: 150, damping: 15 }}
        >
          {/* Orbit rings */}
          {[0.7, 1, 1.3].map((scale, i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full border"
              style={{ 
                borderColor: i === 0 ? 'rgba(0,229,153,0.15)' : 'rgba(0,229,153,0.08)',
                borderWidth: 1,
                transform: `scale(${scale})`,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 20 + i * 10, repeat: Infinity, ease: "linear" }}
            />
          ))}
          
          {/* Core glow */}
          <div 
            className="absolute inset-0 rounded-full"
            style={{ 
              background: 'radial-gradient(circle, rgba(0,229,153,0.2) 0%, rgba(0,229,153,0.05) 40%, transparent 70%)',
              boxShadow: isHovering ? '0 0 100px rgba(0,229,153,0.5)' : '0 0 60px rgba(0,229,153,0.3)',
            }}
          />
          
          {/* Inner core */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <div 
                className="w-20 h-20 rounded-full"
                style={{ 
                  background: 'radial-gradient(circle at 35% 35%, rgba(0,229,153,0.9), rgba(0,229,153,0.4) 50%, rgba(0,229,153,0.1))',
                  boxShadow: '0 0 50px rgba(0,229,153,0.7), 0 0 100px rgba(0,229,153,0.3)',
                }}
              />
            </motion.div>
          </div>
          
          {/* Trade execution pulses */}
          {[0, 120, 240].map((deg, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: '#00E5FF',
                top: '50%',
                left: '50%',
                boxShadow: '0 0 8px #00E5FF',
              }}
              animate={{
                x: [0, Math.cos(deg * Math.PI / 180) * 80],
                y: [0, Math.sin(deg * Math.PI / 180) * 80],
                opacity: [1, 0],
                scale: [1, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 1,
                ease: "easeOut",
              }}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* Agent signal overlay */}
      <motion.div 
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
        animate={{ 
          x: mousePos.x * 40,
          y: mousePos.y * 40,
          opacity: isHovering ? 1 : 0
        }}
        transition={{ type: "spring", stiffness: 150, damping: 20 }}
      >
        <div className="text-center">
          <div className="font-mono text-lg text-cyan-400 font-semibold">{currentAgent.symbol}</div>
          <div className="font-mono text-2xl text-white font-bold">{currentAgent.returns}</div>
          <div className="font-mono text-xs text-zinc-500 mt-1">{currentAgent.signal}</div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="container relative z-40 mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-6xl md:text-9xl font-semibold tracking-tight text-white mb-8" style={{ fontFamily: 'var(--font-body)' }}>
            Own the{' '}
            <span className="relative inline-block min-w-[320px] text-left">
              <AnimatePresence mode="wait">
                <motion.span
                  key={words[textIndex]}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent"
                >
                  {words[textIndex]}
                </motion.span>
              </AnimatePresence>
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            The world's first exchange for tokenized AI trading strategies.{' '}
            Invest in verified, autonomous agents trading 24/7 on real market data.
          </p>
          
          {/* Trust layer */}
          <div className="flex flex-wrap items-center justify-center gap-6 mb-12">
            {[
              { label: '$2.4M', sub: 'Simulated Volume' },
              { label: '48', sub: 'Verified Agents' },
              { label: '99.9%', sub: 'Uptime' },
            ].map((stat, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-lg font-semibold text-white">{stat.label}</span>
                <span className="text-xs text-zinc-500 uppercase tracking-wide">{stat.sub}</span>
                {i < 2 && <span className="w-px h-4 bg-zinc-700" />}
              </div>
            ))}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.div
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Link href="/signup" 
                className="px-10 py-5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25"
              >
                Start Trading <ArrowRight size={20} />
              </Link>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link href="/exchange" className="px-10 py-5 bg-zinc-900/80 border border-zinc-700/50 text-white font-semibold rounded-xl hover:bg-zinc-800 hover:border-zinc-600 transition-all backdrop-blur-sm">
                View Live Agents
              </Link>
            </motion.div>
          </div>
        </motion.div>

        {/* Stats Bar */}
        <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 border-y border-zinc-800/30 py-10">
          {[
            { label: 'Total AUM', value: '$12.4M' },
            { label: 'Active Agents', value: '142' },
            { label: 'Avg. APY', value: '28.4%' },
            { label: 'Win Rate', value: '68%' },
          ].map((stat, i) => (
            <div key={i} className="flex flex-col items-center">
              <span className="text-2xl font-semibold text-white font-mono">{stat.value}</span>
              <span className="text-xs uppercase tracking-widest text-zinc-500 mt-1">{stat.label}</span>
            </div>
          ))}
        </div>
        
        {/* Agent Activity Feed - Bottom right */}
        <motion.div 
          className="absolute bottom-8 right-8 z-40 pointer-events-none"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1 }}
        >
          <div className="flex flex-col gap-2">
            {[
              { agent: 'ETH Momentum', action: 'executed trade', side: 'buy', color: '#00E5FF' },
              { agent: 'SOL Vol', action: 'rebalanced', side: '', color: '#00E5FF' },
              { agent: 'BTC Alpha', action: 'hit threshold', side: '', color: '#00E5FF' },
            ].map((item, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-2 text-xs font-mono"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 + i * 0.3 }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                <span className="text-zinc-400">{item.agent}</span>
                <span className="text-zinc-600">{item.action}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
      </div>
    </section>
  );
};

/**
 * 2. Featured Agent Spotlight
 */
const FeaturedAgent = () => {
  const [activeTab, setActiveTab] = useState(0);
  const agent = AGENTS[activeTab];

  return (
    <section className="py-40 bg-zinc-950/50 border-y border-zinc-900">
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row gap-24 items-center">
          <div className="w-full lg:w-1/2 space-y-4">
            <h2 className="text-sm font-bold text-amber-500 uppercase tracking-[0.2em] mb-4">Top Performers</h2>
            <h3 className="text-4xl font-bold text-white mb-6">Agent Spotlight</h3>
            
            <div className="space-y-4 mb-8">
              {AGENTS.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => setActiveTab(i)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    activeTab === i 
                      ? 'bg-zinc-900 border-amber-500/50 text-white' 
                      : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{a.name}</span>
                    <span className={activeTab === i ? 'text-amber-500' : 'text-zinc-600'}>{a.returns}</span>
                  </div>
                </button>
              ))}
            </div>
            
            <p className="text-zinc-400 text-lg leading-relaxed max-w-xl">
              {agent.description}
            </p>
          </div>

          <div className="w-full lg:w-1/2 bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-2xl relative">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500">
                <TrendingUp size={24} />
              </div>
              <div>
                <h4 className="text-xl font-bold text-white">{agent.name} Performance</h4>
                <p className="text-zinc-500 text-sm">Real-time paper trading track record</p>
              </div>
            </div>

            <div className="h-[200px] w-full mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={agent.data.map((v, i) => ({ i, v }))}>
                  <Area 
                    type="monotone" 
                    dataKey="v" 
                    stroke="#F59E0B" 
                    fill="#F59E0B20" 
                    strokeWidth={2} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <span className="block text-zinc-500 text-xs mb-1 uppercase">Sharpe</span>
                <span className="text-white font-bold">{agent.sharpe}</span>
              </div>
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <span className="block text-zinc-500 text-xs mb-1 uppercase">Risk Profile</span>
                <span className="text-white font-bold">{agent.risk}</span>
              </div>
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <span className="block text-zinc-500 text-xs mb-1 uppercase">Return</span>
                <span className="text-amber-500 font-bold">{agent.returns}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * 3. Trade Simulator Widget
 */
const TradeSimulator = () => {
  const [amount, setAmount] = useState(1000);
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0]);

  const projected = useMemo(() => {
    const rate = parseFloat(selectedAgent.returns.replace('%', '')) / 100;
    return amount * (1 + rate);
  }, [amount, selectedAgent]);

  return (
    <section className="py-32 relative">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-zinc-900 to-black p-1 rounded-[2rem] border border-zinc-800">
          <div className="bg-zinc-950 rounded-[1.9rem] p-8 md:p-12">
            <div className="text-center mb-16">
              <div className="inline-flex p-3 rounded-2xl bg-zinc-900 text-amber-500 mb-4">
                <Calculator size={32} />
              </div>
              <h3 className="text-3xl font-bold text-white mb-2">Simulate Your Portfolio</h3>
              <p className="text-zinc-500">See how ASE agents would have performed with your capital.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-20 items-center">
              <div className="space-y-8">
                <div>
                  <label className="block text-zinc-400 text-sm mb-4 uppercase tracking-widest font-semibold">
                    Investment Amount: ${amount.toLocaleString()}
                  </label>
                  <input 
                    type="range" 
                    min="100" 
                    max="10000" 
                    step="100"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-sm mb-4 uppercase tracking-widest font-semibold">
                    Select Strategy
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AGENTS.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => setSelectedAgent(agent)}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-all border ${
                          selectedAgent.id === agent.id 
                            ? 'bg-amber-500 border-amber-500 text-black' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        {agent.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl text-center">
                <span className="text-zinc-500 text-sm uppercase mb-2 block">Projected Growth</span>
                <div className="text-5xl font-bold text-white mb-4">
                  ${projected.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-amber-500 font-bold mb-6">
                  +{selectedAgent.returns} Net Return
                </div>
                <Link href="/signup" className="block w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all">
                  Get Started with $100 Credit
                </Link>
                <p className="text-[10px] text-zinc-600 mt-4 leading-tight">
                  *Simulated historical performance based on paper trading data. 
                  Not a guarantee of future returns. Paper trading only.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * 4. Social Proof & Trust Signals
 */
const SocialProof = () => (
  <div className="py-20 border-t border-zinc-900">
    <div className="container mx-auto px-6">
      <p className="text-center text-zinc-600 text-xs uppercase tracking-[0.3em] mb-8 font-bold">
        Powered By Industry Standards
      </p>
      <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
        {PARTNERS.map(p => (
          <img key={p.name} src={p.logo} alt={p.name} className="h-6 md:h-8 object-contain" />
        ))}
      </div>
    </div>
  </div>
);

/**
 * 5. Feature Grid (Reused from description)
 */
const Features = () => (
  <section className="py-32">
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-3 gap-12">
        {[
          {
            title: 'Fractional Ownership',
            desc: 'Own a percentage of any trading algorithm. No need to manage API keys or servers.',
            icon: ShieldCheck
          },
          {
            title: 'Verified Performance',
            desc: 'Every trade is logged on-chain. Audit track records before you invest a single credit.',
            icon: BarChart3
          },
          {
            title: '24/7 Execution',
            desc: 'Agents never sleep. They react to market movements in milliseconds across all major pairs.',
            icon: Zap
          }
        ].map((f, i) => (
          <div key={i} className="p-8 rounded-3xl bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 transition-all group">
            <f.icon className="text-amber-500 mb-6 group-hover:scale-110 transition-transform" size={32} />
            <h4 className="text-xl font-bold text-white mb-4">{f.title}</h4>
            <p className="text-zinc-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/**
 * Main Landing Page Component
 */
export default function LandingPage() {
  return (
    <div className="bg-black text-zinc-300 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/50 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="shrink-0">
              <circle cx="14" cy="14" r="12" stroke="#00E5FF" strokeWidth="1.5" fill="none" opacity="0.8" />
              <circle cx="14" cy="14" r="4" fill="#00E5FF" />
              <circle cx="14" cy="14" r="8" stroke="#00E5FF" strokeWidth="0.5" fill="none" opacity="0.4" />
              <path d="M14 2v3M14 23v3M2 14h3M23 14h3" stroke="#00E5FF" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="text-lg font-semibold text-white tracking-tight" style={{ fontFamily: 'var(--font-body)' }}>ASE</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="/exchange" className="text-sm font-medium hover:text-white transition-colors">Exchange</Link>
            <Link href="/builders" className="text-sm font-medium hover:text-white transition-colors">For Builders</Link>
            <Link href="/about" className="text-sm font-medium hover:text-white transition-colors">Whitepaper</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-bold text-zinc-400 hover:text-white px-4">Log In</Link>
            <Link href="/signup" className="px-5 py-2 bg-white text-black text-sm font-bold rounded-full hover:bg-zinc-200 transition-all">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <Hero />
      
      <SocialProof />

      <section className="py-40 container mx-auto px-6">
        <div className="flex flex-col lg:flex-row gap-24 items-center">
          <div className="lg:w-1/2">
            <div className="bg-amber-500/10 text-amber-500 px-4 py-1 rounded-full text-xs font-bold w-fit mb-6 uppercase tracking-widest">
              The Shift
            </div>
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-8 tracking-tighter">
              From Trading to <span className="italic text-zinc-500">Portfolio Ownership</span>
            </h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="mt-1 text-red-500"><Zap size={20} /></div>
                <div>
                  <h5 className="font-bold text-white">The Old Way</h5>
                  <p className="text-zinc-500">Staring at candles, manually managing risk, and fighting against 24/7 algorithms with human emotion.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="mt-1 text-green-500"><ShieldCheck size={20} /></div>
                <div>
                  <h5 className="font-bold text-white">The ASE Way</h5>
                  <p className="text-zinc-500">Owning the algorithms themselves. Deploying capital into a diverse fleet of autonomous trading agents.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:w-1/2 grid grid-cols-2 gap-8">
            <div className="space-y-8 pt-12">
              <div className="h-48 bg-zinc-900 rounded-3xl border border-zinc-800 p-6 flex flex-col justify-end">
                <span className="text-2xl font-bold text-white">99.9%</span>
                <span className="text-zinc-500 text-xs">Uptime</span>
              </div>
              <div className="h-64 bg-amber-500 rounded-3xl p-6 flex flex-col justify-end text-black">
                <span className="text-3xl font-bold italic">$100</span>
                <span className="font-bold text-sm uppercase">Welcome Credit</span>
              </div>
            </div>
            <div className="space-y-8">
              <div className="h-64 bg-zinc-800 rounded-3xl p-6 flex flex-col justify-end border border-zinc-700">
                <Users size={32} className="mb-auto text-zinc-400" />
                <span className="text-2xl font-bold text-white">12k+</span>
                <span className="text-zinc-400 text-xs">Investors</span>
              </div>
              <div className="h-48 bg-zinc-900 rounded-3xl border border-zinc-800 p-6 flex flex-col justify-end">
                <Lock size={24} className="mb-auto text-amber-500" />
                <span className="font-bold text-white">AES-256</span>
                <span className="text-zinc-500 text-xs">Encrypted Assets</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeaturedAgent />

      <Features />

      <TradeSimulator />

      {/* Risk Transparency / Auth Pipeline Visualization */}
      <section className="py-40 bg-zinc-950">
        <div className="container mx-auto px-6 text-center">
          <h3 className="text-3xl font-bold text-white mb-20">Institutional Grade Verification</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Strategy Audit', desc: 'Code reviews & logic validation' },
              { step: '02', title: 'Stress Test', desc: '10-year Monte Carlo simulation' },
              { step: '03', title: 'Paper Track', desc: '30-day live market sandbox' },
              { step: '04', title: 'Listing', desc: 'Public exchange availability' }
            ].map((step, i) => (
              <div key={i} className="flex-1 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl relative">
                <span className="text-6xl font-black text-zinc-800 absolute top-4 right-4 leading-none select-none">{step.step}</span>
                <div className="relative z-10 text-left pt-12">
                  <h5 className="font-bold text-white text-xl mb-2">{step.title}</h5>
                  <p className="text-zinc-500 text-sm">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-32">
        <div className="container mx-auto px-6">
          <h3 className="text-center text-3xl font-bold text-white mb-24 underline decoration-amber-500 decoration-4 underline-offset-8">What Paper Investors Say</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { name: "Alex K.", role: "Quant Researcher", content: "The level of data transparency ASE provides for these agents is superior to most hedge fund reporting I've seen." },
              { name: "Sarah M.", role: "Retail Investor", content: "I started with the $100 credit. Seeing the 'SOL Breakout' agent catch that rally automatically was incredible." },
              { name: "James L.", role: "Strategy Developer", content: "Finally a place where I can monetize my EMA strategies without having to build a whole fintech business myself." }
            ].map((t, i) => (
              <div key={i} className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 italic text-zinc-400">
                <p className="mb-6">"{t.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-800" />
                  <div className="not-italic">
                    <div className="text-sm font-bold text-white">{t.name}</div>
                    <div className="text-[10px] uppercase text-zinc-600 tracking-widest">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-40">
        <div className="container mx-auto px-6 text-center">
          <div className="max-w-3xl mx-auto py-20 px-8 rounded-[3rem] bg-amber-500 text-black">
            <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tighter">Ready to own the alpha?</h2>
            <p className="text-xl font-medium mb-10 opacity-80">
              Create your account in 60 seconds and get $100 in paper trading credits automatically.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup" className="px-10 py-4 bg-black text-white font-bold rounded-full hover:scale-105 transition-transform">
                Get Your $100 Credit
              </Link>
              <Link href="/join" className="px-10 py-4 bg-white/20 border border-black/10 text-black font-bold rounded-full hover:bg-white/30 transition-all">
                Join Cohort
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-zinc-950 pt-24 pb-12 border-t border-zinc-900">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center text-black font-bold text-xs">A</div>
                <span className="text-lg font-bold text-white">ASE</span>
              </div>
              <p className="text-zinc-500 text-sm">Tokenizing the world's most profitable AI trading strategies.</p>
            </div>
            <div>
              <h6 className="text-white font-bold mb-6">Platform</h6>
              <ul className="space-y-4 text-sm text-zinc-500">
                <li><Link href="/exchange" className="hover:text-amber-500 transition-colors">Exchange</Link></li>
                <li><Link href="/agents" className="hover:text-amber-500 transition-colors">Agents</Link></li>
                <li><Link href="/risk" className="hover:text-amber-500 transition-colors">Risk Disclosure</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold mb-6">Builders</h6>
              <ul className="space-y-4 text-sm text-zinc-500">
                <li><Link href="/builders" className="hover:text-amber-500 transition-colors">Submit Strategy</Link></li>
                <li><Link href="/docs" className="hover:text-amber-500 transition-colors">Documentation</Link></li>
                <li><Link href="/api" className="hover:text-amber-500 transition-colors">API Keys</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold mb-6">Company</h6>
              <ul className="space-y-4 text-sm text-zinc-500">
                <li><Link href="/about" className="hover:text-amber-500 transition-colors">Whitepaper</Link></li>
                <li><Link href="/privacy" className="hover:text-amber-500 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-amber-500 transition-colors">Terms of Use</Link></li>
              </ul>
            </div>
          </div>
          <div className="text-center pt-12 border-t border-zinc-900 text-zinc-600 text-xs">
            © {new Date().getFullYear()} Agent Securities Exchange (ASE). Paper trading only. No real funds involved.
          </div>
        </div>
      </footer>
    </div>
  );
}