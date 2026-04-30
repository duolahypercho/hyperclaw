---
name: doc-management
description: Read and write OpenClaw documents and memory files on a device.
---

# Document Management

Manage documents in the OpenClaw file system on the active device.

## When to use

- User wants to read or write agent memory/knowledge files
- Managing project documentation
- Searching through stored knowledge
- Backing up or transferring documents between contexts

## Workflows

### List Documents
1. Call `docs.listDocs()` for all documents
2. Or `docs.listMemory()` for memory-specific documents
3. Present: path, type, last modified

### Read a Document
1. Call `docs.getDoc(path)`
2. Return the content (usually markdown)

### Write a Document
1. Prepare the content (markdown)
2. Call `docs.writeDoc(path, content)`
3. Confirm the write

### Delete a Document
1. Confirm with the user
2. Call `docs.deleteDoc(path)`

## File Organization

OpenClaw documents typically live in:
```
~/.openclaw/
├── memory/          # Agent memory files (PARA method)
│   ├── projects/
│   ├── areas/
│   ├── resources/
│   └── archive/
├── docs/            # General documents
└── agents/          # Agent-specific files
```

## Important

- Documents are stored on the device's local file system
- Memory files persist across agent sessions
- Write operations overwrite the entire file — there's no merge/diff
- Paths are relative to the OpenClaw root directory
