"""installer.cli — thin command surface that calls the connector's bridge.

The connector owns every adapter install/uninstall/status mutation. This
module's only job is parsing argv, resolving a target workspace, and
POSTing JSON to /bridge. Keeping the logic on the Go side prevents drift
between dashboard-driven installs and CLI-driven ones.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

# Runtimes the connector currently supports. Authoritative list lives in
# internal/bridge/agentic_stack.go (agenticStackBuiltinAdapters); this
# mirror is just for help text and early validation. Drift is annoying
# but not dangerous — the bridge rejects unknown adapters with a clear
# error, so a stale list here just trades one error for another.
RUNTIMES = (
    "claude-code",
    "codex",
    "openclaw",
    "hermes",
    "cursor",
    "windsurf",
    "opencode",
    "antigravity",
    "pi",
    "standalone-python",
)

DEFAULT_BRIDGE = "http://127.0.0.1:18790/bridge"


def _bridge_url() -> str:
    return os.environ.get("HYPERCLAW_BRIDGE_URL", DEFAULT_BRIDGE)


def _default_target() -> str:
    """Pick the workspace directory the bridge would compute itself.

    The bridge resolves targetRoot from {runtime, agentId} when none is
    passed. We mirror that fallback so `./install.sh claude-code` from
    inside any project lands in a predictable, dashboard-visible profile.
    """
    home = Path.home()
    cwd_name = Path.cwd().name or "default"
    return str(home / ".hyperclaw" / "agents" / cwd_name)


def _post(payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        _bridge_url(),
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        sys.stderr.write(
            f"error: connector bridge not reachable at {_bridge_url()}\n"
            f"       is the connector running? ({e.reason})\n"
        )
        sys.exit(2)


def _print_result(verb: str, runtime: str | None, body: dict[str, Any]) -> int:
    """Render the bridge response. Bridge always returns 200 with a JSON
    envelope of {success, ...}; non-success means a logical install failure
    (unknown runtime, path collision, post-install warning), which we
    surface as a non-zero exit so scripts can chain ./install.sh && ...
    """
    success = bool(body.get("success", False))
    if not success:
        err = body.get("error") or body
        sys.stderr.write(f"{verb} failed: {err}\n")
        return 1
    suffix = f" {runtime}" if runtime else ""
    print(f"✓ {verb}{suffix}")
    if "targetRoot" in body:
        print(f"  workspace: {body['targetRoot']}")
    if "logs" in body and isinstance(body["logs"], list):
        for entry in body["logs"]:
            level = entry.get("level", "info")
            msg = entry.get("message", "")
            print(f"  [{level}] {msg}")
    return 0


def _resolve_target(args: list[str]) -> str:
    return args[0] if args else _default_target()


def _print_help() -> None:
    print(__doc__ or "installer", file=sys.stderr)
    print(
        "\nUsage:\n"
        "  install.sh <runtime> [target]\n"
        "  install.sh add <runtime> [target]\n"
        "  install.sh remove <runtime> [target]\n"
        "  install.sh status [target]\n"
        "  install.sh doctor [target]\n"
        "\nRuntimes: " + ", ".join(RUNTIMES),
        file=sys.stderr,
    )


def main(argv: list[str]) -> int:
    if not argv:
        # Bare invocation: list available runtimes via the bridge so the
        # local list of names matches whatever the running connector
        # actually supports.
        body = _post({"action": "agentic-stack-adapter-list"})
        _print_result("list", None, body)
        adapters = body.get("adapters") or []
        for entry in adapters:
            name = entry.get("name", "?")
            installed = "installed" if entry.get("installed") else "available"
            print(f"  {name:20s} {installed}")
        return 0

    verb = argv[0]
    rest = argv[1:]

    if verb in {"-h", "--help", "help"}:
        _print_help()
        return 0

    if verb == "doctor":
        target = _resolve_target(rest)
        body = _post({"action": "agentic-stack-doctor", "targetRoot": target})
        return _print_result("doctor", None, body)

    if verb == "status":
        target = _resolve_target(rest)
        body = _post({"action": "agentic-stack-status", "targetRoot": target})
        return _print_result("status", None, body)

    if verb in {"add", "install"}:
        if not rest:
            sys.stderr.write(f"error: '{verb}' requires a runtime name\n")
            return 2
        runtime = rest[0]
        target = _resolve_target(rest[1:])
        body = _post(
            {
                "action": "agentic-stack-adapter-add",
                "adapter": runtime,
                "targetRoot": target,
            }
        )
        return _print_result("install", runtime, body)

    if verb in {"remove", "uninstall"}:
        if not rest:
            sys.stderr.write("error: 'remove' requires a runtime name\n")
            return 2
        runtime = rest[0]
        target = _resolve_target(rest[1:])
        body = _post(
            {
                "action": "agentic-stack-adapter-remove",
                "adapter": runtime,
                "targetRoot": target,
            }
        )
        return _print_result("remove", runtime, body)

    # Bare runtime name → install.
    if verb in RUNTIMES:
        target = _resolve_target(rest)
        body = _post(
            {
                "action": "agentic-stack-adapter-add",
                "adapter": verb,
                "targetRoot": target,
            }
        )
        return _print_result("install", verb, body)

    sys.stderr.write(f"error: unknown verb or runtime '{verb}'\n")
    _print_help()
    return 2
