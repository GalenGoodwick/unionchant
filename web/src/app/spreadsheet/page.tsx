'use client'

import { useState } from 'react'
import FrameLayout from '@/components/FrameLayout'

interface Cell {
  value: string
}

const COLS = 10
const ROWS = 20
const COL_LABELS = 'ABCDEFGHIJ'.split('')

export default function SpreadsheetPage() {
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  const getCellId = (row: number, col: number) => `${COL_LABELS[col]}${row + 1}`

  const getCellValue = (row: number, col: number) => {
    const id = getCellId(row, col)
    return cells[id]?.value || ''
  }

  const updateCell = (row: number, col: number, value: string) => {
    const id = getCellId(row, col)
    setCells({ ...cells, [id]: { value } })
  }

  return (
    <FrameLayout>
      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="bg-surface border-b border-border p-4">
          <h1 className="text-xl font-bold text-foreground mb-2">Spreadsheet</h1>
          <p className="text-xs text-muted">
            Click a cell to edit • Enter to confirm • Esc to cancel
          </p>
        </div>

        {/* Spreadsheet */}
        <div className="flex-1 overflow-auto bg-background">
          <table className="border-collapse">
            <thead className="sticky top-0 bg-surface z-10">
              <tr>
                <th className="border border-border bg-surface w-12 h-8 text-xs text-muted">#</th>
                {COL_LABELS.map(col => (
                  <th key={col} className="border border-border bg-surface w-32 h-8 text-xs font-semibold text-foreground">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, row) => (
                <tr key={row}>
                  <td className="border border-border bg-surface w-12 h-8 text-xs text-center text-muted sticky left-0 z-10">
                    {row + 1}
                  </td>
                  {Array.from({ length: COLS }, (_, col) => {
                    const cellId = getCellId(row, col)
                    const isSelected = selectedCell === cellId
                    return (
                      <td
                        key={col}
                        className={`border border-border w-32 h-8 p-0 ${
                          isSelected ? 'ring-2 ring-accent ring-inset' : ''
                        }`}
                        onClick={() => setSelectedCell(cellId)}
                      >
                        <input
                          type="text"
                          value={getCellValue(row, col)}
                          onChange={(e) => updateCell(row, col, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setSelectedCell(null)
                              e.currentTarget.blur()
                            }
                          }}
                          className={`w-full h-full px-2 text-sm bg-transparent focus:outline-none ${
                            isSelected ? 'bg-accent/5' : ''
                          }`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Status bar */}
        {selectedCell && (
          <div className="bg-surface border-t border-border p-2 text-xs text-muted">
            Selected: <span className="font-mono text-foreground">{selectedCell}</span>
          </div>
        )}
      </div>
    </FrameLayout>
  )
}
