---
name: intel-management
description: Query and manage the Intel SQLite database — run queries, insert, update, and delete structured data.
---

# Intel Management

Interact with the Intel database (SQLite) on the active device for structured
data storage and retrieval.

## When to use

- User needs to query structured data
- Storing or updating intelligence records
- Running analytics or reports on collected data
- Database maintenance operations

## Workflows

### Query Data
1. Call `intel.query(sqlQuery)` for SELECT queries
2. Returns rows as array of objects
3. Present results in a table format

### Insert a Record
1. Call `intel.insert(tableName, { field: value, ... })`
2. Returns the new record ID

### Update a Record
1. Call `intel.update(tableName, recordId, { field: value, ... })`
2. Confirm the update

### Delete a Record
1. Call `intel.delete(tableName, recordId)`
2. Confirm deletion

### Execute Raw SQL
1. Call `intel.execute(sql)` for DDL or complex mutations — **180s timeout**
2. Use for CREATE TABLE, ALTER TABLE, complex JOINs, etc.
3. Be careful: this can modify schema

## Important

- `intel.query()` is for reads (SELECT) — 60s timeout
- `intel.execute()` is for writes and DDL — **180s timeout**
- The Intel DB is SQLite running locally on the device
- Always use parameterized queries to prevent SQL injection when user input is involved
- The schema varies per device — query `sqlite_master` to discover tables
