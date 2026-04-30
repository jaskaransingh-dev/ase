'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BLOCKS, getBlockById } from '@/lib/quant/blocks'

const FALLBACK_SUGGESTIONS = [
  'Buy top 3 crypto by 20-day momentum',
  'Mean-revert BTC when RSI drops below 28',
  'Composite momentum + mean-reversion strategy',
  'Aggressive SOL growth with kill switch',
]

const BLOCK_ICONS: Record<string, string> = {
  data: '📊', indicator: '📈', ml: '🤖', api: '🔗', risk: '🛡️', execution: '⚡', signal: '🎯',
}

const KIND_COLORS: Record<string, string> = {
  data: '#3b82f6', indicator: '#a855f7', ml: '#ec4899', api: '#06b6d4', risk: '#ef4444', execution: '#f59e0b', signal: '#16c784',
}

interface Node {
  id: string; x: number; y: number; label: string; kind: string; color: string
}

const C = { bg: '#030608', bg2: '#060d17', border: '#1a2535', text: '#94a3b8', faint: '#475569', muted: '#64748b', white: '#f1f5f9', blue: '#3b82f6', mint: '#16c784', orange: '#f59e0b', red: '#ef4444' }

interface ChatMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; pending?: boolean }

export default function BuildPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [pinned, setPinned] = useState<string[]>([])
  const [building, setBuilding] = useState(false)
  const [buildingPhase, setBuildingPhase] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [chat, setChat] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  const [nodes, setNodes] = useState<Node[]>([])
  const [dropTarget, setDropTarget] = useState(false)

  useEffect(() => { fetch('/api/build/suggestions').then(r => r.json()).catch(() => {}) }, [])

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [chat, chatStreaming])

  useEffect(() => {
    if (pinned.length > 0 && nodes.length === 0) {
      const newNodes: Node[] = pinned.map((id, i) => {
        const block = getBlockById(id)
        return {
          id,
          x: 300 + i * 120,
          y: 200 + (i % 3) * 80,
          label: block?.label || id,
          kind: block?.kind || 'data',
          color: KIND_COLORS[block?.kind || 'data'] || C.blue
        }
      })
      setNodes(newNodes)
    } else if (pinned.length === 0) {
      setNodes([])
    }
  }, [pinned])

  const togglePin = useCallback((id: string) => {
    const block = getBlockById(id)
    if (!block) return
    
    if (pinned.includes(id)) {
      setPinned(prev => prev.filter(b => b !== id))
      setNodes(prev => prev.filter(n => n.id !== id))
    } else {
      setPinned(prev => [...prev, id])
      const newNode: Node = {
        id,
        x: 300 + pinned.length * 120,
        y: 200 + (pinned.length % 3) * 80,
        label: block.label,
        kind: block.kind,
        color: KIND_COLORS[block.kind] || C.blue
      }
      setNodes(prev => [...prev, newNode])
    }
  }, [pinned])

  const handleBuild = async () => {
    if (!prompt.trim() && pinned.length === 0) return
    setBuilding(true); setError(null); setBuildingPhase('Analyzing'); setProgress(0)
    
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: prompt.trim() || 'Build with blocks: ' + pinned.map(id => getBlockById(id)?.label).join(', ') }
    setChat(prev => [...prev, userMsg])
    
    try {
      localStorage.setItem('ase_build_prompt', prompt); localStorage.setItem('ase_build_blocks', JSON.stringify(pinned))
      
      const blockContext = pinned.length > 0 
        ? `\n\nUse these blocks:\n${pinned.map(id => {
            const b = getBlockById(id)
            return `- ${b?.label}: ${b?.agentHint}`
          }).join('\n')}`
        : ''
      
      const res = await fetch('/api/ai/chat', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          messages: [...chat, userMsg].map(m => ({ role: m.role, content: m.content + (m.id === userMsg.id ? blockContext : '') })), 
          apiIds: pinned.join(','), 
          buildMode: true, 
          stream: true 
        }) 
      })
      if (!res.ok || !res.body) throw new Error('AI unavailable')
      
      setBuildingPhase('Initializing')
      setProgress(15)
      setBuildingPhase('Writing signals')
      setProgress(35)
      setBuildingPhase('Writing risk')
      setProgress(55)
      setBuildingPhase('Writing execution')
      setProgress(75)
      
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', pending: true }
      setChat(prev => [...prev, assistantMsg])
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const decoded = decoder.decode(value, { stream: true })
        const lines = (buffer + decoded).split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data || data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              acc += parsed.content
              setChat(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: acc } : m))
              setProgress(prev => Math.min(95, prev + 2))
            }
          } catch {}
        }
      }
      setProgress(100)
      
      setBuilding(false)
      localStorage.setItem('ase_pending_agent', JSON.stringify({ 
        prompt, 
        blocks: pinned, 
        ts: Date.now(), 
        initialChat: acc,
        status: 'building' 
      }))
      
      setTimeout(() => {
        router.push('/dashboard/lab?from=build')
      }, 1500)
    } catch (e) { 
      setError(e instanceof Error ? e.message : 'Build failed'); 
      setBuilding(false) 
    }
  }

  const sendChat = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || chatStreaming) return
    
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', pending: true }
    setChat(prev => [...prev, userMsg, assistantMsg])
    setChatInput('')
    setChatStreaming(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chat, userMsg].map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content })),
          stream: true,
        }),
      })
      if (!res.ok || !res.body) throw new Error('chat failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const obj = JSON.parse(payload)
            if (obj.content) {
              acc += obj.content
              setChat(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: acc } : m))
            }
          } catch {}
        }
      }
    } catch { 
      setChat(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Error connecting to AI' }])
    }
    setChatStreaming(false)
  }, [chatInput, chatStreaming, chat])

  const handleCanvasMouseDown = (e: React.MouseEvent) => { 
    const t = e.target as HTMLElement
    if (t === canvasRef.current || t.classList.contains('canvas-area')) {
      setIsDraggingCanvas(true)
      setDragStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y })
    }
  }
  const handleCanvasMouseMove = (e: React.MouseEvent) => { 
    if (isDraggingCanvas) setCanvasOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  const handleCanvasMouseUp = () => { setIsDraggingCanvas(false); setDropTarget(false) }
  const wheelHandler = (e: React.WheelEvent) => { 
    if (e.ctrlKey || e.metaKey) { 
      e.preventDefault(); 
      setZoom(z => Math.max(0.5, Math.min(2, z - e.deltaY * 0.001))) 
    } 
  }
  
  const handleDragStart = (e: React.DragEvent, blockId: string) => { e.dataTransfer.setData('blockId', blockId) }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDropTarget(true) }
  const handleDragLeave = () => { setDropTarget(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(false)
    const blockId = e.dataTransfer.getData('blockId')
    const block = getBlockById(blockId)
    if (block && !pinned.includes(blockId)) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const x = (e.clientX - rect.left - canvasOffset.x) / zoom
        const y = (e.clientY - rect.top - canvasOffset.y) / zoom
        setPinned(prev => [...prev, blockId])
        setNodes(prev => [...prev, { 
          id: blockId, 
          x, 
          y, 
          label: block.label, 
          kind: block.kind, 
          color: KIND_COLORS[block.kind] || C.blue 
        }])
      }
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: 'var(--font-body)' }} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}>
      <style>{`
        @keyframes spark { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .block-chip { padding: 0.25rem 0.4rem; border-radius: 4px; font-size: 0.42rem; cursor: grab; user-select: none; transition: all 0.15s; white-space: nowrap; }
        .block-chip:hover { transform: translateY(-1px); }
        .block-chip.pinned { background: rgba(22,199,132,0.15); border: 1px solid #16c784; color: #16c784; }
        .block-chip:not(.pinned) { background: rgba(15,25,35,0.6); border: 1px solid rgba(15,25,35,0.4); color: #94a3b8; }
        .node-block { padding: 0.4rem 0.6rem; border-radius: 6px; background: rgba(6,12,20,0.95); border-left: 3px solid; cursor: grab; transition: all 0.2s; }
        .node-block:hover { transform: scale(1.02); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .progress-track { height: 4px; background: rgba(22,199,132,0.15); border-radius: 2px; overflow: hidden; }
        .progress-bar { height: 100%; background: linear-gradient(90deg, #16c784, #10b981); transition: width 0.3s ease; }
        .chat-msg { padding: 0.4rem 0.5rem; border-radius: 6px; margin-bottom: 0.3rem; font-size: 0.48rem; line-height: 1.5; }
        .chat-msg.user { background: rgba(22,199,132,0.1); border: 1px solid rgba(22,199,132,0.2); color: #16c784; align-self: flex-end; }
        .chat-msg.assistant { background: rgba(15,25,35,0.5); color: #94a3b8; align-self: flex-start; }
      `}</style>

      {/* TOP - PROMPT */}
      <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: 500 }}>
        <div style={{ background: C.bg2, borderRadius: 12, border: `1px solid ${C.border}`, padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: C.mint, letterSpacing: '0.05em' }}>CREATE AGENT</span>
            <span style={{ fontSize: '0.4rem', color: C.faint }}>⌘ + Enter</span>
          </div>
          <textarea 
            ref={textareaRef} 
            value={prompt} 
            onChange={e => setPrompt(e.target.value)} 
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleBuild() } }} 
            placeholder="Describe your strategy... e.g., Buy BTC when RSI drops below 30" 
            style={{ width: '100%', background: 'rgba(15,25,35,0.5)', border: '1px solid rgba(22,199,132,0.15)', borderRadius: 8, padding: '0.5rem', color: C.white, fontFamily: 'var(--font-mono)', fontSize: '0.65rem', lineHeight: 1.5, outline: 'none', resize: 'none', minHeight: 60 }} 
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {FALLBACK_SUGGESTIONS.slice(0, 2).map((s, i) => (
                <button key={i} onClick={() => setPrompt(s)} style={{ padding: '0.2rem 0.4rem', borderRadius: 4, background: 'rgba(15,25,35,0.5)', border: `1px solid ${C.border}`, color: C.faint, fontSize: '0.4rem', cursor: 'pointer' }}>
                  {s.slice(0, 20)}...
                </button>
              ))}
            </div>
            <button 
              onClick={handleBuild} 
              disabled={building || (!prompt.trim() && pinned.length === 0)} 
              style={{ 
                padding: '0.4rem 1rem', 
                borderRadius: 6, 
                background: building ? 'rgba(22,199,132,0.3)' : C.mint, 
                color: building ? C.faint : '#000', 
                fontWeight: 600, 
                fontSize: '0.6rem', 
                border: 'none', 
                cursor: building ? 'not-allowed' : 'pointer' 
              }}>
              {building ? buildingPhase + '...' : 'Build Agent'}
            </button>
          </div>
          
          {/* Progress bar */}
          {building && (
            <div style={{ marginTop: '0.75rem' }}>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
              <div style={{ fontSize: '0.4rem', color: C.faint, marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>{buildingPhase}</span>
                <span>{progress}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CENTER - CANVAS with blocks */}
      <div style={{ position: 'fixed', left: 20, right: 20, top: 160, bottom: 200, pointerEvents: 'none' }}>
        <div 
          ref={canvasRef} 
          onMouseDown={handleCanvasMouseDown} 
          onWheel={wheelHandler}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="canvas-area"
          style={{ 
            position: 'absolute', 
            inset: 0, 
            background: `radial-gradient(ellipse 100% 80% at 20% 20%, rgba(59,130,246,0.05) 0%, transparent 50%), radial-gradient(ellipse 80% 60% at 80% 80%, rgba(22,199,132,0.04) 0%, transparent 50%)`, 
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`, 
            transformOrigin: '0 0',
            borderRadius: 12,
            border: dropTarget ? `2px dashed ${C.mint}` : `2px solid ${C.border}`,
            transition: 'border 0.2s',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {nodes.length === 0 && (
            <div style={{ textAlign: 'center', color: C.faint }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧩</div>
              <div style={{ fontSize: '0.6rem' }}>Drag blocks here to compose your strategy</div>
            </div>
          )}
          
          {nodes.map((node, i) => (
            <div key={node.id} className="node-block" style={{ position: 'absolute', left: node.x, top: node.y, borderLeftColor: node.color }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 600, color: node.color }}>{node.label}</div>
              <div style={{ fontSize: '0.35rem', color: C.faint, textTransform: 'capitalize' }}>{node.kind}</div>
              {i < nodes.length - 1 && (
                <svg style={{ position: 'absolute', left: '80%', top: '50%', width: 40, height: 1, overflow: 'visible' }}>
                  <line x1={0} y1={0} x2={40} y2={0} stroke={C.border} strokeWidth={2} strokeDasharray="4,4" />
                  <polygon points="40,0 35,-3 35,3" fill={C.border} />
                </svg>
              )}
            </div>
          ))}
        </div>
        
        {/* Zoom controls */}
        <div style={{ position: 'absolute', right: 0, bottom: 0, display: 'flex', gap: '0.25rem' }}>
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ width: 28, height: 28, borderRadius: 4, background: C.bg2, border: `1px solid ${C.border}`, color: C.text, cursor: 'pointer' }}>−</button>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} style={{ width: 28, height: 28, borderRadius: 4, background: C.bg2, border: `1px solid ${C.border}`, color: C.text, cursor: 'pointer' }}>+</button>
          <button onClick={() => { setZoom(1); setCanvasOffset({ x: 0, y: 0 }) }} style={{ width: 28, height: 28, borderRadius: 4, background: C.bg2, border: `1px solid ${C.border}`, color: C.text, cursor: 'pointer' }}>⊙</button>
        </div>
      </div>

      {/* BOTTOM - BLOCKS + CHAT */}
      <div style={{ position: 'fixed', left: 20, right: 20, bottom: 20, height: 160, display: 'flex', gap: '1rem' }}>
        {/* Blocks panel */}
        <div style={{ width: '60%', background: C.bg2, borderRadius: 12, border: `1px solid ${C.border}`, padding: '0.75rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.5rem', fontWeight: 600, color: C.mint, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>BLOCKS — DRAG TO CANVAS</div>
          <div style={{ flex: 1, display: 'flex', gap: '0.35rem', flexWrap: 'wrap', overflowY: 'auto' }}>
            {BLOCKS.map(b => {
              const isPinned = pinned.includes(b.id)
              return (
                <div 
                  key={b.id} 
                  draggable 
                  onDragStart={e => handleDragStart(e, b.id)} 
                  onClick={() => togglePin(b.id)} 
                  className={`block-chip ${isPinned ? 'pinned' : ''}`}
                  title={b.description}
                >
                  {BLOCK_ICONS[b.kind]} {b.label}
                </div>
              )
            })}
          </div>
        </div>
        
        {/* Chat panel */}
        <div style={{ flex: 1, background: C.bg2, borderRadius: 12, border: `1px solid ${C.border}`, padding: '0.75rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.5rem', fontWeight: 600, color: C.mint, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>AI CHAT</div>
          
          {/* Messages */}
          <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {chat.length === 0 && (
              <div style={{ fontSize: '0.45rem', color: C.faint, textAlign: 'center', marginTop: '0.5rem' }}>
                Ask about your strategy
              </div>
            )}
            {chat.map(m => (
              <div key={m.id} className={`chat-msg ${m.role === 'user' ? 'user' : 'assistant'}`} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                {m.pending && <span style={{ animation: 'spark 0.8s infinite' }}>▌</span>}
              </div>
            ))}
          </div>
          
          {/* Input */}
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <input 
              ref={chatInputRef}
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)} 
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendChat() } }}
              placeholder="Ask AI..." 
              style={{ 
                flex: 1, 
                background: 'rgba(15,25,35,0.5)', 
                border: `1px solid ${C.border}`, 
                borderRadius: 6, 
                padding: '0.35rem 0.5rem', 
                color: C.white, 
                fontSize: '0.5rem', 
                outline: 'none' 
              }} 
            />
            <button 
              onClick={sendChat} 
              disabled={chatStreaming || !chatInput.trim()} 
              style={{ 
                padding: '0.35rem 0.6rem', 
                borderRadius: 6, 
                background: chatStreaming ? C.faint : C.mint, 
                color: chatStreaming ? C.bg2 : '#000', 
                fontSize: '0.5rem', 
                border: 'none', 
                cursor: chatStreaming ? 'not-allowed' : 'pointer' 
              }}
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div style={{ position: 'fixed', bottom: 200, left: '50%', transform: 'translateX(-50%)', padding: '0.5rem 1rem', borderRadius: 6, background: 'rgba(239,68,68,0.15)', border: `1px solid ${C.red}`, color: C.red, fontSize: '0.5rem' }}>
          {error}
        </div>
      )}
    </div>
  )
}