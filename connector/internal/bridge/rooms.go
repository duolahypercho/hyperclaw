package bridge

// ── Ensemble Rooms bridge actions ─────────────────────────────────────────────
//
// Bridge action → store method mapping:
//   room-create → store.CreateRoom(id, name, emoji, memberIds)
//   room-list   → store.ListRooms()
//   room-delete → store.DeleteRoom(id)

func (b *BridgeHandler) roomCreate(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	name, _ := params["name"].(string)
	if name == "" {
		return errResultStatus("name required", 400)
	}
	emoji, _ := params["emoji"].(string)
	id, _ := params["id"].(string)

	var memberIDs []string
	if raw, ok := params["memberIds"].([]interface{}); ok {
		for _, m := range raw {
			if s, ok := m.(string); ok {
				memberIDs = append(memberIDs, s)
			}
		}
	}

	room, err := b.store.CreateRoom(id, name, emoji, memberIDs)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(room)
}

func (b *BridgeHandler) roomList(_ map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	rooms, err := b.store.ListRooms()
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(rooms)
}

func (b *BridgeHandler) roomDelete(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id required", 400)
	}
	if err := b.store.DeleteRoom(id); err != nil {
		return errResult(err.Error())
	}
	return okResult(map[string]string{"id": id})
}
