'use client'

import { useState, useRef } from 'react'
import FrameLayout from '@/components/FrameLayout'

interface Port {
  id: string
  nodeId: string
  angle: number // position on circle (degrees)
}

interface Node {
  id: string
  text: string
  x: number
  y: number
  ports: Port[]
}

interface Edge {
  fromPort: string
  toPort: string
}

export default function MindMapPage() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: '1', text: 'Central Idea', x: 400, y: 300, ports: [] }
  ])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const [editingNode, setEditingNode] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [draggingNewConnection, setDraggingNewConnection] = useState<{
    fromNodeId: string
    fromPortId: string | null
    x: number
    y: number
  } | null>(null)
  const [openSheet, setOpenSheet] = useState<string | null>(null)
  const [sheetData, setSheetData] = useState<Record<string, Record<string, string>>>({})
  const svgRef = useRef<SVGSVGElement>(null)

  const getPort = (portId: string) => {
    for (const node of nodes) {
      const port = node.ports.find(p => p.id === portId)
      if (port) return port
    }
  }

  const getPortPosition = (port: Port) => {
    const node = nodes.find(n => n.id === port.nodeId)
    if (!node) return { x: 0, y: 0 }
    const radians = (port.angle * Math.PI) / 180
    const radius = 50
    return {
      x: node.x + Math.cos(radians) * radius,
      y: node.y + Math.sin(radians) * radius
    }
  }

  const evaluateFormula = (formula: string, nodeId: string): string => {
    if (!formula.startsWith('=')) return formula

    const expr = formula.slice(1).trim()
    const sheet = sheetData[nodeId] || {}

    // Replace cell references (A1, B2, etc.) with values
    let evaluated = expr.replace(/([A-Z]+)(\d+)/g, (match, col, row) => {
      const cellId = `${col}${row}`
      const value = sheet[cellId] || '0'
      // If cell has formula, evaluate it recursively
      if (value.startsWith('=')) {
        return evaluateFormula(value, nodeId)
      }
      return value || '0'
    })

    // Handle SUM function: =SUM(A1:A5)
    evaluated = evaluated.replace(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/gi, (match, startCol, startRow, endCol, endRow) => {
      let sum = 0
      for (let i = parseInt(startRow); i <= parseInt(endRow); i++) {
        const cellId = `${startCol}${i}`
        const val = parseFloat(sheet[cellId] || '0')
        sum += isNaN(val) ? 0 : val
      }
      return sum.toString()
    })

    // Handle AVERAGE function
    evaluated = evaluated.replace(/AVERAGE\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/gi, (match, startCol, startRow, endCol, endRow) => {
      let sum = 0
      let count = 0
      for (let i = parseInt(startRow); i <= parseInt(endRow); i++) {
        const cellId = `${startCol}${i}`
        const val = parseFloat(sheet[cellId] || '0')
        if (!isNaN(val)) {
          sum += val
          count++
        }
      }
      return count > 0 ? (sum / count).toString() : '0'
    })

    try {
      // Evaluate the expression
      const result = eval(evaluated)
      return result.toString()
    } catch {
      return '#ERROR'
    }
  }

  const getSheetCellValue = (nodeId: string, cellId: string): string => {
    const sheet = sheetData[nodeId] || {}
    const value = sheet[cellId] || ''
    if (value.startsWith('=')) {
      return evaluateFormula(value, nodeId)
    }
    return value
  }

  const updateSheetCell = (nodeId: string, cellId: string, value: string) => {
    setSheetData({
      ...sheetData,
      [nodeId]: {
        ...(sheetData[nodeId] || {}),
        [cellId]: value
      }
    })
  }

  const addNode = () => {
    const newNode: Node = {
      id: Date.now().toString(),
      text: 'New Thought',
      x: Math.random() * 600 + 100,
      y: Math.random() * 400 + 100,
      ports: []
    }
    setNodes([...nodes, newNode])
  }

  const deleteNode = (id: string) => {
    const node = nodes.find(n => n.id === id)
    if (!node) return

    // Remove all edges connected to this node's ports
    const portIds = node.ports.map(p => p.id)
    setEdges(edges.filter(e => !portIds.includes(e.fromPort) && !portIds.includes(e.toPort)))

    setNodes(nodes.filter(n => n.id !== id))
    if (selectedNode === id) setSelectedNode(null)
  }

  const startEdit = (node: Node) => {
    setEditingNode(node.id)
    setEditText(node.text)
  }

  const saveEdit = () => {
    if (editingNode) {
      setNodes(nodes.map(n => n.id === editingNode ? { ...n, text: editText } : n))
      setEditingNode(null)
    }
  }

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    setDraggingNode(nodeId)
    setSelectedNode(nodeId)
  }

  const startDragNewConnection = (e: React.MouseEvent, fromNodeId: string) => {
    e.stopPropagation()
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Create port on source node
      const sourceNode = nodes.find(n => n.id === fromNodeId)
      if (!sourceNode) return

      const dx = x - sourceNode.x
      const dy = y - sourceNode.y
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI

      const newPort: Port = {
        id: `port-${Date.now()}`,
        nodeId: fromNodeId,
        angle
      }

      setNodes(nodes.map(n =>
        n.id === fromNodeId
          ? { ...n, ports: [...n.ports, newPort] }
          : n
      ))

      setDraggingNewConnection({ fromNodeId, fromPortId: newPort.id, x, y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      if (draggingNode) {
        setNodes(nodes.map(n => n.id === draggingNode ? { ...n, x, y } : n))
      } else if (draggingNewConnection) {
        setDraggingNewConnection({ ...draggingNewConnection, x, y })

        // Update source port angle to follow mouse (only for newly created ports)
        const sourceNode = nodes.find(n => n.id === draggingNewConnection.fromNodeId)
        if (sourceNode && draggingNewConnection.fromPortId) {
          const port = sourceNode.ports.find(p => p.id === draggingNewConnection.fromPortId)
          // Only update angle if this is a new port being created (check if it has no edges yet)
          const hasEdges = edges.some(e => e.fromPort === draggingNewConnection.fromPortId)

          if (port && !hasEdges) {
            const dx = x - sourceNode.x
            const dy = y - sourceNode.y
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI

            setNodes(nodes.map(n =>
              n.id === draggingNewConnection.fromNodeId
                ? {
                    ...n,
                    ports: n.ports.map(p =>
                      p.id === draggingNewConnection.fromPortId
                        ? { ...p, angle }
                        : p
                    )
                  }
                : n
            ))
          }
        }
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingNewConnection && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Check if dropped on an existing node
      let targetNode: Node | null = null
      for (const node of nodes) {
        if (node.id === draggingNewConnection.fromNodeId) continue
        const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2)
        if (dist < 50) {
          targetNode = node
          break
        }
      }

      if (targetNode) {
        // Connect to existing node - create port on target
        const dx = x - targetNode.x
        const dy = y - targetNode.y
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI

        const targetPort: Port = {
          id: `port-${Date.now()}-target`,
          nodeId: targetNode.id,
          angle
        }

        setNodes(nodes.map(n =>
          n.id === targetNode!.id
            ? { ...n, ports: [...n.ports, targetPort] }
            : n
        ))

        if (draggingNewConnection.fromPortId) {
          setEdges([...edges, {
            fromPort: draggingNewConnection.fromPortId,
            toPort: targetPort.id
          }])
        }
      } else {
        // Create new node at release position
        const newPort: Port = {
          id: `port-${Date.now()}-new`,
          nodeId: `${Date.now()}-node`,
          angle: 180 // facing back toward source
        }

        const newNode: Node = {
          id: `${Date.now()}-node`,
          text: 'New Thought',
          x,
          y,
          ports: [newPort]
        }

        setNodes([...nodes, newNode])

        if (draggingNewConnection.fromPortId) {
          setEdges([...edges, {
            fromPort: draggingNewConnection.fromPortId,
            toPort: newPort.id
          }])
        }
      }

      setDraggingNewConnection(null)
    }
    setDraggingNode(null)
  }

  return (
    <FrameLayout>
      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="bg-surface border-b border-border p-4">
          <h1 className="text-xl font-bold text-foreground mb-3">Mind Map</h1>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={addNode}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
            >
              + Add Thought
            </button>
            {selectedNode && (
              <>
                <button
                  onClick={() => {
                    const node = nodes.find(n => n.id === selectedNode)
                    if (node) startEdit(node)
                  }}
                  className="bg-surface hover:bg-surface-hover text-foreground px-4 py-2 rounded text-sm border border-border transition-colors"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => deleteNode(selectedNode)}
                  className="bg-error hover:bg-error-hover text-white px-4 py-2 rounded text-sm transition-colors"
                >
                  🗑️ Delete
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-muted mt-2">
            Drag <span className="text-accent font-medium">+</span> or <span className="text-accent font-medium">bubble</span> to connect • Drop on node to connect existing • Drop in space to create new node
          </p>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-background overflow-hidden relative">
          <svg
            ref={svgRef}
            className="w-full h-full cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Draw edges */}
            {edges.map((edge, i) => {
              const fromPort = getPort(edge.fromPort)
              const toPort = getPort(edge.toPort)
              if (!fromPort || !toPort) return null

              const fromPos = getPortPosition(fromPort)
              const toPos = getPortPosition(toPort)

              return (
                <line
                  key={i}
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toPos.x}
                  y2={toPos.y}
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-border"
                  markerEnd="url(#arrowhead)"
                />
              )
            })}

            {/* Preview line while dragging */}
            {draggingNewConnection && (() => {
              const fromNode = nodes.find(n => n.id === draggingNewConnection.fromNodeId)
              if (!fromNode || !draggingNewConnection.fromPortId) return null

              const fromPort = getPort(draggingNewConnection.fromPortId)
              if (!fromPort) return null

              const fromPos = getPortPosition(fromPort)

              // Check if hovering over a node (for visual feedback)
              let hoverNode: Node | null = null
              for (const node of nodes) {
                if (node.id === draggingNewConnection.fromNodeId) continue
                const dist = Math.sqrt(
                  (node.x - draggingNewConnection.x) ** 2 + (node.y - draggingNewConnection.y) ** 2
                )
                if (dist < 50) {
                  hoverNode = node
                  break
                }
              }

              return (
                <>
                  {/* Preview line */}
                  <line
                    x1={fromPos.x}
                    y1={fromPos.y}
                    x2={draggingNewConnection.x}
                    y2={draggingNewConnection.y}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    className="text-accent"
                    markerEnd="url(#arrowhead-preview)"
                  />
                  {/* Preview node (if not hovering existing node) */}
                  {!hoverNode && (
                    <>
                      <circle
                        cx={draggingNewConnection.x}
                        cy={draggingNewConnection.y}
                        r="50"
                        className="fill-accent/20 stroke-accent stroke-2"
                        strokeDasharray="5,5"
                      />
                      <text
                        x={draggingNewConnection.x}
                        y={draggingNewConnection.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="text-sm font-medium fill-accent pointer-events-none select-none"
                      >
                        New Thought
                      </text>
                    </>
                  )}
                  {/* Highlight target node if hovering */}
                  {hoverNode && (
                    <circle
                      cx={hoverNode.x}
                      cy={hoverNode.y}
                      r="50"
                      className="fill-transparent stroke-accent stroke-4"
                    />
                  )}
                </>
              )
            })()}

            {/* Arrow markers */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                className="text-border"
              >
                <polygon points="0 0, 10 3, 0 6" fill="currentColor" />
              </marker>
              <marker
                id="arrowhead-preview"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                className="text-accent"
              >
                <polygon points="0 0, 10 3, 0 6" fill="currentColor" />
              </marker>
            </defs>

            {/* Draw nodes */}
            {nodes.map(node => (
              <g key={node.id}>
                {/* Main circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="50"
                  className={`transition-colors cursor-move ${
                    selectedNode === node.id
                      ? 'fill-accent stroke-accent-hover'
                      : 'fill-surface stroke-border hover:stroke-accent'
                  }`}
                  strokeWidth="2"
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onDoubleClick={() => startEdit(node)}
                />
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-sm font-medium fill-foreground pointer-events-none select-none"
                >
                  {node.text.length > 15 ? node.text.slice(0, 15) + '...' : node.text}
                </text>

                {/* Connection ports (bubbles) */}
                {node.ports.map(port => {
                  const pos = getPortPosition(port)
                  return (
                    <circle
                      key={port.id}
                      cx={pos.x}
                      cy={pos.y}
                      r="6"
                      className="fill-accent hover:fill-accent-hover stroke-white cursor-pointer"
                      strokeWidth="2"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        if (svgRef.current) {
                          const rect = svgRef.current.getBoundingClientRect()
                          const x = e.clientX - rect.left
                          const y = e.clientY - rect.top
                          setDraggingNewConnection({
                            fromNodeId: node.id,
                            fromPortId: port.id,
                            x,
                            y
                          })
                        }
                      }}
                    />
                  )
                })}

                {/* + button on edge */}
                {(() => {
                  let buttonX = node.x + 50
                  let buttonY = node.y

                  // If dragging from this node, position button towards mouse
                  if (draggingNewConnection && draggingNewConnection.fromNodeId === node.id) {
                    const dx = draggingNewConnection.x - node.x
                    const dy = draggingNewConnection.y - node.y
                    const angle = Math.atan2(dy, dx)
                    const radius = 50
                    buttonX = node.x + Math.cos(angle) * radius
                    buttonY = node.y + Math.sin(angle) * radius
                  }

                  return (
                    <>
                      {/* + button (create connection) */}
                      <g
                        onMouseDown={(e) => startDragNewConnection(e, node.id)}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={buttonX}
                          cy={buttonY}
                          r="12"
                          className="fill-accent hover:fill-accent-hover stroke-white"
                          strokeWidth="2"
                        />
                        <text
                          x={buttonX}
                          y={buttonY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="text-xs font-bold fill-white pointer-events-none select-none"
                        >
                          +
                        </text>
                      </g>

                      {/* Spreadsheet button (below + button) */}
                      <g
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenSheet(node.id)
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={node.x + 65}
                          cy={node.y}
                          r="12"
                          className="fill-green-500 hover:fill-green-600 stroke-white"
                          strokeWidth="2"
                        />
                        <text
                          x={node.x + 65}
                          y={node.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="text-xs font-bold fill-white pointer-events-none select-none"
                        >
                          📊
                        </text>
                      </g>
                    </>
                  )
                })()}
              </g>
            ))}
          </svg>
        </div>

        {/* Edit Modal */}
        {editingNode && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface border border-border rounded-lg p-6 w-96">
              <h2 className="text-lg font-bold text-foreground mb-4">Edit Thought</h2>
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') setEditingNode(null)
                }}
                className="w-full bg-background border border-border rounded px-3 py-2 text-foreground mb-4"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingNode(null)}
                  className="px-4 py-2 text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Spreadsheet Modal */}
        {openSheet && (() => {
          const node = nodes.find(n => n.id === openSheet)
          if (!node) return null

          const COLS = 26 // A-Z
          const ROWS = 50
          const COL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-1 md:p-2">
              <div className="bg-surface border border-border rounded-lg w-full h-full md:w-[99vw] md:h-[98vh] flex flex-col">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-lg font-bold text-foreground">{node.text} - Spreadsheet</h2>
                  <button
                    onClick={() => setOpenSheet(null)}
                    className="text-muted hover:text-foreground text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  <div className="bg-background rounded border border-border text-xs text-muted p-2 mb-3">
                    <strong>Formulas:</strong> Start with = • <strong>Examples:</strong> =A1+B1, =SUM(A1:A5), =AVERAGE(B1:B5) • <strong>Scroll:</strong> Horizontal scrollbar below
                  </div>

                  <div className="overflow-x-auto overflow-y-auto max-h-full border border-border rounded">
                    <table className="border-collapse">
                    <thead className="sticky top-0 bg-surface z-20">
                      <tr>
                        <th className="sticky left-0 border border-border bg-surface w-16 h-9 text-xs text-muted z-30">#</th>
                        {COL_LABELS.map(col => (
                          <th key={col} className="border border-border bg-surface min-w-[120px] h-9 text-xs font-semibold text-foreground px-2">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: ROWS }, (_, row) => (
                        <tr key={row}>
                          <td className="sticky left-0 border border-border bg-surface w-16 h-9 text-xs text-center text-muted font-medium z-10">
                            {row + 1}
                          </td>
                          {Array.from({ length: COLS }, (_, col) => {
                            const cellId = `${COL_LABELS[col]}${row + 1}`
                            const rawValue = (sheetData[openSheet] || {})[cellId] || ''
                            const displayValue = getSheetCellValue(openSheet, cellId)

                            return (
                              <td key={col} className="border border-border min-w-[120px] h-9 p-0">
                                <input
                                  type="text"
                                  value={rawValue}
                                  onChange={(e) => updateSheetCell(openSheet, cellId, e.target.value)}
                                  placeholder={displayValue !== rawValue ? displayValue : ''}
                                  className="w-full h-full px-2 text-sm bg-transparent focus:outline-none focus:bg-accent/5 focus:ring-2 focus:ring-accent"
                                  title={rawValue.startsWith('=') ? `Formula: ${rawValue}\nResult: ${displayValue}` : ''}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>

                <div className="p-4 border-t border-border flex justify-end">
                  <button
                    onClick={() => setOpenSheet(null)}
                    className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </FrameLayout>
  )
}
