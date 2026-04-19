'use client'
import { useEffect, useState } from 'react'

function Sparkline({ positive = true, width = 100, height = 28 }: { positive?: boolean; width?: number; height?: number }) {
  const [mounted, setMounted] = useState(false)
  const [pts, setPts] = useState('')
  
  useEffect(() => {
    setMounted(true)
    const points = Array.from({ length: 12 }, (_, i) => {
      const trend = positive ? -i * ((height * 0.35) / 11) : i * ((height * 0.35) / 11)
      const noise = Math.sin(i * 1.8) * (height * 0.15) + Math.sin(i * 0.7) * (height * 0.08)
      const y = (height * 0.65) + trend + noise
      return `${(i / 11) * width},${Math.max(2, Math.min(height - 2, y))}`
    }).join(' ')
    setPts(points)
  }, [positive, width, height])

  const gradientId = `sg_${width}x${height}_${positive ? 'p' : 'n'}`

  if (!mounted || !pts) return <div style={{ width, height }} />

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={positive ? '#00E599' : '#FF5A5F'} stopOpacity={0.25} />
          <stop offset="100%" stopColor={positive ? '#00E599' : '#FF5A5F'} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${gradientId})`} />
      <polyline points={pts} fill="none" stroke={positive ? '#00E599' : '#FF5A5F'} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MacBookScreen() {
  return (
    <div style={{
      height: '100%',
      background: '#050D1A',
      overflow: 'hidden',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      userSelect: 'none',
    }}>
      <div style={{ display: 'flex', height: '100%', gap: 8 }}>
        {/* Sidebar */}
        <div style={{
          width: 86,
          background: 'rgba(7,17,31,0.8)',
          borderRadius: 6,
          padding: '10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          border: '1px solid rgba(91,140,255,0.08)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#FFFFFF', marginBottom: 8, letterSpacing: '-0.02em', fontFamily: 'Georgia, serif' }}>ase.</div>
          {[
            { label: 'Dashboard', active: true },
            { label: 'My Agents', active: false },
            { label: 'Marketplace', active: false },
            { label: 'Activity', active: false },
            { label: 'Settings', active: false },
          ].map(item => (
            <div key={item.label} style={{
              fontSize: 6,
              color: item.active ? '#FFFFFF' : '#3A5070',
              padding: '4px 6px',
              borderRadius: 4,
              background: item.active ? 'rgba(91,140,255,0.15)' : 'transparent',
              fontWeight: item.active ? 600 : 400,
              letterSpacing: '0.02em',
            }}>{item.label}</div>
          ))}
          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(91,140,255,0.08)', margin: '6px 0' }} />
          {/* User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: 'linear-gradient(135deg, #5B8CFF, #19E6A7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 7, color: 'white', fontWeight: 700,
            }}>J</div>
            <div style={{ fontSize: 5.5, color: '#3A5070' }}>jaskaran</div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          {/* Top stats row */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: 'PORTFOLIO', value: '$84,241', sub: '+24.8% all time', color: '#00E599' },
              { label: 'TODAY P&L', value: '+$2,441', sub: '+2.9%', color: '#00E599' },
              { label: 'ACTIVE', value: '3', sub: 'of 15 agents', color: '#5B8CFF' },
            ].map(stat => (
              <div key={stat.label} style={{
                flex: 1,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(91,140,255,0.08)',
                borderRadius: 5,
                padding: '6px 7px',
              }}>
                <div style={{ fontSize: 4.5, color: '#3A5070', letterSpacing: '0.1em', marginBottom: 2 }}>{stat.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: 6, color: stat.color, marginTop: 2 }}>{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{
            height: 48,
            background: 'rgba(91,140,255,0.03)',
            border: '1px solid rgba(91,140,255,0.08)',
            borderRadius: 5,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <Sparkline positive={true} width={320} height={48} />
            <div style={{
              position: 'absolute', top: 4, left: 7,
              fontSize: 5, color: '#3A5070', letterSpacing: '0.1em',
            }}>30D PORTFOLIO</div>
            <div style={{
              position: 'absolute', top: 4, right: 7,
              fontSize: 5.5, color: '#00E599', fontFamily: 'monospace',
            }}>+0.4% NAV</div>
          </div>

          {/* Agent cards */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}>
            <div style={{ fontSize: 5, color: '#3A5070', letterSpacing: '0.12em' }}>MY AGENTS</div>
            {[
              { ticker: 'BTCM', name: 'BTC Momentum Edge', ret: '+0.10', sharpe: '5.10', pos: true },
              { ticker: 'ETHD', name: 'ETH DeFi Yield', ret: '+0.00', sharpe: '1.24', pos: true },
              { ticker: 'BEPV', name: 'BTC/ETH Pair Trading', ret: '-13.82', sharpe: '-0.04', pos: false },
            ].map(a => (
              <div key={a.ticker} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(91,140,255,0.08)',
                borderRadius: 4,
                padding: '5px 7px',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: 'rgba(91,140,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 4, fontWeight: 800, color: '#5B8CFF', fontFamily: 'monospace',
                  flexShrink: 0,
                }}>{a.ticker.slice(0, 3)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 6.5, fontWeight: 600, color: '#D1D9E6', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                  <div style={{ fontSize: 5, color: '#3A5070' }}>Sharpe {a.sharpe} · LIVE</div>
                </div>
                <div style={{ width: 44, height: 18, flexShrink: 0 }}>
                  <Sparkline positive={a.pos} width={44} height={18} />
                </div>
                <div style={{
                  fontSize: 7, fontWeight: 700,
                  color: a.pos ? '#00E599' : '#FF5A5F',
                  fontFamily: 'monospace',
                  minWidth: 30,
                  textAlign: 'right',
                  flexShrink: 0,
                }}>{a.ret}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function IPhoneScreen() {
  return (
    <div style={{
      height: '100%',
      background: '#050D1A',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Status bar */}
      <div style={{ height: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 14px 5px', flexShrink: 0 }}>
        <span style={{ fontSize: 7.5, color: '#8E9BB5', fontWeight: 600, letterSpacing: '-0.01em' }}>9:41</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
            {[3, 5, 7, 9].map((h, i) => (
              <div key={i} style={{ width: 2.5, height: h, background: i < 3 ? '#8E9BB5' : 'rgba(142,155,181,0.25)', borderRadius: 1 }} />
            ))}
          </div>
          <div style={{ width: 13, height: 7, border: '1px solid rgba(142,155,181,0.5)', borderRadius: 1.5, display: 'flex', alignItems: 'center', padding: '0 1.5px' }}>
            <div style={{ height: 4, width: '65%', background: '#00E599', borderRadius: 0.5 }} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '6px 12px 10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {/* Page title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Portfolio</div>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'linear-gradient(135deg, #5B8CFF, #19E6A7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: 'white', fontWeight: 700,
          }}>J</div>
        </div>

        {/* Big value */}
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.03em', lineHeight: 1 }}>$84,241</div>
          <div style={{ fontSize: 9, color: '#00E599', marginTop: 4 }}>▲ +$2,441 today (+2.9%)</div>
        </div>

        {/* Chart */}
        <div style={{ height: 52 }}>
          <Sparkline positive={true} width={118} height={52} />
        </div>

        {/* Time range pills */}
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          {['1D', '1W', '1M', '3M', '1Y'].map((t, i) => (
            <div key={t} style={{
              fontSize: 7, padding: '2px 6px', borderRadius: 20,
              background: i === 4 ? 'rgba(91,140,255,0.2)' : 'transparent',
              color: i === 4 ? '#5B8CFF' : '#3A5070',
              border: i === 4 ? '1px solid rgba(91,140,255,0.2)' : '1px solid transparent',
            }}>{t}</div>
          ))}
        </div>

        {/* Agent list */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 7, color: '#3A5070', letterSpacing: '0.12em', marginBottom: 5 }}>MY AGENTS</div>
          {[
            { name: 'BTC Momentum Edge', ret: '+0.10%', pos: true },
            { name: 'ETH DeFi Yield', ret: '+0.00%', pos: true },
            { name: 'BTC/ETH Pair Trading', ret: '-13.82%', pos: false },
          ].map((a, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '5px 0',
              borderBottom: i < 2 ? '1px solid rgba(91,140,255,0.06)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#00E599',
                }} />
                <span style={{ fontSize: 8, color: '#CBD5E1' }}>{a.name}</span>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: a.pos ? '#00E599' : '#FF5A5F',
                fontFamily: 'monospace',
              }}>{a.ret}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HeroDevices() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="hero-devices-wrap" style={{ position: 'relative', width: '100%', height: 500, userSelect: 'none' }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        top: '45%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 480, height: 300,
        background: 'radial-gradient(ellipse, rgba(91,140,255,0.14) 0%, rgba(25,230,167,0.04) 50%, transparent 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* MacBook */}
      <div className="hero-devices-macbook" style={{
        position: 'absolute',
        top: 24, left: '50%',
        transform: 'translateX(-54%)',
        zIndex: 1,
        animation: mounted ? 'hDeviceFloat 6s ease-in-out infinite' : 'none',
      }}>
        <div style={{
          transform: 'perspective(1400px) rotateY(-7deg) rotateX(2deg)',
          transformOrigin: 'center center',
        }}>
          {/* Screen */}
          <div style={{
            width: 430, height: 270,
            background: '#111827',
            borderRadius: '12px 12px 0 0',
            border: '3px solid #1E293B',
            borderBottom: 'none',
            boxShadow: '0 30px 70px rgba(0,0,0,0.65), 0 0 50px rgba(91,140,255,0.07), inset 0 0 0 1px rgba(255,255,255,0.04)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Camera */}
            <div style={{
              position: 'absolute', top: 7, left: '50%', transform: 'translateX(-50%)',
              width: 6, height: 6, borderRadius: '50%', background: '#0A0E1A',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
              zIndex: 2,
            }} />
            {/* Screen inner bezel */}
            <div style={{ marginTop: 18, height: 'calc(100% - 18px)', overflow: 'hidden', background: '#050D1A' }}>
              <MacBookScreen />
            </div>
          </div>
          {/* Hinge */}
          <div style={{
            width: '100%', height: 3,
            background: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)',
          }} />
          {/* Base */}
          <div style={{
            width: '100%', height: 16,
            background: 'linear-gradient(180deg, #1E293B 0%, #111827 100%)',
            borderRadius: '0 0 6px 6px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            position: 'relative',
          }}>
            {/* Notch cutout on base */}
            <div style={{
              position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
              width: 60, height: 6, background: '#0A0E1A', borderRadius: '0 0 4px 4px',
            }} />
          </div>
        </div>
        {/* Ground reflection */}
        <div style={{
          position: 'absolute', bottom: -14, left: '8%', right: '8%',
          height: 14,
          background: 'radial-gradient(ellipse, rgba(91,140,255,0.18) 0%, transparent 70%)',
          filter: 'blur(8px)',
        }} />
      </div>

      {/* iPhone */}
      <div className="hero-devices-iphone" style={{
        position: 'absolute',
        bottom: 14, right: '8%',
        zIndex: 3,
        animation: mounted ? 'hDeviceFloat 4.8s ease-in-out infinite 1.3s' : 'none',
      }}>
        <div style={{
          transform: 'perspective(1000px) rotateY(14deg) rotateX(-2deg)',
          transformOrigin: 'center bottom',
        }}>
          <div style={{
            width: 112, height: 228,
            background: 'linear-gradient(160deg, #1C2035 0%, #0F172A 100%)',
            borderRadius: 24,
            border: '2px solid #1E293B',
            boxShadow: '0 24px 56px rgba(0,0,0,0.75), 0 0 30px rgba(91,140,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.05)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Dynamic Island */}
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              width: 38, height: 11, borderRadius: 12, background: '#000',
              zIndex: 2,
            }} />
            <IPhoneScreen />
          </div>
          {/* Side buttons */}
          <div style={{
            position: 'absolute', right: -3, top: 60,
            width: 3, height: 28, background: '#1E293B', borderRadius: '0 3px 3px 0',
          }} />
          <div style={{
            position: 'absolute', left: -3, top: 50,
            width: 3, height: 20, background: '#1E293B', borderRadius: '3px 0 0 3px',
          }} />
          <div style={{
            position: 'absolute', left: -3, top: 76,
            width: 3, height: 20, background: '#1E293B', borderRadius: '3px 0 0 3px',
          }} />
        </div>
        {/* Phone ground glow */}
        <div style={{
          position: 'absolute', bottom: -10, left: '5%', right: '5%',
          height: 10,
          background: 'radial-gradient(ellipse, rgba(91,140,255,0.12) 0%, transparent 70%)',
          filter: 'blur(5px)',
        }} />
      </div>

      {/* ── Floating Cards ── */}

      {/* Sharpe Card */}
      <div className="hero-devices-card-sharpe" style={{
        position: 'absolute', top: 16, right: '14%',
        background: 'rgba(5,13,26,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(91,140,255,0.22)',
        borderRadius: 10,
        padding: '9px 13px',
        boxShadow: '0 10px 28px rgba(0,0,0,0.45), 0 0 20px rgba(91,140,255,0.08)',
        zIndex: 5,
        animation: mounted ? 'hCardFloat 5s ease-in-out infinite 0.4s' : 'none',
        minWidth: 108,
      }}>
        <div style={{ fontSize: 7, color: '#3A5070', letterSpacing: '0.12em', marginBottom: 3 }}>SHARPE RATIO</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', fontFamily: 'monospace', lineHeight: 1, letterSpacing: '-0.02em' }}>5.10</div>
        <div style={{ fontSize: 7.5, color: '#5B8CFF', marginTop: 4 }}>BTC Momentum Edge</div>
      </div>

      {/* Monthly Return Card */}
      <div className="hero-devices-card-month" style={{
        position: 'absolute', top: '38%', left: '3%',
        background: 'rgba(5,13,26,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,229,153,0.22)',
        borderRadius: 10,
        padding: '9px 13px',
        boxShadow: '0 10px 28px rgba(0,0,0,0.45), 0 0 20px rgba(0,229,153,0.08)',
        zIndex: 5,
        animation: mounted ? 'hCardFloat 6s ease-in-out infinite 1.6s' : 'none',
        minWidth: 118,
      }}>
        <div style={{ fontSize: 7, color: '#3A5070', letterSpacing: '0.12em', marginBottom: 3 }}>THIS MONTH</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#00E599', fontFamily: 'monospace', lineHeight: 1, letterSpacing: '-0.02em' }}>+18.4%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E599', display: 'inline-block', animation: 'breathe 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 7.5, color: '#00E599', fontFamily: 'monospace', letterSpacing: '0.1em', fontWeight: 600 }}>LIVE</span>
        </div>
      </div>

      {/* 1Y Return Card */}
      <div className="hero-devices-card-1y" style={{
        position: 'absolute', bottom: '24%', right: '9%',
        background: 'rgba(5,13,26,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(245,158,11,0.22)',
        borderRadius: 10,
        padding: '9px 13px',
        boxShadow: '0 10px 28px rgba(0,0,0,0.45), 0 0 20px rgba(245,158,11,0.08)',
        zIndex: 5,
        animation: mounted ? 'hCardFloat 5.5s ease-in-out infinite 3s' : 'none',
        minWidth: 100,
      }}>
        <div style={{ fontSize: 7, color: '#3A5070', letterSpacing: '0.12em', marginBottom: 3 }}>MEDIAN 1Y</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#F59E0B', fontFamily: 'monospace', lineHeight: 1, letterSpacing: '-0.02em' }}>+24.8%</div>
        <div style={{ fontSize: 7.5, color: '#F59E0B', marginTop: 4 }}>Across all agents</div>
      </div>

      {/* Verified Card */}
      <div className="hero-devices-card-verified" style={{
        position: 'absolute', bottom: '12%', left: '5%',
        background: 'rgba(5,13,26,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(91,140,255,0.18)',
        borderRadius: 10,
        padding: '8px 12px',
        boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
        zIndex: 5,
        animation: mounted ? 'hCardFloat 4.5s ease-in-out infinite 2.2s' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'rgba(91,140,255,0.15)',
            border: '1px solid rgba(91,140,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#5B8CFF',
            flexShrink: 0,
          }}>✓</div>
          <div>
            <div style={{ fontSize: 8.5, fontWeight: 600, color: '#FFFFFF' }}>Audit-Verified</div>
            <div style={{ fontSize: 7, color: '#3A5070' }}>Real execution logs</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes hDeviceFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-9px); }
        }
        @keyframes hCardFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-7px); }
        }
        @media (max-width: 900px) {
          .hero-devices-wrap { height: 380px !important; }
          .hero-devices-macbook { display: none !important; }
          .hero-devices-iphone {
            bottom: 30px !important;
            right: 50% !important;
            transform: translateX(50%) !important;
            animation: none !important;
          }
          .hero-devices-card-sharpe { top: 12px !important; right: 8% !important; }
          .hero-devices-card-month { top: 34% !important; left: 4% !important; }
          .hero-devices-card-1y { bottom: 22% !important; right: 4% !important; }
          .hero-devices-card-verified { bottom: 4% !important; left: 4% !important; }
        }
        @media (max-width: 480px) {
          .hero-devices-wrap { height: 340px !important; }
          .hero-devices-iphone { transform: translateX(50%) scale(0.88) !important; transform-origin: bottom center !important; }
        }
      `}</style>
    </div>
  )
}
