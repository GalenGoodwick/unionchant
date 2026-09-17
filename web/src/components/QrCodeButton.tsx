'use client'

import { useState } from 'react'
import QRCode from 'qrcode'

/**
 * Generate a QR code for any URL, show a scannable preview, and download it
 * as a standalone PNG (white background + quiet zone so it scans anywhere).
 */
export default function QrCodeButton({ url, filename, accentColor = '#fbbf24' }: {
  url: string
  filename: string
  accentColor?: string
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const makePng = () =>
    QRCode.toDataURL(url, {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })

  const handleShow = async () => {
    setBusy(true)
    try { setPreview(await makePng()) } catch { /* silent */ }
    setBusy(false)
  }

  const handleDownload = async () => {
    setBusy(true)
    try {
      const dataUrl = preview || await makePng()
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch { /* silent */ }
    setBusy(false)
  }

  return (
    <div className="space-y-1.5">
      {preview ? (
        <div className="flex items-start gap-2">
          {/* White padding is part of the displayed block so the code scans off-screen too */}
          <img src={preview} alt={`QR code for ${url}`} className="w-28 h-28 rounded bg-white p-1 border border-border/50" />
          <div className="flex flex-col gap-1.5">
            <button
              data-interactive
              onClick={handleDownload}
              disabled={busy}
              className="px-2 py-1.5 rounded text-[10px] font-mono border transition-colors disabled:opacity-50"
              style={{ color: accentColor, borderColor: `${accentColor}4d` }}
            >
              {busy ? '...' : 'Download PNG'}
            </button>
            <button
              data-interactive
              onClick={() => setPreview(null)}
              className="text-[10px] font-mono text-muted-light hover:text-foreground transition-colors text-left"
            >
              Hide
            </button>
          </div>
        </div>
      ) : (
        <button
          data-interactive
          onClick={handleShow}
          disabled={busy}
          className="px-2 py-1.5 rounded text-[10px] font-mono border transition-colors disabled:opacity-50"
          style={{ color: accentColor, borderColor: `${accentColor}4d` }}
        >
          {busy ? '...' : 'QR Code'}
        </button>
      )}
    </div>
  )
}
