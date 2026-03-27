from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any
from datetime import datetime

# Base Schema for shared fields
class PlanBase(BaseModel):
    name: str
    current_date: str
    start_time: str
    month_days: int = 30
    mold_change_time_minutes: float = 60.0
    color_change_time_minutes: float = 30.0
    pop_size: int = 25
    n_generations: int = 60
    mutation_rate: float = 0.3

class PlanCreate(PlanBase):
    pass

class Plan(PlanBase):
    id: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# Machine Schemas
class MachineBase(BaseModel):
    code: str
    name: Optional[str] = None
    group: str
    tonnage: int
    hours_per_day: float = 24.0
    efficiency: float = 1.0
    status: str = "available"

class MachineCreate(MachineBase):
    pass

class Machine(MachineBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

# Mold Schemas
class MoldBase(BaseModel):
    code: str
    name: Optional[str] = None
    group: str
    tonnage: int
    component_id: Optional[str] = None

class MoldCreate(MoldBase):
    pass

class Mold(MoldBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

# Component Schemas
class ComponentBase(BaseModel):
    component_id: str
    order_code: Optional[str] = None
    name: Optional[str] = None
    quantity: int
    finished: int = 0
    cycle_time_sec: float
    mold_id: str
    color: str
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    lead_time_days: int = 2
    dependency_mode: str = "wait_all"
    dependency_transfer_time_minutes: int = 0
    prerequisites: List[str] = []

class ComponentCreate(ComponentBase):
    pass

class Component(ComponentBase):
    id: str
    plan_id: str
    model_config = ConfigDict(from_attributes=True)

# Run Schemas
class RunBase(BaseModel):
    run_name: Optional[str] = None
    score: Optional[float] = None
    status: str = "completed"
    unmet: Optional[Any] = None
    assignments: Optional[Any] = None

class RunCreate(RunBase):
    pass

class Run(RunBase):
    id: str
    plan_id: str
    run_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    current_date: Optional[str] = None
    start_time: Optional[str] = None
    month_days: Optional[int] = None
    mold_change_time_minutes: Optional[float] = None
    color_change_time_minutes: Optional[float] = None
    pop_size: Optional[int] = None
    n_generations: Optional[int] = None
    mutation_rate: Optional[float] = None

class PlanWithCounts(Plan):
    machine_count: int = 0
    mold_count: int = 0
    component_count: int = 0
    run_count: int = 0
    last_run_at: Optional[str] = None