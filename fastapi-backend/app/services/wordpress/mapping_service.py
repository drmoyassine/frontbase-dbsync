"""
WordPress → Frontbase mapping service.

Converts a discovery manifest (post types, custom fields, ACF groups) into
proposed Frontbase content models and sensible default field mappings that the
mapping-step UI can present and the user can adjust before importing.

This module is pure transformation — no I/O — so it is trivially unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# WordPress / ACF type → Frontbase field type
# ---------------------------------------------------------------------------
# Frontbase field type vocabulary. Kept deliberately small; the mapping UI can
# specialise further (e.g. turn an "image" reference into a media field).
FRONTBASE_TEXT = "text"
FRONTBASE_LONG_TEXT = "long_text"
FRONTBASE_RICH_TEXT = "rich_text"
FRONTBASE_NUMBER = "number"
FRONTBASE_BOOLEAN = "boolean"
FRONTBASE_DATE = "date"
FRONTBASE_DATETIME = "datetime"
FRONTBASE_JSON = "json"
FRONTBASE_MEDIA = "media"
FRONTBASE_REFERENCE = "reference"
FRONTBASE_CHOICE = "choice"
FRONTBASE_URL = "url"
FRONTBASE_EMAIL = "email"

#: ACF field type → Frontbase field type
_ACF_TYPE_MAP: Dict[str, str] = {
    "text": FRONTBASE_TEXT,
    "textarea": FRONTBASE_LONG_TEXT,
    "wysiwyg": FRONTBASE_RICH_TEXT,
    "number": FRONTBASE_NUMBER,
    "range": FRONTBASE_NUMBER,
    "email": FRONTBASE_EMAIL,
    "url": FRONTBASE_URL,
    "password": FRONTBASE_TEXT,
    "select": FRONTBASE_CHOICE,
    "radio": FRONTBASE_CHOICE,
    "checkbox": FRONTBASE_BOOLEAN,
    "true_false": FRONTBASE_BOOLEAN,
    "button_group": FRONTBASE_CHOICE,
    "date_picker": FRONTBASE_DATE,
    "date_time_picker": FRONTBASE_DATETIME,
    "time_picker": FRONTBASE_DATETIME,
    "color_picker": FRONTBASE_TEXT,
    "group": FRONTBASE_JSON,
    "repeater": FRONTBASE_JSON,
    "flexible_content": FRONTBASE_JSON,
    "clone": FRONTBASE_JSON,
    "google_map": FRONTBASE_JSON,
    "image": FRONTBASE_MEDIA,
    "file": FRONTBASE_MEDIA,
    "gallery": FRONTBASE_MEDIA,
    "relationship": FRONTBASE_REFERENCE,
    "post_object": FRONTBASE_REFERENCE,
    "page_link": FRONTBASE_REFERENCE,
    "link": FRONTBASE_URL,
    "user": FRONTBASE_REFERENCE,
    "taxonomy": FRONTBASE_REFERENCE,
    "accordion": FRONTBASE_TEXT,  # layout-only
    "tab": FRONTBASE_TEXT,        # layout-only
    "message": FRONTBASE_TEXT,
}

#: plugin-inferred meta type (string/integer/number/...) → Frontbase field type
_META_TYPE_MAP: Dict[str, str] = {
    "string": FRONTBASE_TEXT,
    "text": FRONTBASE_LONG_TEXT,
    "integer": FRONTBASE_NUMBER,
    "int": FRONTBASE_NUMBER,
    "number": FRONTBASE_NUMBER,
    "float": FRONTBASE_NUMBER,
    "double": FRONTBASE_NUMBER,
    "boolean": FRONTBASE_BOOLEAN,
    "bool": FRONTBASE_BOOLEAN,
    "array": FRONTBASE_JSON,
    "object": FRONTBASE_JSON,
    "date": FRONTBASE_DATE,
    "datetime": FRONTBASE_DATETIME,
}


@dataclass
class FieldProposal:
    """A proposed Frontbase field derived from a WordPress source field."""

    name: str
    frontbase_type: str
    source_path: str  # dot-path into the extracted record (e.g. "meta._color" or "acf.hero")
    label: str = ""
    is_acf: bool = False
    is_required: bool = False
    description: str = ""
    # Extra hints for the UI
    choices: Optional[Dict[str, str]] = None
    acf_type: Optional[str] = None


@dataclass
class ContentModelProposal:
    """A proposed Frontbase content model for one WordPress post type."""

    name: str  # Frontbase model name (slug-ified from post type)
    label: str
    source_post_type: str
    record_count: int
    hierarchical: bool
    fields: List[FieldProposal] = field(default_factory=list)


@dataclass
class FieldMappingProposal:
    """A concrete field mapping (source path → target field + coercion)."""

    frontbase_field: str
    wordpress_path: str
    transform: str = "string"  # string|integer|float|boolean|date|datetime|json
    required: bool = False


# Standard record fields (mirrors _STANDARD_RECORD_FIELDS in the adapter)
_STANDARD_FIELDS = [
    ("id", FRONTBASE_NUMBER, "integer"),
    ("title", FRONTBASE_TEXT, "string"),
    ("content", FRONTBASE_RICH_TEXT, "string"),
    ("excerpt", FRONTBASE_LONG_TEXT, "string"),
    ("slug", FRONTBASE_TEXT, "string"),
    ("permalink", FRONTBASE_URL, "string"),
    ("status", FRONTBASE_CHOICE, "string"),
    ("date", FRONTBASE_DATETIME, "datetime"),
    ("date_gmt", FRONTBASE_DATETIME, "datetime"),
    ("modified", FRONTBASE_DATETIME, "datetime"),
    ("modified_gmt", FRONTBASE_DATETIME, "datetime"),
    ("parent", FRONTBASE_NUMBER, "integer"),
    ("menu_order", FRONTBASE_NUMBER, "integer"),
    ("author", FRONTBASE_JSON, "json"),
    ("featured_media", FRONTBASE_MEDIA, "json"),
    ("terms", FRONTBASE_JSON, "json"),
]


def _slugify(value: str) -> str:
    """Make a Frontbase-safe model/field name from an arbitrary string."""
    out = []
    for ch in value.strip().lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("_")
    name = "".join(out)
    # collapse repeats + strip leading digits
    while "__" in name:
        name = name.replace("__", "_")
    name = name.strip("_")
    if name and name[0].isdigit():
        name = f"wp_{name}"
    return name or "field"


class WordPressMappingService:
    """Transform discovery manifests into Frontbase content-model proposals."""

    # ------------------------------------------------------------------ #
    # Content models
    # ------------------------------------------------------------------ #
    def manifest_to_models(self, manifest: Dict[str, Any]) -> List[ContentModelProposal]:
        """Convert every post type in the manifest into a content-model proposal."""
        models: List[ContentModelProposal] = []
        for pt in manifest.get("post_types", []) or []:
            models.append(self._post_type_to_model(pt))
        return models

    def _post_type_to_model(self, pt: Dict[str, Any]) -> ContentModelProposal:
        name = pt.get("name", "unknown")
        model = ContentModelProposal(
            name=_slugify(name),
            label=pt.get("label") or name,
            source_post_type=name,
            record_count=int(pt.get("count", 0) or 0),
            hierarchical=bool(pt.get("hierarchical", False)),
            fields=[],
        )

        seen = set()

        # 1. Standard fields (always present on extracted records)
        for fname, ftype, transform in _STANDARD_FIELDS:
            if fname in seen:
                continue
            seen.add(fname)
            model.fields.append(
                FieldProposal(
                    name=fname,
                    frontbase_type=ftype,
                    source_path=fname,
                    label=fname.replace("_", " ").title(),
                )
            )

        # 2. Custom fields (postmeta), enriched with ACF metadata
        for cf in pt.get("custom_fields", []) or []:
            meta_key = cf.get("meta_key")
            if not meta_key or meta_key in seen:
                continue
            seen.add(meta_key)

            is_acf = bool(cf.get("is_acf"))
            if is_acf and cf.get("acf_type"):
                ftype = _ACF_TYPE_MAP.get(cf["acf_type"], FRONTBASE_TEXT)
                source = f"acf.{meta_key}"
            else:
                ftype = _META_TYPE_MAP.get((cf.get("type") or "string").lower(), FRONTBASE_TEXT)
                source = f"meta.{meta_key}"

            model.fields.append(
                FieldProposal(
                    name=_slugify(meta_key),
                    frontbase_type=ftype,
                    source_path=source,
                    label=cf.get("acf_label") or meta_key.replace("_", " ").title(),
                    is_acf=is_acf,
                    acf_type=cf.get("acf_type"),
                )
            )

        return model

    # ------------------------------------------------------------------ #
    # Default field mappings (used to pre-fill the mapping step)
    # ------------------------------------------------------------------ #
    def default_mappings_for_model(self, model: ContentModelProposal) -> List[FieldMappingProposal]:
        """Produce default field mappings for a content model.

        Standard identity fields (id/title/content/...) are mapped 1:1; custom
        and ACF fields are mapped with the coercion implied by their type.
        """
        mappings: List[FieldMappingProposal] = []
        for f in model.fields:
            mappings.append(
                FieldMappingProposal(
                    frontbase_field=f.name,
                    wordpress_path=f.source_path,
                    transform=self._transform_for_type(f.frontbase_type),
                    required=(f.name in ("id", "title")),
                )
            )
        return mappings

    def default_mappings_for_post_type(self, pt_manifest: Dict[str, Any]) -> List[FieldMappingProposal]:
        """Convenience: default mappings directly from a post-type manifest entry."""
        return self.default_mappings_for_model(self._post_type_to_model(pt_manifest))

    @staticmethod
    def _transform_for_type(frontbase_type: str) -> str:
        return {
            FRONTBASE_NUMBER: "integer",
            FRONTBASE_BOOLEAN: "boolean",
            FRONTBASE_DATE: "date",
            FRONTBASE_DATETIME: "datetime",
            FRONTBASE_JSON: "json",
            FRONTBASE_MEDIA: "json",
            FRONTBASE_REFERENCE: "json",
        }.get(frontbase_type, "string")
