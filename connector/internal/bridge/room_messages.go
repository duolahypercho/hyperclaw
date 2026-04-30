package bridge

import "github.com/hypercho/hyperclaw-connector/internal/store"

// ── Room messages bridge actions (non-streaming) ──────────────────────────────
//
//   room-msg-list → store.ListRoomMessages(roomId, limit)
//   room-msg-add  → store.AddRoomMessage(...)

func (b *BridgeHandler) roomMsgList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	roomID, _ := params["roomId"].(string)
	if roomID == "" {
		return errResultStatus("roomId required", 400)
	}
	limitF, _ := params["limit"].(float64)
	limit := int(limitF)
	if limit <= 0 {
		limit = 50
	}
	msgs, err := b.store.ListRoomMessages(roomID, limit)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(msgs)
}

func (b *BridgeHandler) roomMsgAdd(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	roomID, _ := params["roomId"].(string)
	content, _ := params["content"].(string)
	if roomID == "" || content == "" {
		return errResultStatus("roomId and content required", 400)
	}
	role, _ := params["role"].(string)
	if role == "" {
		role = "user"
	}
	agentID, _ := params["agentId"].(string)
	agentName, _ := params["agentName"].(string)
	runtime, _ := params["runtime"].(string)

	msg, err := b.store.AddRoomMessage(store.RoomMessage{
		RoomID:    roomID,
		Role:      role,
		AgentID:   agentID,
		AgentName: agentName,
		Runtime:   runtime,
		Content:   content,
	})
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(msg)
}
