import { useRef, useEffect, useCallback } from 'react'
import type { OfficeState } from '../engine/officeState'
import type { EditorState } from '../editor/editorState'
import type { EditorRenderState, SelectionRenderState, DeleteButtonBounds, RotateButtonBounds } from '../engine/renderer'
import { startGameLoop } from '../engine/gameLoop'
import { renderFrame } from '../engine/renderer'
import { TILE_SIZE, EditTool } from '../types'
import { CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_SNAP_THRESHOLD, ZOOM_MIN, ZOOM_MAX, ZOOM_SCROLL_THRESHOLD, PAN_MARGIN_FRACTION } from '../../constants'
import { getCatalogEntry, isRotatable } from '../layout/furnitureCatalog'
import { canPlaceFurniture, getWallPlacementRow } from '../editor/editorActions'
import { unlockAudio } from '../../notificationSound'

/** Seats payload when user assigns agents to seats (host can persist or send to extension). */
export type SaveAgentSeatsPayload = Record<number, { palette?: number; seatId: string | null }>

interface OfficeCanvasProps {
  officeState: OfficeState
  onClick: (agentId: number | null) => void
  isEditMode: boolean
  editorState: EditorState
  onEditorTileAction: (col: number, row: number) => void
  onEditorEraseAction: (col: number, row: number) => void
  onEditorSelectionChange: () => void
  onDeleteSelected: () => void
  onRotateSelected: () => void
  onDragMove: (uid: string, newCol: number, newRow: number) => void
  editorTick: number
  zoom: number
  onZoomChange: (zoom: number) => void
  panRef: React.MutableRefObject<{ x: number; y: number }>
  /** Optional: called when user reassigns agent seats (e.g. persist or send to Openclaw/Claude host). */
  onSaveAgentSeats?: (seats: SaveAgentSeatsPayload) => void
}

