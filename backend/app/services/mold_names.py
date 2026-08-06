from typing import Any, Mapping


def normalize_mold_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize mold data while preserving its source code as an alias."""
    result = dict(payload)
    code = str(result.get("code") or "").strip()
    name = str(result.get("name") or "").strip()
    if not code:
        raise ValueError("Mold code is required")
    if not name:
        raise ValueError("Mold name is required")

    result["code"] = code
    result["name"] = name
    return result


def mold_identifier(mold: Mapping[str, Any]) -> str:
    """Return the human mold name used by scheduling and the UI as its ID."""
    return normalize_mold_payload(mold)["name"]


def build_mold_aliases(molds: list[Any]) -> dict[str, str]:
    """Map both legacy codes and public names to the public mold identifier."""
    aliases: dict[str, str] = {}
    for mold in molds:
        code = str(getattr(mold, "code", "") or "").strip()
        name = str(getattr(mold, "name", "") or "").strip()
        if not name:
            continue
        if code:
            aliases[code] = name
        aliases[name] = name
    return aliases
