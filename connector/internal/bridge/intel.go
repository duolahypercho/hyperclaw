package bridge

// Intel bridge handlers — maps bridge actions to IntelStore methods.

func (b *BridgeHandler) intelSchema() actionResult {
	if b.intel == nil {
		return errResult("Intel DB not available")
	}
	tables, err := b.intel.Schema()
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(map[string]interface{}{
		"tables": tables,
	})
}

func (b *BridgeHandler) intelQuery(params map[string]interface{}) actionResult {
	if b.intel == nil {
		return errResult("Intel DB not available")
	}
	sql, _ := params["sql"].(string)
	if sql == "" {
		return errResult("missing sql parameter")
	}
	result, err := b.intel.Query(sql)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(result)
}

func (b *BridgeHandler) intelExecute(params map[string]interface{}) actionResult {
	if b.intel == nil {
		return errResult("Intel DB not available")
	}
	sql, _ := params["sql"].(string)
	if sql == "" {
		return errResult("missing sql parameter")
	}
	agentID, _ := params["agent_id"].(string)
	result, err := b.intel.Execute(sql, agentID)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(result)
}

func (b *BridgeHandler) intelInsert(params map[string]interface{}) actionResult {
	if b.intel == nil {
		return errResult("Intel DB not available")
	}
	table, _ := params["table"].(string)
	if table == "" {
		return errResult("missing table parameter")
	}
	data, _ := params["data"].(map[string]interface{})
	if data == nil {
		return errResult("missing data parameter")
	}
	agentID, _ := params["agent_id"].(string)
	result, err := b.intel.Insert(table, data, agentID)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(result)
}

func (b *BridgeHandler) intelUpdate(params map[string]interface{}) actionResult {
	if b.intel == nil {
		return errResult("Intel DB not available")
	}
	table, _ := params["table"].(string)
	if table == "" {
		return errResult("missing table parameter")
	}
	data, _ := params["data"].(map[string]interface{})
	if data == nil {
		return errResult("missing data parameter")
	}
	where, _ := params["where"].(map[string]interface{})
	if where == nil {
		return errResult("missing where parameter")
	}
	result, err := b.intel.Update(table, data, where)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(result)
}

func (b *BridgeHandler) intelDelete(params map[string]interface{}) actionResult {
	if b.intel == nil {
		return errResult("Intel DB not available")
	}
	table, _ := params["table"].(string)
	if table == "" {
		return errResult("missing table parameter")
	}
	where, _ := params["where"].(map[string]interface{})
	if where == nil {
		return errResult("missing where parameter")
	}
	result, err := b.intel.Delete(table, where)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(result)
}

