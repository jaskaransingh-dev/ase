'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { BLOCKS, type Block, type BlockKind } from '@/lib/quant/blocks'

const C = {
  bg: '#0B1728', surface: '#101A2D', surface2: '#162438', surface3: '#1E2A3D',
  border: 'rgba(79, 140, 255, 0.1)', borderActive: 'rgba(79, 140, 255, 0.3)',
  text: '#F5F8FC', text2: '#D9E3F1', muted: '#7F8CA3', faint: '#55657A',
  orange: '#F59E0B', violet: '#8B5CF6', purple: '#A78BFA', blue: '#4F8CFF',
  green: '#16C784', red: '#E45867', amber: '#F59E0B', cyan: '#6DD3FF',
}

const KIND_META: Record<BlockKind, { gradient: string; icon: string; label: string; glow: string; emoji: string }> = {
  data: { gradient: 'linear-gradient(135deg,#162447,#0D1B36)', icon: '⬡', label: 'Data Sources', glow: '#60A5FA', emoji: '📊' },
  indicator: { gradient: 'linear-gradient(135deg,#0D2818,#081F14)', icon: '∿', label: 'Indicators', glow: '#34D399', emoji: '📈' },
  ml: { gradient: 'linear-gradient(135deg,#1A0F3E,#100A28)', icon: '◈', label: 'ML / AI', glow: '#A78BFA', emoji: '🧠' },
  api: { gradient: 'linear-gradient(135deg,#1F1508,#140E05)', icon: '⟳', label: 'APIs & News', glow: '#FBBF24', emoji: '🌐' },
  risk: { gradient: 'linear-gradient(135deg,#1F0A0A,#140707)', icon: '⊘', label: 'Risk Mgmt', glow: '#F87171', emoji: '🛡️' },
  execution: { gradient: 'linear-gradient(135deg,#081F22,#051819)', icon: '▸', label: 'Execution', glow: '#22D3EE', emoji: '⚡' },
  signal: { gradient: 'linear-gradient(135deg,#1F0D1A,#140A12)', icon: '✦', label: 'Signals', glow: '#F472B6', emoji: '🔮' },
}

function NodesPageInner() {
  const searchParams = useSearchParams()
  const [pinnedBlocks, setPinnedBlocks] = useState<string[]>([])
  const [blockSearch, setBlockSearch] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('ase_pinned_blocks')
    if (saved) {
      try { setPinnedBlocks(JSON.parse(saved)) } catch {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('ase_pinned_blocks', JSON.stringify(pinnedBlocks))
  }, [pinnedBlocks])

  function togglePin(id: string) {
    setPinnedBlocks(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id])
  }

  const filteredBlocks = blockSearch 
    ? BLOCKS.filter(b => b.label.toLowerCase().includes(blockSearch.toLowerCase()) || b.description.toLowerCase().includes(blockSearch.toLowerCase()))
    : BLOCKS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text, fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 1rem', height: 42, borderBottom: '1px solid ' + C.border, background: C.surface, flexShrink: 0 }}>
        <Link href="/dashboard/lab" style={{ fontSize: '0.55rem', color: C.blue, textDecoration: 'none' }}>← Build</Link>
        <span style={{ color: C.faint }}>·</span>
        <div style={{ fontSize: '0.58rem', letterSpacing: '0.22em', color: C.faint, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Node Builder</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.55rem', color: C.violet, fontFamily: 'var(--font-mono)' }}>{pinnedBlocks.length} blocks</span>
      </div>
      
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 200, borderRight: '1px solid ' + C.border, padding: '0.75rem', overflowY: 'auto', background: C.surface }}>
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.15em', color: C.faint, fontFamily: 'var(--font-mono)', marginBottom: 8, textTransform: 'uppercase' }}>Categories</div>
          {(Object.keys(KIND_META) as BlockKind[]).map(kind => {
            const meta = KIND_META[kind]
            const count = BLOCKS.filter(b => b.kind === kind).length
            return (
              <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.5rem', marginBottom: 2, borderRadius: 6, cursor: 'pointer', color: C.text2, fontSize: '0.7rem' }}>
                <span>{meta.emoji}</span>
                <span style={{ flex: 1 }}>{meta.label}</span>
                <span style={{ fontSize: '0.5rem', color: C.faint }}>{count}</span>
              </div>
            )
          })}
        </div>
        
        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input value={blockSearch} onChange={e => setBlockSearch(e.target.value)} placeholder="Search blocks..." style={{ padding: '0.4rem 0.8rem', background: C.surface2, border: '1px solid ' + C.border, borderRadius: 6, color: C.text, fontSize: '0.7rem', width: 200, outline: 'none' }} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {filteredBlocks.map(b => {
              const meta = KIND_META[b.kind]
              const isPinned = pinnedBlocks.includes(b.id)
              return (
                <button key={b.id} onClick={() => togglePin(b.id)} style={{
                  padding: '0.75rem',
                  borderRadius: 10,
                  background: isPinned ? meta.glow + '15' : meta.gradient,
                  border: '1px solid ' + (isPinned ? meta.glow + '60' : meta.glow + '30'),
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.9rem', color: meta.glow }}>{meta.icon}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.text }}>{b.label}</span>
                    {isPinned && <span style={{ marginLeft: 'auto', fontSize: '0.5rem', color: meta.glow }}>✓</span>}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: C.muted }}>{b.description}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NodesPage() {
  return <Suspense fallback={<div style={{ background: C.bg, color: C.text, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}><NodesPageInner /></Suspense>
}