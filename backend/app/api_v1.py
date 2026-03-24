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