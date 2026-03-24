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