"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { OfficeCanvas } from "./office/components/OfficeCanvas";
import { ToolOverlay } from "./office/components/ToolOverlay";
import { EditorToolbar } from "./office/editor/EditorToolbar";
import { EditorState } from "./office/editor/editorState";
import { EditTool } from "./office/types";
import { isRotatable } from "./office/layout/furnitureCatalog";
import { PULSE_ANIMATION_DURATION_SEC } from "./constants";
import { useEditorActions } from "./hooks/useEditorActions";
import { useEditorKeyboard } from "./hooks/useEditorKeyboard";
import { ZoomControls } from "./ZoomControls";
import { PixelOfficeToolbar } from "./PixelOfficeToolbar";
import { AgentInfoPanel } from "./AgentInfoPanel";
import { DebugView } from "./DebugView";
import { useHyperclawOffice } from "./useHyperclawOffice";
import { loadSoundPreference } from "./HyperclawSettingsModal";
import { setSoundEnabled } from "./notificationSound";
import { vscode } from "./vscodeApi";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { getOfficeState, LAYOUT_STORAGE_KEY } from "./officeStateSingleton";

const actionBarBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: "22px",
  background: "var(--pixel-btn-bg)",
  color: "var(--pixel-text-dim)",
  border: "2px solid transparent",
  borderRadius: 0,
  cursor: "pointer",
};

const actionBarBtnDisabled: React.CSSProperties = {
  ...actionBarBtnStyle,
  opacity: "var(--pixel-btn-disabled-opacity)",
  cursor: "default",
};

function EditActionBar({
  editor,
  editorState: es,
}: {
  editor: ReturnType<typeof useEditorActions>;
  editorState: EditorState;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const undoDisabled = es.undoStack.length === 0;
  const redoDisabled = es.redoStack.length === 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "var(--pixel-controls-z)",
        display: "flex",
        gap: 4,
        alignItems: "center",
        background: "var(--pixel-bg)",
        border: "2px solid var(--pixel-border)",
        borderRadius: 0,
        padding: "4px 8px",
        boxShadow: "var(--pixel-shadow)",
      }}
    >
      <button
        style={undoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={undoDisabled ? undefined : editor.handleUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={redoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={redoDisabled ? undefined : editor.handleRedo}
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button style={actionBarBtnStyle} onClick={editor.handleSave} title="Save layout">
        Save
      </button>
      {!showResetConfirm ? (
        <button
          style={actionBarBtnStyle}
          onClick={() => setShowResetConfirm(true)}
          title="Reset to last saved layout"
        >
          Reset
        </button>
      ) : (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: "22px", color: "var(--pixel-reset-text)" }}>Reset?</span>
          <button
            style={{ ...actionBarBtnStyle, background: "var(--pixel-danger-bg)", color: "#fff" }}
            onClick={() => {
              setShowResetConfirm(false);
              editor.handleReset();
            }}
          >
            Yes
          </button>
          <button style={actionBarBtnStyle} onClick={() => setShowResetConfirm(false)}>
            No
          </button>
        </div>
      )}
    </div>
  );
}

export interface FullOfficeViewProps {
  /** When true, hide toolbars/zoom/edit UI for embedding in dashboard widget. */
  embedMode?: boolean;
}

