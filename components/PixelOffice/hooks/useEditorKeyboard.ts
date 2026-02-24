import { useEffect } from 'react'
import type { EditorState } from '../office/editor/editorState'
import { EditTool } from '../office/types'

export function useEditorKeyboard(
  isEditMode: boolean,
  editorState: EditorState,
  onDeleteSelected: () => void,
  onRotateSelected: () => void,
  onToggleState: () => void,
  onUndo: () => void,
  onRedo: () => void,
  onEditorTick: () => void,
  onCloseEditMode: () => void,
): void {
  useEffect(() => {
    if (!isEditMode) return
    const isInputFocused = () => {
      const el = document.activeElement
      if (!el || !(el instanceof HTMLElement)) return false
      const tag = el.tagName.toLowerCase()
      const role = el.getAttribute?.('role')
      const editable = (el as HTMLElement).isContentEditable
      return tag === 'input' || tag === 'textarea' || tag === 'select' || role === 'textbox' || editable
    }
    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return
      if (e.key === 'Escape') {
        // Multi-stage Esc: deselect item → close tool → deselect placed → close editor
        if (editorState.activeTool === EditTool.FURNITURE_PICK) {
          editorState.activeTool = EditTool.FURNITURE_PLACE
          editorState.clearGhost()
        } else if (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.selectedFurnitureType !== '') {
          editorState.selectedFurnitureType = ''
          editorState.clearGhost()
        } else if (editorState.activeTool !== EditTool.SELECT) {
          editorState.activeTool = EditTool.SELECT
          editorState.clearGhost()
        } else if (editorState.selectedFurnitureUid) {
          editorState.clearSelection()
        } else {
          onCloseEditMode()
          return
        }
        editorState.clearDrag()
        onEditorTick()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editorState.selectedFurnitureUid) {
          onDeleteSelected()
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        onRotateSelected()
      } else if (e.key === 't' || e.key === 'T') {
        onToggleState()
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        onUndo()
      } else if (
        (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault()
        onRedo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditMode, editorState, onDeleteSelected, onRotateSelected, onToggleState, onUndo, onRedo, onEditorTick, onCloseEditMode])
}
