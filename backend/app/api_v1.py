from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import db_models
from app import schemas

router = APIRouter()

# --- PLANS ---

@router.get("/plans", response_model=List[schemas.Plan])
def get_plans(db: Session = Depends(get_db)):
    return db.query(db_models.Plan).all()

@router.post("/plans", response_model=schemas.Plan)
def create_plan(plan: schemas.PlanCreate, db: Session = Depends(get_db)):
    db_plan = db_models.Plan(**plan.model_dump())
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return db_plan

@router.get("/plans/{plan_id}", response_model=schemas.Plan)
def get_plan(plan_id: str, db: Session = Depends(get_db)):
    db_plan = db.query(db_models.Plan).filter(db_models.Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return db_plan

@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: str, db: Session = Depends(get_db)):
    db_plan = db.query(db_models.Plan).filter(db_models.Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    db.delete(db_plan)
    db.commit()
    return {"message": "Plan deleted"}

@router.patch("/plans/{plan_id}", response_model=schemas.Plan)
def update_plan(plan_id: str, plan: schemas.PlanCreate, db: Session = Depends(get_db)):
    db_plan = db.query(db_models.Plan).filter(db_models.Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    for key, value in plan.model_dump().items():
        setattr(db_plan, key, value)
    db_plan.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_plan)
    return db_plan

# --- MACHINES ---

@router.get("/machines", response_model=List[schemas.Machine])
def get_machines(db: Session = Depends(get_db)):
    return db.query(db_models.Machine).all()

@router.post("/machines", response_model=schemas.Machine)
def create_machine(machine: schemas.MachineCreate, db: Session = Depends(get_db)):
    db_machine = db_models.Machine(**machine.model_dump())
    db.add(db_machine)
    db.commit()
    db.refresh(db_machine)
    return db_machine

@router.delete("/machines/{machine_id}")
def delete_machine(machine_id: str, db: Session = Depends(get_db)):
    db_machine = db.query(db_models.Machine).filter(db_models.Machine.id == machine_id).first()
    if not db_machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    db.delete(db_machine)
    db.commit()
    return {"message": "Machine deleted"}

@router.patch("/machines/{machine_id}", response_model=schemas.Machine)
def update_machine(machine_id: str, machine: schemas.MachineCreate, db: Session = Depends(get_db)):
    db_machine = db.query(db_models.Machine).filter(db_models.Machine.id == machine_id).first()
    if not db_machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    for key, value in machine.model_dump().items():
        setattr(db_machine, key, value)
    db.commit()
    db.refresh(db_machine)
    return db_machine

# --- MOLDS ---

@router.get("/molds", response_model=List[schemas.Mold])
def get_molds(db: Session = Depends(get_db)):
    return db.query(db_models.Mold).all()

@router.post("/molds", response_model=schemas.Mold)
def create_mold(mold: schemas.MoldCreate, db: Session = Depends(get_db)):
    db_mold = db_models.Mold(**mold.model_dump())
    db.add(db_mold)
    db.commit()
    db.refresh(db_mold)
    return db_mold

@router.delete("/molds/{mold_id}")
def delete_mold(mold_id: str, db: Session = Depends(get_db)):
    db_mold = db.query(db_models.Mold).filter(db_models.Mold.id == mold_id).first()
    if not db_mold:
        raise HTTPException(status_code=404, detail="Mold not found")
    db.delete(db_mold)
    db.commit()
    return {"message": "Mold deleted"}

@router.patch("/molds/{mold_id}", response_model=schemas.Mold)
def update_mold(mold_id: str, mold: schemas.MoldCreate, db: Session = Depends(get_db)):
    db_mold = db.query(db_models.Mold).filter(db_models.Mold.id == mold_id).first()
    if not db_mold:
        raise HTTPException(status_code=404, detail="Mold not found")
    for key, value in mold.model_dump().items():
        setattr(db_mold, key, value)
    db.commit()
    db.refresh(db_mold)
    return db_mold

# --- COMPONENTS ---

@router.get("/plans/{plan_id}/components", response_model=List[schemas.Component])
def get_components(plan_id: str, db: Session = Depends(get_db)):
    return db.query(db_models.Component).filter(db_models.Component.plan_id == plan_id).all()

@router.post("/plans/{plan_id}/components", response_model=schemas.Component)
def create_component(plan_id: str, component: schemas.ComponentCreate, db: Session = Depends(get_db)):
    db_component = db_models.Component(**component.model_dump(), plan_id=plan_id)
    db.add(db_component)
    db.commit()
    db.refresh(db_component)
    return db_component

@router.delete("/components/{component_id}")
def delete_component(component_id: str, db: Session = Depends(get_db)):
    db_component = db.query(db_models.Component).filter(db_models.Component.id == component_id).first()
    if not db_component:
        raise HTTPException(status_code=404, detail="Component not found")
    db.delete(db_component)
    db.commit()
    return {"message": "Component deleted"}

@router.patch("/components/{component_id}", response_model=schemas.Component)
def update_component(component_id: str, component: schemas.ComponentCreate, db: Session = Depends(get_db)):
    db_component = db.query(db_models.Component).filter(db_models.Component.id == component_id).first()
    if not db_component:
        raise HTTPException(status_code=404, detail="Component not found")
    for key, value in component.model_dump().items():
        setattr(db_component, key, value)
    db.commit()
    db.refresh(db_component)
    return db_component

from app.models.models import Machine as GAMachine, Mold as GAMold, ProductComponent as GAComponent
from app.services.ga_scheduler import ga_optimize_v2
from datetime import datetime, date, time

# --- RUNS ---

@router.post("/plans/{plan_id}/run", response_model=schemas.Run)
def run_plan(plan_id: str, db: Session = Depends(get_db)):
    # 1. Fetch Plan
    db_plan = db.query(db_models.Plan).filter(db_models.Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # 2. Fetch Global Machines & Molds
    db_machines = db.query(db_models.Machine).all()
    db_molds = db.query(db_models.Mold).all()

    # 3. Fetch Plan-Specific Components
    db_components = db.query(db_models.Component).filter(db_models.Component.plan_id == plan_id).all()

    if not db_machines or not db_components:
        raise HTTPException(status_code=400, detail="Plan must have machines and components to run")

    # 4. Convert DB Models to GA Dataclasses
    # (Mapping db_machine.code -> GAMachine.id as discussed)
    ga_machines = [
        GAMachine(
            id=m.code,
            name=m.name or m.code,
            group=m.group,
            tonnage=m.tonnage,
            hours_per_day=m.hours_per_day,
            efficiency=m.efficiency,
            status=m.status
        ) for m in db_machines
    ]

    ga_molds = [
        GAMold(
            id=m.code,
            name=m.name or m.code,
            group=m.group,
            tonnage=m.tonnage,
            component_id=m.component_id
        ) for m in db_molds
    ]

    ga_components = [
        GAComponent(
            id=c.component_id,
            name=c.name or c.component_id,
            quantity=c.quantity,
            finished=c.finished,
            cycle_time_sec=c.cycle_time_sec,
            mold_id=c.mold_id,
            color=c.color,
            start_date=date.fromisoformat(c.start_date) if c.start_date else None,
            due_date=date.fromisoformat(c.due_date) if c.due_date else date.fromisoformat(db_plan.current_date),
            dependency_mode=c.dependency_mode,
            dependency_transfer_time_minutes=c.dependency_transfer_time_minutes,
            prerequisites=c.prerequisites,
            order_code=c.order_code
        ) for c in db_components
    ]

    # 5. Run GA Scheduler
    try:
        # Convert plan strings to date/time objects
        current_date = date.fromisoformat(db_plan.current_date)
        start_time = time.fromisoformat(db_plan.start_time)

        result = ga_optimize_v2(
            components=ga_components,
            machines=ga_machines,
            molds=ga_molds,
            month_days=db_plan.month_days,
            mold_change_time_minutes=db_plan.mold_change_time_minutes,
            color_change_time_minutes=db_plan.color_change_time_minutes,
            current_date=current_date,
            start_time=start_time,
            pop_size=db_plan.pop_size,
            n_generations=db_plan.n_generations,
            mutation_rate=db_plan.mutation_rate,
        )

        # 6. Save Run Result to DB
        db_run = db_models.Run(
            plan_id=plan_id,
            run_name=f"Run {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            score=result.get("score"),
            unmet=result.get("unmet"),
            assignments=result.get("assignments"),
            status="completed"
        )
        db.add(db_run)
        db.commit()
        db.refresh(db_run)

        return db_run

    except Exception as e:
        # Log the error and save a failed run
        db_run = db_models.Run(
            plan_id=plan_id,
            run_name=f"Failed Run {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            status="failed",
            unmet={"error": str(e)}
        )
        db.add(db_run)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Scheduling failed: {str(e)}")

# --- RUN HISTORY ---

@router.get("/plans/{plan_id}/runs", response_model=List[schemas.Run])
def get_plan_runs(plan_id: str, db: Session = Depends(get_db)):
    return db.query(db_models.Run).filter(db_models.Run.plan_id == plan_id).order_by(db_models.Run.run_at.desc()).all()

@router.get("/runs/{run_id}", response_model=schemas.Run)
def get_run(run_id: str, db: Session = Depends(get_db)):
    db_run = db.query(db_models.Run).filter(db_models.Run.id == run_id).first()
    if not db_run:
        raise HTTPException(status_code=404, detail="Run not found")
    return db_run