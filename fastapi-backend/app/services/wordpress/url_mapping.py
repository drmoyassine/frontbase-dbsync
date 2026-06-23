"""
WordPress → Frontbase URL redirect mapping.

During import each record's WordPress ``permalink`` is mapped to its new
Frontbase URL so a redirect table can be generated (preserves SEO + inbound
links). The new-URL scheme is configurable; the default mirrors the source
structure to minimise broken links.

The output is a flat ``{old_url: new_url}`` dict that can be serialised to
JSON / CSV / nginx map / .htaccess by a downstream exporter.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional
from urllib.parse import urljoin, urlparse


class WordPressUrlMappingService:
    """Builds old → new URL redirect tables for imported WordPress content."""

    def __init__(self, target_base_url: Optional[str] = None) -> None:
        """
        Args:
            target_base_url: Origin of the new Frontbase site
                (e.g. ``https://example.frontbase.app``). When omitted, the
                new URL is built as a relative path so it can be rebased later.
        """
        self.target_base_url = (target_base_url or "").rstrip("/")

    def build_for_record(
        self,
        record: Dict[str, Any],
        post_type: str,
        url_pattern: str = "/{post_type}/{slug}",
    ) -> Optional[Dict[str, str]]:
        """Return ``{old: new}`` for a single record, or ``None`` if unmappable."""
        old_url = record.get("permalink") or ""
        slug = record.get("slug") or ""
        if not old_url or not slug:
            return None

        new_path = url_pattern.format(post_type=post_type, slug=slug, id=record.get("id", ""))
        new_url = (
            urljoin(self.target_base_url + "/", new_path.lstrip("/"))
            if self.target_base_url
            else new_path
        )
        return {self._normalise(old_url): new_url}

    def build_for_records(
        self,
        records: Iterable[Dict[str, Any]],
        post_type: str,
        url_pattern: str = "/{post_type}/{slug}",
    ) -> Dict[str, str]:
        """Aggregate mappings across many records of one post type."""
        mapping: Dict[str, str] = {}
        for record in records:
            single = self.build_for_record(record, post_type, url_pattern)
            if single:
                mapping.update(single)
        return mapping

    @staticmethod
    def _normalise(url: str) -> str:
        """Strip query/fragment and trailing slash for stable redirect keys."""
        parsed = urlparse(url.strip())
        path = parsed.path or "/"
        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")
        return f"{parsed.scheme}://{parsed.netloc}{path}"

    def to_csv(self, mapping: Dict[str, str]) -> str:
        """Render a mapping as ``old,new`` CSV (header included)."""
        lines = ["old_url,new_url"]
        for old, new in mapping.items():
            lines.append(f"{old},{new}")
        return "\n".join(lines)

    def to_nginx_map(self, mapping: Dict[str, str]) -> str:
        """Render a mapping as an nginx ``map`` block for ``return 301``."""
        lines = ["map $request_uri $frontbase_redirect {"]
        for old, new in mapping.items():
            uri = urlparse(old).path or "/"
            if uri != "/" and uri.endswith("/"):
                uri = uri.rstrip("/")
            lines.append(f'    "{uri}$" "{new}";')
        lines.append("}")
        return "\n".join(lines)