export function FullOfficeView(props: FullOfficeViewProps = {}) {
  const { embedMode = false } = props;
  const editorState = useMemo(() => new EditorState(), []);
  const editor = useEditorActions(getOfficeState, editorState);

  React.useEffect(() => {
    setSoundEnabled(loadSoundPreference());
  }, []);

  const handleApplyLayout = useCallback((layout: import("./office/types").OfficeLayout) => {
    const os = getOfficeState();
    os.rebuildFromLayout(layout, undefined, true);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {}
  }, []);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty]
  );

  const {
    agents,
    selectedAgent: _selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    loadedAssets,
    getAgentByCharacterId,
  } = useHyperclawOffice(getOfficeState, editor.setLastSavedLayout);

  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleSelectAgent = useCallback((id: number) => setSelectedAgentId(id), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);

  useEffect(() => {
    getOfficeState().selectedAgentId = selectedAgentId;
    getOfficeState().cameraFollowId = selectedAgentId;
  }, [selectedAgentId]);

  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode
  );

  const handleCloseAgent = useCallback((_id: number) => {
    setSelectedAgentId(null);
    getOfficeState().selectedAgentId = null;
    getOfficeState().cameraFollowId = null;
  }, []);
  const handleClick = useCallback((agentId: number | null) => {
    setSelectedAgentId(agentId);
  }, []);

  const selectedAgentInfo = selectedAgentId != null ? getAgentByCharacterId(selectedAgentId) : null;

  const agentNames = useMemo(() => {
    const m: Record<number, string> = {};
    agents.forEach((charId) => {
      const info = getAgentByCharacterId(charId);
      m[charId] = info?.name ?? info?.id ?? String(charId);
    });
    subagentCharacters.forEach((s) => {
      m[s.id] = s.label;
    });
    return m;
  }, [agents, subagentCharacters, getAgentByCharacterId]);

  const handleCloseAgentInfo = useCallback(() => {
    setSelectedAgentId(null);
    getOfficeState().selectedAgentId = null;
    getOfficeState().cameraFollowId = null;
  }, []);

  const officeState = getOfficeState();
  void editorTickForKeyboard;

  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item && isRotatable(item.type)) return true;
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        isRotatable(editorState.selectedFurnitureType)
      ) {
        return true;
      }
      return false;
    })();

  if (!layoutReady) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        Loading office…
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="pixel-office-root"
      style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}
    >
      <style>{`
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .pixel-agents-pulse { animation: pixel-agents-pulse ${PULSE_ANIMATION_DURATION_SEC}s ease-in-out infinite; }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
        onSaveAgentSeats={(seats) => {
          vscode.postMessage({ type: "saveAgentSeats", seats });
          if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { hyperClawBridge?: { invoke?: unknown } } }).electronAPI?.hyperClawBridge?.invoke) {
            bridgeInvoke("write-office-seats", { seats }).catch(() => {});
          }
        }}
      />

      {!embedMode && (
        <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />
      )}

      {selectedAgentId != null && (
        <AgentInfoPanel
          key={selectedAgentId}
          agent={selectedAgentInfo}
          onClose={handleCloseAgentInfo}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--pixel-vignette)",
          pointerEvents: "none",
          zIndex: 40,
        }}
      />

      {!embedMode && (
        <PixelOfficeToolbar
          isEditMode={editor.isEditMode}
          onToggleEditMode={editor.handleToggleEditMode}
          isDebugMode={isDebugMode}
          onToggleDebugMode={handleToggleDebugMode}
          getLayout={() => getOfficeState().getLayout()}
          onApplyLayout={handleApplyLayout}
          agentCount={agents.length}
        />
      )}

      {!embedMode && editor.isEditMode && editor.isDirty && (
        <EditActionBar editor={editor} editorState={editorState} />
      )}

      {!embedMode && showRotateHint && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: editor.isDirty ? "translateX(calc(-50% + 100px))" : "translateX(-50%)",
            zIndex: 49,
            background: "var(--pixel-hint-bg)",
            color: "#fff",
            fontSize: "20px",
            padding: "3px 8px",
            borderRadius: 0,
            border: "2px solid var(--pixel-accent)",
            boxShadow: "var(--pixel-shadow)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Press <b>R</b> to rotate
        </div>
      )}

      {!embedMode && editor.isEditMode &&
        (() => {
          const selUid = editorState.selectedFurnitureUid;
          const selColor = selUid
            ? officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null
            : null;
          return (
            <EditorToolbar
              activeTool={editorState.activeTool}
              selectedTileType={editorState.selectedTileType}
              selectedFurnitureType={editorState.selectedFurnitureType}
              selectedFurnitureUid={selUid}
              selectedFurnitureColor={selColor}
              floorColor={editorState.floorColor}
              wallColor={editorState.wallColor}
              onToolChange={editor.handleToolChange}
              onTileTypeChange={editor.handleTileTypeChange}
              onFloorColorChange={editor.handleFloorColorChange}
              onWallColorChange={editor.handleWallColorChange}
              onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
              onFurnitureTypeChange={editor.handleFurnitureTypeChange}
              showRotateButton={showRotateHint}
              onRotateSelected={editor.handleRotateSelected}
              loadedAssets={loadedAssets}
            />
          );
        })()}

      <ToolOverlay
        officeState={officeState}
        agents={agents}
        agentTools={agentTools}
        subagentCharacters={subagentCharacters}
        agentNames={agentNames}
        containerRef={containerRef}
        zoom={editor.zoom}
        panRef={editor.panRef}
        onCloseAgent={handleCloseAgent}
      />

      {!embedMode && isDebugMode && (
        <DebugView
          agents={agents}
          selectedAgent={selectedAgentId}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          subagentTools={subagentTools}
          onSelectAgent={handleSelectAgent}
        />
      )}
    </div>
  );
}