export function OfficeCanvas({ officeState, onClick, isEditMode, editorState, onEditorTileAction, onEditorEraseAction, onEditorSelectionChange, onDeleteSelected, onRotateSelected, onDragMove, editorTick: _editorTick, zoom, onZoomChange, panRef, onSaveAgentSeats }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  // Refs so game loop always reads latest without restarting (avoids position flash on re-render)
  const officeStateRef = useRef(officeState)
  const editorStateRef = useRef(editorState)
  const isEditModeRef = useRef(isEditMode)
  const zoomRef = useRef(zoom)
  officeStateRef.current = officeState
  editorStateRef.current = editorState
  isEditModeRef.current = isEditMode
  zoomRef.current = zoom
  // Middle-mouse pan state (imperative, no re-renders)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  // Delete/rotate button bounds (updated each frame by renderer)
  const deleteButtonBoundsRef = useRef<DeleteButtonBounds | null>(null)
  const rotateButtonBoundsRef = useRef<RotateButtonBounds | null>(null)
  // Right-click erase dragging
  const isEraseDraggingRef = useRef(false)
  // Zoom scroll accumulator for trackpad pinch sensitivity
  const zoomAccumulatorRef = useRef(0)
  // Left-click drag to pan (when not over an agent)
  const leftPanStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null)
  const didPanThisGestureRef = useRef(false)
  const LEFT_PAN_THRESHOLD_PX = 5

  // Clamp pan so the map edge can't go past a margin inside the viewport
  const clampPan = useCallback((px: number, py: number): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: px, y: py }
    const layout = officeState.getLayout()
    const mapW = layout.cols * TILE_SIZE * zoom
    const mapH = layout.rows * TILE_SIZE * zoom
    const marginX = canvas.width * PAN_MARGIN_FRACTION
    const marginY = canvas.height * PAN_MARGIN_FRACTION
    const maxPanX = (mapW / 2) + canvas.width / 2 - marginX
    const maxPanY = (mapH / 2) + canvas.height / 2 - marginY
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, px)),
      y: Math.max(-maxPanY, Math.min(maxPanY, py)),
    }
  }, [officeState, zoom])

  // Resize canvas backing store to device pixels (no DPR transform on ctx)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    // No ctx.scale(dpr) — we render directly in device pixels
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resizeCanvas()

    const observer = new ResizeObserver(() => resizeCanvas())
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        officeStateRef.current.update(dt)
      },
      render: (ctx) => {
        const os = officeStateRef.current
        const es = editorStateRef.current
        const isEdit = isEditModeRef.current
        const z = zoomRef.current
        // Canvas dimensions are in device pixels
        const w = canvas.width
        const h = canvas.height

        // Build editor render state
        let editorRender: EditorRenderState | undefined
        if (isEdit) {
          const showGhostBorder = es.activeTool === EditTool.TILE_PAINT || es.activeTool === EditTool.WALL_PAINT || es.activeTool === EditTool.ERASE
          editorRender = {
            showGrid: true,
            ghostSprite: null,
            ghostCol: es.ghostCol,
            ghostRow: es.ghostRow,
            ghostValid: es.ghostValid,
            selectedCol: 0,
            selectedRow: 0,
            selectedW: 0,
            selectedH: 0,
            hasSelection: false,
            isRotatable: false,
            deleteButtonBounds: null,
            rotateButtonBounds: null,
            showGhostBorder,
            ghostBorderHoverCol: showGhostBorder ? es.ghostCol : -999,
            ghostBorderHoverRow: showGhostBorder ? es.ghostRow : -999,
          }

          // Ghost preview for furniture placement
          if (es.activeTool === EditTool.FURNITURE_PLACE && es.ghostCol >= 0) {
            const entry = getCatalogEntry(es.selectedFurnitureType)
            if (entry) {
              const placementRow = getWallPlacementRow(es.selectedFurnitureType, es.ghostRow)
              editorRender.ghostSprite = entry.sprite
              editorRender.ghostRow = placementRow
              editorRender.ghostValid = canPlaceFurniture(
                os.getLayout(),
                es.selectedFurnitureType,
                es.ghostCol,
                placementRow,
              )
              if (es.ghostRotation !== 0) editorRender.ghostRotationDeg = es.ghostRotation
            }
          }

          // Ghost preview for drag-to-move
          if (es.isDragMoving && es.dragUid && es.ghostCol >= 0) {
            const draggedItem = os.getLayout().furniture.find((f) => f.uid === es.dragUid)
            if (draggedItem) {
              const entry = getCatalogEntry(draggedItem.type)
              if (entry) {
                const ghostCol = es.ghostCol - es.dragOffsetCol
                const ghostRow = es.ghostRow - es.dragOffsetRow
                editorRender.ghostSprite = entry.sprite
                editorRender.ghostCol = ghostCol
                editorRender.ghostRow = ghostRow
                editorRender.ghostValid = canPlaceFurniture(
                  os.getLayout(),
                  draggedItem.type,
                  ghostCol,
                  ghostRow,
                  es.dragUid,
                )
              }
            }
          }

          // Selection highlight
          if (es.selectedFurnitureUid && !es.isDragMoving) {
            const item = os.getLayout().furniture.find((f) => f.uid === es.selectedFurnitureUid)
            if (item) {
              const entry = getCatalogEntry(item.type)
              if (entry) {
                editorRender.hasSelection = true
                editorRender.selectedCol = item.col
                editorRender.selectedRow = item.row
                editorRender.selectedW = entry.footprintW
                editorRender.selectedH = entry.footprintH
                editorRender.isRotatable = isRotatable(item.type)
              }
            }
          }
        }

        // Camera follow: smoothly center on followed agent
        if (os.cameraFollowId !== null) {
          const followCh = os.characters.get(os.cameraFollowId)
          if (followCh) {
            const layout = os.getLayout()
            const mapW = layout.cols * TILE_SIZE * z
            const mapH = layout.rows * TILE_SIZE * z
            const targetX = mapW / 2 - followCh.x * z
            const targetY = mapH / 2 - followCh.y * z
            const dx = targetX - panRef.current.x
            const dy = targetY - panRef.current.y
            if (Math.abs(dx) < CAMERA_FOLLOW_SNAP_THRESHOLD && Math.abs(dy) < CAMERA_FOLLOW_SNAP_THRESHOLD) {
              panRef.current = { x: targetX, y: targetY }
            } else {
              panRef.current = {
                x: panRef.current.x + dx * CAMERA_FOLLOW_LERP,
                y: panRef.current.y + dy * CAMERA_FOLLOW_LERP,
              }
            }
          }
        }

        // Build selection render state
        const selectionRender: SelectionRenderState = {
          selectedAgentId: os.selectedAgentId,
          hoveredAgentId: os.hoveredAgentId,
          hoveredTile: os.hoveredTile,
          seats: os.seats,
          characters: os.characters,
        }

        const { offsetX, offsetY } = renderFrame(
          ctx,
          w,
          h,
          os.tileMap,
          os.furniture,
          os.getCharacters(),
          z,
          panRef.current.x,
          panRef.current.y,
          selectionRender,
          editorRender,
          os.getLayout().tileColors,
          os.getLayout().cols,
          os.getLayout().rows,
        )
        offsetRef.current = { x: offsetX, y: offsetY }

        // Store delete/rotate button bounds for hit-testing
        deleteButtonBoundsRef.current = editorRender?.deleteButtonBounds ?? null
        rotateButtonBoundsRef.current = editorRender?.rotateButtonBounds ?? null
      },
    })

    return () => {
      stop()
      observer.disconnect()
    }
  }, [resizeCanvas, panRef])

  // Convert CSS mouse coords to world (sprite pixel) coords
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      // CSS coords relative to canvas
      const cssX = clientX - rect.left
      const cssY = clientY - rect.top
      // Convert to device pixels
      const deviceX = cssX * dpr
      const deviceY = cssY * dpr
      // Convert to world (sprite pixel) coords
      const worldX = (deviceX - offsetRef.current.x) / zoom
      const worldY = (deviceY - offsetRef.current.y) / zoom
      return { worldX, worldY, screenX: cssX, screenY: cssY, deviceX, deviceY }
    },
    [zoom],
  )

  const screenToTile = useCallback(
    (clientX: number, clientY: number): { col: number; row: number } | null => {
      const pos = screenToWorld(clientX, clientY)
      if (!pos) return null
      const col = Math.floor(pos.worldX / TILE_SIZE)
      const row = Math.floor(pos.worldY / TILE_SIZE)
      const layout = officeState.getLayout()
      // In edit mode with floor/wall/erase tool, extend valid range by 1 for ghost border
      if (isEditMode && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
        if (col < -1 || col > layout.cols || row < -1 || row > layout.rows) return null
        return { col, row }
      }
      if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return null
      return { col, row }
    },
    [screenToWorld, officeState, isEditMode, editorState],
  )

  // Check if device-pixel coords hit the delete button
  const hitTestDeleteButton = useCallback((deviceX: number, deviceY: number): boolean => {
    const bounds = deleteButtonBoundsRef.current
    if (!bounds) return false
    const dx = deviceX - bounds.cx
    const dy = deviceY - bounds.cy
    return (dx * dx + dy * dy) <= (bounds.radius + 2) * (bounds.radius + 2) // small padding
  }, [])

  // Check if device-pixel coords hit the rotate button
  const hitTestRotateButton = useCallback((deviceX: number, deviceY: number): boolean => {
    const bounds = rotateButtonBoundsRef.current
    if (!bounds) return false
    const dx = deviceX - bounds.cx
    const dy = deviceY - bounds.cy
    return (dx * dx + dy * dy) <= (bounds.radius + 2) * (bounds.radius + 2)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle middle-mouse panning
      if (isPanningRef.current) {
        const dpr = window.devicePixelRatio || 1
        const dx = (e.clientX - panStartRef.current.mouseX) * dpr
        const dy = (e.clientY - panStartRef.current.mouseY) * dpr
        panRef.current = clampPan(
          panStartRef.current.panX + dx,
          panStartRef.current.panY + dy,
        )
        return
      }

      // Left-click drag to pan (non-edit mode, empty space)
      const leftStart = leftPanStartRef.current
      if (leftStart && (e.buttons & 1)) {
        const dpr = window.devicePixelRatio || 1
        const dx = (e.clientX - leftStart.mouseX) * dpr
        const dy = (e.clientY - leftStart.mouseY) * dpr
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist >= LEFT_PAN_THRESHOLD_PX) {
          didPanThisGestureRef.current = true
          officeState.cameraFollowId = null
          panRef.current = clampPan(leftStart.panX + dx, leftStart.panY + dy)
          const canvas = canvasRef.current
          if (canvas) canvas.style.cursor = 'grabbing'
        }
        return
      }

      if (isEditMode) {
        const tile = screenToTile(e.clientX, e.clientY)
        if (tile) {
          editorState.ghostCol = tile.col
          editorState.ghostRow = tile.row

          // Drag-to-move: check if cursor moved to different tile
          if (editorState.dragUid && !editorState.isDragMoving) {
            if (tile.col !== editorState.dragStartCol || tile.row !== editorState.dragStartRow) {
              editorState.isDragMoving = true
            }
          }

          // Paint on drag (tile/wall/erase paint tool only, not during furniture drag)
          if (editorState.isDragging && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE) && !editorState.dragUid) {
            onEditorTileAction(tile.col, tile.row)
          }
          // Right-click erase drag
          if (isEraseDraggingRef.current && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
            const layout = officeState.getLayout()
            if (tile.col >= 0 && tile.col < layout.cols && tile.row >= 0 && tile.row < layout.rows) {
              onEditorEraseAction(tile.col, tile.row)
            }
          }
        } else {
          editorState.ghostCol = -1
          editorState.ghostRow = -1
        }

        // Cursor: show grab during drag, pointer over delete button, crosshair otherwise
        const canvas = canvasRef.current
        if (canvas) {
          if (editorState.isDragMoving) {
            canvas.style.cursor = 'grabbing'
          } else {
            const pos = screenToWorld(e.clientX, e.clientY)
            if (pos && (hitTestDeleteButton(pos.deviceX, pos.deviceY) || hitTestRotateButton(pos.deviceX, pos.deviceY))) {
              canvas.style.cursor = 'pointer'
            } else if (editorState.activeTool === EditTool.FURNITURE_PICK && tile) {
              // Pick mode: show pointer over furniture, crosshair elsewhere
              const layout = officeState.getLayout()
              const hitFurniture = layout.furniture.find((f) => {
                const entry = getCatalogEntry(f.type)
                if (!entry) return false
                return tile.col >= f.col && tile.col < f.col + entry.footprintW && tile.row >= f.row && tile.row < f.row + entry.footprintH
              })
              canvas.style.cursor = hitFurniture ? 'pointer' : 'crosshair'
            } else if ((editorState.activeTool === EditTool.SELECT || (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.selectedFurnitureType === '')) && tile) {
              // Check if hovering over furniture
              const layout = officeState.getLayout()
              const hitFurniture = layout.furniture.find((f) => {
                const entry = getCatalogEntry(f.type)
                if (!entry) return false
                return tile.col >= f.col && tile.col < f.col + entry.footprintW && tile.row >= f.row && tile.row < f.row + entry.footprintH
              })
              canvas.style.cursor = hitFurniture ? 'grab' : 'crosshair'
            } else {
              canvas.style.cursor = 'crosshair'
            }
          }
        }
        return
      }

      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return
      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      const tile = screenToTile(e.clientX, e.clientY)
      officeState.hoveredTile = tile
      const canvas = canvasRef.current
      if (canvas) {
        let cursor = 'default'
        if (hitId !== null) {
          cursor = 'pointer'
        } else if (officeState.selectedAgentId !== null && tile) {
          // Check if hovering over a clickable seat (available or own)
          const seatId = officeState.getSeatAtTile(tile.col, tile.row)
          if (seatId) {
            const seat = officeState.seats.get(seatId)
            if (seat) {
              const selectedCh = officeState.characters.get(officeState.selectedAgentId)
              if (!seat.assigned || (selectedCh && selectedCh.seatId === seatId)) {
                cursor = 'pointer'
              }
            }
          }
        }
        canvas.style.cursor = cursor
      }
      officeState.hoveredAgentId = hitId
    },
    [officeState, screenToWorld, screenToTile, isEditMode, editorState, onEditorTileAction, onEditorEraseAction, panRef, hitTestDeleteButton, hitTestRotateButton, clampPan],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      unlockAudio()
      // Middle mouse button (button 1) starts panning
      if (e.button === 1) {
        e.preventDefault()
        // Break camera follow on manual pan
        officeState.cameraFollowId = null
        isPanningRef.current = true
        panStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'grabbing'
        return
      }

      // Left-click (non-edit): record start for possible drag-to-pan (only when not over an agent)
      if (e.button === 0 && !isEditMode) {
        didPanThisGestureRef.current = false
        const pos = screenToWorld(e.clientX, e.clientY)
        const hitId = pos ? officeState.getCharacterAt(pos.worldX, pos.worldY) : null
        if (hitId === null) {
          leftPanStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            panX: panRef.current.x,
            panY: panRef.current.y,
          }
        } else {
          leftPanStartRef.current = null
        }
      }

      // Right-click in edit mode for erasing
      if (e.button === 2 && isEditMode) {
        const tile = screenToTile(e.clientX, e.clientY)
        if (tile && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
          const layout = officeState.getLayout()
          if (tile.col >= 0 && tile.col < layout.cols && tile.row >= 0 && tile.row < layout.rows) {
            isEraseDraggingRef.current = true
            onEditorEraseAction(tile.col, tile.row)
          }
        }
        return
      }

      if (!isEditMode) return

      // Check rotate/delete button hit first
      const pos = screenToWorld(e.clientX, e.clientY)
      if (pos && hitTestRotateButton(pos.deviceX, pos.deviceY)) {
        onRotateSelected()
        return
      }
      if (pos && hitTestDeleteButton(pos.deviceX, pos.deviceY)) {
        onDeleteSelected()
        return
      }

      const tile = screenToTile(e.clientX, e.clientY)

      // SELECT tool (or furniture tool with nothing selected): check for furniture hit to start drag
      const actAsSelect = editorState.activeTool === EditTool.SELECT ||
        (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.selectedFurnitureType === '')
      if (actAsSelect && tile) {
        const layout = officeState.getLayout()
        // Find all furniture at clicked tile, prefer surface items (on top of desks)
        let hitFurniture = null as typeof layout.furniture[0] | null
        for (const f of layout.furniture) {
          const entry = getCatalogEntry(f.type)
          if (!entry) continue
          if (tile.col >= f.col && tile.col < f.col + entry.footprintW && tile.row >= f.row && tile.row < f.row + entry.footprintH) {
            if (!hitFurniture || entry.canPlaceOnSurfaces) hitFurniture = f
          }
        }
        if (hitFurniture) {
          // Start drag — record offset from furniture's top-left
          editorState.startDrag(
            hitFurniture.uid,
            tile.col,
            tile.row,
            tile.col - hitFurniture.col,
            tile.row - hitFurniture.row,
          )
          return
        } else {
          // Clicked empty space — deselect
          editorState.clearSelection()
          onEditorSelectionChange()
        }
      }

      // Non-select tools: start paint drag
      editorState.isDragging = true
      if (tile) {
        onEditorTileAction(tile.col, tile.row)
      }
    },
    [officeState, isEditMode, editorState, screenToTile, screenToWorld, onEditorTileAction, onEditorEraseAction, onEditorSelectionChange, onDeleteSelected, onRotateSelected, hitTestDeleteButton, hitTestRotateButton, panRef],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        isPanningRef.current = false
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = isEditMode ? 'crosshair' : 'default'
        return
      }
      if (e.button === 0) {
        leftPanStartRef.current = null
      }
      if (e.button === 2) {
        isEraseDraggingRef.current = false
        return
      }

      // Handle drag-to-move completion
      if (editorState.dragUid) {
        if (editorState.isDragMoving) {
          // Compute target position
          const ghostCol = editorState.ghostCol - editorState.dragOffsetCol
          const ghostRow = editorState.ghostRow - editorState.dragOffsetRow
          const draggedItem = officeState.getLayout().furniture.find((f) => f.uid === editorState.dragUid)
          if (draggedItem) {
            const valid = canPlaceFurniture(
              officeState.getLayout(),
              draggedItem.type,
              ghostCol,
              ghostRow,
              editorState.dragUid,
            )
            if (valid) {
              onDragMove(editorState.dragUid, ghostCol, ghostRow)
            }
          }
          editorState.clearSelection()
        } else {
          // Click (no movement) — toggle selection
          if (editorState.selectedFurnitureUid === editorState.dragUid) {
            editorState.clearSelection()
          } else {
            editorState.selectedFurnitureUid = editorState.dragUid
          }
        }
        editorState.clearDrag()
        onEditorSelectionChange()
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'crosshair'
        return
      }

      editorState.isDragging = false
      editorState.wallDragAdding = null
    },
    [editorState, isEditMode, officeState, onDragMove, onEditorSelectionChange],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditMode) return // handled by mouseDown/mouseUp
      if (didPanThisGestureRef.current) {
        didPanThisGestureRef.current = false
        return
      }
      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return

      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      if (hitId !== null) {
        officeState.dismissBubble(hitId)
        if (officeState.selectedAgentId === hitId) {
          officeState.selectedAgentId = null
          officeState.cameraFollowId = null
          onClick(null)
        } else {
          officeState.selectedAgentId = hitId
          officeState.cameraFollowId = hitId
          onClick(hitId)
        }
        return
      }

      // No agent hit — check seat click while agent is selected
      if (officeState.selectedAgentId !== null) {
        const selectedCh = officeState.characters.get(officeState.selectedAgentId)
        // Skip seat reassignment for sub-agents
        if (selectedCh && !selectedCh.isSubagent) {
          const tile = screenToTile(e.clientX, e.clientY)
          if (tile) {
            const seatId = officeState.getSeatAtTile(tile.col, tile.row)
            if (seatId) {
              const seat = officeState.seats.get(seatId)
              if (seat && selectedCh) {
                if (selectedCh.seatId === seatId) {
                  officeState.sendToSeat(officeState.selectedAgentId)
                  officeState.selectedAgentId = null
                  officeState.cameraFollowId = null
                  onClick(null)
                  return
                } else                 if (!seat.assigned) {
                  officeState.reassignSeat(officeState.selectedAgentId, seatId)
                  officeState.selectedAgentId = null
                  officeState.cameraFollowId = null
                  const seats: Record<number, { palette: number; seatId: string | null }> = {}
                  for (const ch of officeState.characters.values()) {
                    if (ch.isSubagent) continue
                    seats[ch.id] = { palette: ch.palette, seatId: ch.seatId }
                  }
                  onSaveAgentSeats?.(seats)
                  onClick(null)
                  return
                }
              }
            }
          }
        }
        officeState.selectedAgentId = null
        officeState.cameraFollowId = null
        onClick(null)
      }
    },
    [officeState, onClick, screenToWorld, screenToTile, isEditMode, onSaveAgentSeats],
  )

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false
    leftPanStartRef.current = null
    isEraseDraggingRef.current = false
    editorState.isDragging = false
    editorState.wallDragAdding = null
    editorState.clearDrag()
    editorState.ghostCol = -1
    editorState.ghostRow = -1
    officeState.hoveredAgentId = null
    officeState.hoveredTile = null
  }, [officeState, editorState])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (isEditMode) return
    // Right-click to walk selected agent to tile
    if (officeState.selectedAgentId !== null) {
      const tile = screenToTile(e.clientX, e.clientY)
      if (tile) {
        officeState.walkToTile(officeState.selectedAgentId, tile.col, tile.row)
      }
    }
  }, [isEditMode, officeState, screenToTile])

  // Wheel: Ctrl+wheel to zoom, plain wheel/trackpad to pan. Use native listener with
  // { passive: false } so preventDefault() is allowed (React's onWheel is passive).
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        zoomAccumulatorRef.current += e.deltaY
        if (Math.abs(zoomAccumulatorRef.current) >= ZOOM_SCROLL_THRESHOLD) {
          const delta = zoomAccumulatorRef.current < 0 ? 1 : -1
          zoomAccumulatorRef.current = 0
          const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta))
          if (newZoom !== zoom) {
            onZoomChange(newZoom)
          }
        }
      } else {
        const dpr = window.devicePixelRatio || 1
        officeState.cameraFollowId = null
        panRef.current = clampPan(
          panRef.current.x - e.deltaX * dpr,
          panRef.current.y - e.deltaY * dpr,
        )
      }
    },
    [zoom, onZoomChange, officeState, panRef, clampPan],
  )
  const handleWheelRef = useRef(handleWheel)
  handleWheelRef.current = handleWheel
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => handleWheelRef.current(e)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Prevent default middle-click browser behavior (auto-scroll)
  const handleAuxClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) e.preventDefault()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#1E1E2E',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{ display: 'block' }}
      />
    </div>
  )
}
