'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Upload, X, File, Image, Trash2, Copy, Check } from 'lucide-react'

interface SiteFile {
  name: string
  id: string
  updated_at: string
  created_at: string
  last_accessed_at: string | null
  metadata: {
    size: number
    mimetype: string
  }
}

export default function SiteAssetsPage() {
  const [files, setFiles] = useState<SiteFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectedPath, setSelectedPath] = useState('general')
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const supabase = createClient()

  const loadFiles = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.storage
      .from('site-assets')
      .list(selectedPath || '', { limit: 100 })

    if (!error && data) {
      setFiles(data as SiteFile[])
    }
    setLoading(false)
  }, [selectedPath, supabase])

  useState(() => {
    loadFiles()
  })

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    setUploading(true)
    const uploaded: string[] = []

    for (const file of Array.from(fileList)) {
      const timestamp = Date.now()
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filePath = `${selectedPath}/${timestamp}-${sanitizedName}`

      const { error } = await supabase.storage
        .from('site-assets')
        .upload(filePath, file, { upsert: true })

      if (!error) {
        uploaded.push(file.name)
      }
    }

    if (uploaded.length > 0) {
      loadFiles()
    }
    setUploading(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  const handleDelete = async (path: string) => {
    if (!confirm('Delete this file?')) return

    await supabase.storage.from('site-assets').remove([path])
    loadFiles()
  }

  const copyUrl = (path: string) => {
    const { data } = supabase.storage.from('site-assets').getPublicUrl(path)
    navigator.clipboard.writeText(data.publicUrl)
    setCopiedUrl(path)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const isImage = (mime: string) => mime.startsWith('image/')

  const paths = ['general', 'images', 'documents', 'agents', 'avatars']

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 700, color: 'var(--white)', marginBottom: '.5rem' }}>
          Site Assets
        </h1>
        <p style={{ color: 'var(--muted)' }}>Upload and manage files for your site</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {paths.map(path => (
          <button
            key={path}
            onClick={() => { setSelectedPath(path); loadFiles() }}
            style={{
              padding: '.5rem 1rem',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid',
              borderColor: selectedPath === path ? 'var(--blue)' : 'var(--border)',
              background: selectedPath === path ? 'var(--blue-dim)' : 'var(--bg3)',
              color: selectedPath === path ? 'var(--blue)' : 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              cursor: 'pointer',
              transition: 'all .15s ease'
            }}
          >
            {path}
          </button>
        ))}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '3rem 2rem',
          textAlign: 'center',
          background: dragOver ? 'rgba(79,140,255,.05)' : 'var(--bg2)',
          transition: 'all .2s ease',
          marginBottom: '2rem',
          cursor: 'pointer'
        }}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept="image/*,.pdf,.csv"
          onChange={(e) => handleUpload(e.target.files)}
          style={{ display: 'none' }}
        />
        <Upload size={40} style={{ color: 'var(--blue)', marginBottom: '1rem', opacity: .7 }} />
        <div style={{ color: 'var(--white)', fontWeight: 600, marginBottom: '.5rem' }}>
          {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
        </div>
        <div style={{ color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>
          Max 10MB · Images, PDFs, CSVs allowed
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        {loading ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
            Loading...
          </div>
        ) : files.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
            No files in this folder
          </div>
        ) : (
          files.map(file => {
            const filePath = `${selectedPath}/${file.name}`
            const { data } = supabase.storage.from('site-assets').getPublicUrl(filePath)
            return (
              <div
                key={file.name}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                {isImage(file.metadata?.mimetype) ? (
                  <div style={{
                    height: 140,
                    background: 'var(--bg3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}>
                    <img
                      src={data.publicUrl}
                      alt={file.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{
                    height: 140,
                    background: 'var(--bg3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <File size={48} style={{ color: 'var(--faint)' }} />
                  </div>
                )}
                <div style={{ padding: '.75rem' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '.7rem',
                    color: 'var(--white)',
                    marginBottom: '.25rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {file.name}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '.6rem',
                    color: 'var(--faint)',
                    marginBottom: '.75rem'
                  }}>
                    {formatSize(file.metadata?.size || 0)}
                  </div>
                  <div style={{ display: 'flex', gap: '.35rem' }}>
                    <button
                      onClick={() => copyUrl(filePath)}
                      style={{
                        flex: 1,
                        padding: '.4rem',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--bg3)',
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '.6rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '.25rem',
                        transition: 'all .15s ease'
                      }}
                    >
                      {copiedUrl === filePath ? <Check size={12} /> : <Copy size={12} />}
                      {copiedUrl === filePath ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleDelete(filePath)}
                      style={{
                        padding: '.4rem .5rem',
                        borderRadius: 6,
                        border: '1px solid var(--red-border)',
                        background: 'var(--red-dim)',
                        color: 'var(--red)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all .15s ease'
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
