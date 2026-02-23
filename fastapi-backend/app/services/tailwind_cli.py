"""
Tailwind CLI Binary Manager

Auto-provisioning of the standalone Tailwind CSS v4 CLI binary.
Downloads and caches the platform-specific binary from GitHub releases
if not already available on PATH or in the local bin/ directory.
"""

import os
import platform
import shutil
import stat
from typing import Optional

import httpx

# Module-level cache for the resolved binary path
_TAILWIND_BIN: Optional[str] = None


def _get_bin_dir() -> str:
    """Get the local bin/ directory (inside fastapi-backend/)."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    bin_dir = os.path.join(base_dir, "bin")
    os.makedirs(bin_dir, exist_ok=True)
    return bin_dir


def _get_target_binary_name() -> str:
    """Determine the platform-specific Tailwind CLI binary name."""
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "windows":
        return "tailwindcss-windows-x64.exe"
    elif system == "darwin":
        return "tailwindcss-macos-arm64" if machine == "arm64" else "tailwindcss-macos-x64"
    else:
        return "tailwindcss-linux-arm64" if machine in ("arm64", "aarch64") else "tailwindcss-linux-x64"


async def ensure_tailwind_cli() -> Optional[str]:
    """
    Ensure Tailwind CSS v4 standalone CLI is available and return its path.
    
    Resolution order:
    1. Module-level cached path (fastest, already resolved)
    2. System PATH (via shutil.which)
    3. Local bin/ directory (pre-downloaded binary)
    4. Auto-download from GitHub releases (first-time only)
    
    Returns:
        Path to the tailwindcss binary, or None if unavailable.
    """
    global _TAILWIND_BIN
    if _TAILWIND_BIN and os.path.isfile(_TAILWIND_BIN):
        return _TAILWIND_BIN

    # 1. Check system PATH
    system_bin = shutil.which("tailwindcss")
    if system_bin:
        _TAILWIND_BIN = system_bin
        return system_bin

    # 2. Check local bin directory
    target = _get_target_binary_name()
    local_bin = os.path.join(_get_bin_dir(), target)
    if os.path.isfile(local_bin):
        _TAILWIND_BIN = local_bin
        return local_bin

    # 3. Download if missing
    url = f"https://github.com/tailwindlabs/tailwindcss/releases/latest/download/{target}"
    print(f"[tailwind_cli] Tailwind CLI not found, downloading from {url}...")

    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(url, timeout=60.0)
            response.raise_for_status()

            with open(local_bin, "wb") as f:
                f.write(response.content)

            # Make executable on Unix
            st = os.stat(local_bin)
            os.chmod(local_bin, st.st_mode | stat.S_IEXEC)

            print(f"[tailwind_cli] ✅ Downloaded Tailwind CLI to {local_bin}")
            _TAILWIND_BIN = local_bin
            return local_bin
    except Exception as e:
        print(f"[tailwind_cli] ❌ Failed to download Tailwind CLI: {e}")
        return None
