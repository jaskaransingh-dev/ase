'use client'

import { useState, useEffect, useCallback } from 'react'

export interface ChangeItem {
  id: string
  type: 'add' | 'remove' | 'modify'
  file: string
  line?: number
  description: string
  oldCode?: string
  newCode?: string
  status: 'pending' | 'applied' | 'rejected'
}

const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', border: '#1E2A3D',
  blue: '#4F8CFF', mint: '#16C784', red: '#FF5468', orange: '#F5B942',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
}

interface ApplyChangesProps {
  changes: ChangeItem[]
  onApply: (id: string) => void
  onReject: (id: string) => void
  onApplyAll: () => void
  onRejectAll: () => void
  visible: boolean
  onClose: () => void
}

export function ApplyChangesBar({ changes, onApply, onReject, onApplyAll, onRejectAll, visible, onClose }: ApplyChangesProps) {
  const pendingChanges = changes.filter(c => c.status === 'pending')
  const appliedChanges = changes.filter(c => c.status === 'applied')
  const rejectedChanges = changes.filter(c => c.status === 'rejected')

  if (!visible || changes.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: `${C.bg2}F0`, backdropFilter: 'blur(20px)',
      borderTop: `2px solid ${C.blue}`, padding: '0.75rem 1.5rem',
      display: 'flex', alignItems: 'center', gap: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue, animation: 'pulse 2s infinite' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: C.white, fontWeight: 600 }}>
          {pendingChanges.length} change{pendingChanges.length !== 1 ? 's' : ''} pending
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '.3rem', overflowX: 'auto', padding: '.25rem 0' }}>
        {changes.slice(0, 6).map(change => (
          <div key={change.id} style={{
            padding: '.25rem .5rem', borderRadius: 6, fontSize: '.55rem', fontFamily: 'var(--font-mono)',
            background: change.status === 'applied' ? `${C.mint}18` : change.status === 'rejected' ? `${C.red}18` : `${C.blue}12`,
            border: `1px solid ${change.status === 'applied' ? C.mint : change.status === 'rejected' ? C.red : C.blue}40`,
            color: change.status === 'applied' ? C.mint : change.status === 'rejected' ? C.red : C.white,
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: C.faint }}>{change.type === 'add' ? '+' : change.type === 'remove' ? '-' : '~'}</span>
            {' '}{change.description}
          </div>
        ))}
        {changes.length > 6 && (
          <div style={{ padding: '.25rem .4rem', fontSize: '.55rem', color: C.faint }}>+{changes.length - 6} more</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.4rem' }}>
        <button onClick={onRejectAll} style={{
          padding: '.35rem .7rem', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent',
          color: C.muted, fontSize: '.62rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
        }}>
          Reject All
        </button>
        <button onClick={onApplyAll} style={{
          padding: '.35rem .7rem', borderRadius: 6, border: 'none',
          background: C.blue, color: '#fff', fontSize: '.62rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)',
          boxShadow: `0 2px 8px ${C.blue}40`,
        }}>
          Apply All ({pendingChanges.length})
        </button>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: '.25rem', fontSize: '1rem', lineHeight: 1,
        }}>
          \u2715
        </button>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  )
}

interface ChangeHighlightProps {
  oldCode: string
  newCode: string
  file: string
  onClose: () => void
}

export function ChangeHighlight({ oldCode, newCode, file, onClose }: ChangeHighlightProps) {
  const oldLines = oldCode.split('\n')
  const newLines = newCode.split('\n')
  const maxLen = Math.max(oldLines.length, newLines.length)

  const getLineStyle = (oldLine: string | undefined, newLine: string | undefined, idx: number) => {
    if (oldLine === undefined && newLine !== undefined) return { bg: `${C.mint}18`, border: `2px solid ${C.mint}60`, type: 'add' }
    if (newLine === undefined && oldLine !== undefined) return { bg: `${C.red}18`, border: `2px solid ${C.red}60`, type: 'remove' }
    if (oldLine !== newLine) return { bg: `${C.orange}12`, border: `2px solid ${C.orange}40`, type: 'modify' }
    return { bg: 'transparent', border: 'none', type: 'same' }
  }

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem .75rem', borderBottom: `1px solid ${C.border}`, background: C.bg3 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.faint }}>{file}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', fontSize: '.8rem' }}>\u2715</button>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '.62rem' }}>
        {Array.from({ length: maxLen }, (_, idx) => {
          const oldLine = oldLines[idx]
          const newLine = newLines[idx]
          const style = getLineStyle(oldLine, newLine, idx)
          return (
            <div key={idx} style={{ display: 'flex', padding: '0 .5rem', borderLeft: style.type === 'same' ? 'none' : style.border, background: style.bg, minHeight: 22 }}>
              <span style={{ width: 30, textAlign: 'right', paddingRight: '.5rem', color: C.faint, userSelect: 'none' }}>{idx + 1}</span>
              <span style={{ flex: 1, color: style.type === 'same' ? C.text : C.white }}>{style.type === 'remove' ? oldLine : newLine || oldLine || ''}</span>
              {style.type !== 'same' && (
                <span style={{ flexShrink: 0, color: style.type === 'add' ? C.mint : style.type === 'remove' ? C.red : C.orange, fontSize: '.5rem' }}>
                  {style.type === 'add' ? '+' : style.type === 'remove' ? '-' : '~'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function useChangeTracker() {
  const [changes, setChanges] = useState<ChangeItem[]>([])

  const addChange = useCallback((change: Omit<ChangeItem, 'id' | 'status'>) => {
    const id = `change-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setChanges(prev => [...prev, { ...change, id, status: 'pending' as const }])
  }, [])

  const applyChange = useCallback((id: string) => {
    setChanges(prev => prev.map(c => c.id === id ? { ...c, status: 'applied' as const } : c))
  }, [])

  const rejectChange = useCallback((id: string) => {
    setChanges(prev => prev.map(c => c.id === id ? { ...c, status: 'rejected' as const } : c))
  }, [])

  const applyAll = useCallback(() => {
    setChanges(prev => prev.map(c => c.status === 'pending' ? { ...c, status: 'applied' as const } : c))
  }, [])

  const rejectAll = useCallback(() => {
    setChanges(prev => prev.map(c => c.status === 'pending' ? { ...c, status: 'rejected' as const } : c))
  }, [])

  const clearChanges = useCallback(() => setChanges([]), [])

  return { changes, addChange, applyChange, rejectChange, applyAll, rejectAll, clearChanges }
}