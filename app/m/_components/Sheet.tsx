'use client'

import { useEffect } from 'react'

export default function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title?: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return (
    <>
      <div className="m-sheet-overlay" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-modal="true">
        <div className="m-sheet-grip" />
        {title && <div className="m-sheet-h">{title}</div>}
        <div className="m-sheet-b">{children}</div>
      </div>
    </>
  )
}
