# main.py
from datetime import date, time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal

from app.models.models import Machine, Mold, ProductComponent
from app.services.ga_scheduler import ga_optimize_v2

app = FastAPI(title="Injection Molding Monthly Planning API")


class MachineIn(BaseModel):
    id: str
    name: str
    group: str = Field(..., description="small | medium | large")
    tonnage: int
    hours_per_day: float = 21.0
    efficiency: float = 0.85
    status: Literal["available", "unavailable"] = "available"


class MoldIn(BaseModel):
    id: str
    name: str
    group: str = Field(..., description="small | medium | large")
    tonnage: int
    component_id: Optional[str] = None


class ComponentIn(BaseModel):
    id: str
    name: str

    quantity: int
    finished: int = 0

    cycle_time_sec: float
    mold_id: str
    color: str

    start_date: Optional[date] = None   # default handled by scheduler = current_date
    due_date: date                      # required

    lead_time_days: int = 2
    prerequisites: List[str] = []

    dependency_mode: Literal["wait_all", "parallel"] = "wait_all"
    dependency_transfer_time_minutes: int = 0

    order_code: Optional[str] = None
    status: str = "pending"


class ScheduleV2Request(BaseModel):
    month_days: int = 30

    # NEW: minutes only
    mold_change_time_minutes: int = 0
    color_change_time_minutes: int = 0

    # NEW: real calendar anchor + shift start
    current_date: date
    start_time: time = time(0, 0, 0)

    machines: List[MachineIn]
    molds: List[MoldIn]
    components: List[ComponentIn]

    pop_size: int = 30
    n_generations: int = 80
    mutation_rate: float = 0.25


@app.post("/schedule_v2")
def schedule_v2(request: ScheduleV2Request) -> Dict[str, Any]:
    try:
        machines = [Machine(**m.model_dump()) for m in request.machines]
        molds = [Mold(**m.model_dump()) for m in request.molds]
        components = [ProductComponent(**c.model_dump()) for c in request.components]

        result = ga_optimize_v2(
            components=components,
            machines=machines,
            molds=molds,
            month_days=request.month_days,
            mold_change_time_minutes=request.mold_change_time_minutes,
            color_change_time_minutes=request.color_change_time_minutes,
            current_date=request.current_date,
            start_time=request.start_time,
            pop_size=request.pop_size,
            n_generations=request.n_generations,
            mutation_rate=request.mutation_rate,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))