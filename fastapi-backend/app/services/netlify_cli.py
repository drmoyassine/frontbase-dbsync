"""Netlify CLI binary resolution and lazy installation.

Cloud edition:   CLI pre-installed system-wide → instant deploys.
Community edition: CLI installed on-demand when a Netlify provider is
                   first connected → background install, no user wait.

Resolution order:
    1. System binary (``netlify``) — Cloud edition, Dockerfile pre-install
    2. Local install (``/app/tools/node_modules/.bin/netlify``) — Community lazy-install
    3. Fallback (``npx -y netlify-cli``) — emergency, downloads ~100 MB
"""

import asyncio
import os
import shutil
import subprocess

# Local install path (outside app source, persistent across restarts)
_TOOLS_DIR = os.environ.get("FRONTBASE_TOOLS_DIR", "/app/tools")
_LOCAL_BIN = os.path.join(_TOOLS_DIR, "node_modules", ".bin", "netlify")

# Module-level dedup lock for background install
_install_lock: asyncio.Lock | None = None
_install_done = False


def _get_lock() -> asyncio.Lock:
    global _install_lock
    if _install_lock is None:
        _install_lock = asyncio.Lock()
    return _install_lock


def is_cli_installed() -> bool:
    """Check if the Netlify CLI is available (system or local)."""
    # 1. System binary
    if shutil.which("netlify"):
        return True
    # 2. Local install
    if os.path.isfile(_LOCAL_BIN):
        return True
    return False


def resolve_netlify_bin() -> str:
    """Resolve the best available Netlify CLI binary path.

    Returns a command string suitable for subprocess.
    """
    # 1. System binary (Cloud edition)
    sys_bin = shutil.which("netlify")
    if sys_bin:
        return sys_bin

    # 2. Local install (Community, pre-cached)
    if os.path.isfile(_LOCAL_BIN):
        return _LOCAL_BIN

    # 3. Fallback: npx (downloads on first use, slow)
    print("[NetlifyCLI] Warning: CLI not pre-installed, falling back to npx")
    return "npx -y netlify-cli"


async def ensure_netlify_cli() -> None:
    """Install Netlify CLI locally if not already available.

    Safe to call multiple times — deduplicates concurrent installs.
    Runs in background; callers should ``asyncio.create_task()`` this.
    """
    global _install_done

    if _install_done or is_cli_installed():
        return

    lock = _get_lock()
    async with lock:
        # Double-check after acquiring lock
        if _install_done or is_cli_installed():
            return

        print("[NetlifyCLI] Installing netlify-cli in background...")
        os.makedirs(_TOOLS_DIR, exist_ok=True)

        def _install() -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                f"npm install --prefix {_TOOLS_DIR} netlify-cli",
                shell=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=300,  # 5 min max
            )

        try:
            result = await asyncio.to_thread(_install)
            if result.returncode == 0:
                _install_done = True
                print("[NetlifyCLI] Installation complete")
            else:
                err = (result.stderr or result.stdout or "")[:300]
                print(f"[NetlifyCLI] Installation failed: {err}")
        except Exception as e:
            print(f"[NetlifyCLI] Installation error: {e}")
