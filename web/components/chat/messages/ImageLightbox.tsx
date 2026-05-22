/**
 * ImageLightbox —
 *
 *  src
 * -  downloadName
 */

import { useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface Props {
  src: string | null
  onClose: () => void
  downloadName?: string
}

const ImageLightbox = ({ src, onClose, downloadName }: Props) => {
  useEffect(() => {
    if (!src) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [src, onClose])

  if (!src) return null

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    const link = document.createElement('a')
    link.href = src
    link.download = downloadName || 'image'
    link.click()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 8,
        }}
      >
        {downloadName && (
          <button
            onClick={handleDownload}
            aria-label="DownloadImage"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Download size={18} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          aria-label="ClosePreview"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: 'none',
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={20} />
        </button>
      </div>
      <img
        src={src}
        alt="Preview"
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          borderRadius: 8,
          objectFit: 'contain',
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

export default ImageLightbox
