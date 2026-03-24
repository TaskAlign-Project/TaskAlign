# app/models/models.py
from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional, Literal


@dataclass
class Machine:
    id: str
    name: str

    # Injection molding planning attributes
    group: str                 # "small" | "medium" | "large"
    tonnage: int               # machine tonnage capacity
    hours_per_day: float = 21.0
    efficiency: float = 0.85   # 0..1

    # New (UI-driven)
    status: Literal["available", "unavailable"] = "available"


@dataclass
class Mold:
    id: str
    name: str
    group: str       # must match machine.group
    tonnage: int     # must be <= machine.tonnage

    # Optional UI metadata (accepted; scheduler can ignore)
    component_id: Optional[str] = None


@dataclass
class ProductComponent:
    id: str
    name: str

    quantity: int                 # pieces
    finished: int = 0             # pieces already produced

    cycle_time_sec: float = 0.0   # seconds per piece
    mold_id: str = ""             # which mold is required
    color: str = ""               # color/material

    # New (real dates)
    start_date: Optional[date] = None   # default handled by scheduler = current_date
    due_date: Optional[date] = None     # important target date

    # Soft guidance (keep)
    lead_time_days: int = 2

    # Dependencies
    prerequisites: List[str] = field(default_factory=list)
    dependency_mode: Literal["wait_all", "parallel"] = "wait_all"
    dependency_transfer_time_minutes: int = 0

    # Optional order-line grouping
    order_code: Optional[str] = None

    status: str = "pending"