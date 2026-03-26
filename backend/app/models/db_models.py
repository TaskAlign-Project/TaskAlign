from sqlalchemy import Column, String, Integer, Float, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class Plan(Base):
    __tablename__ = "plans"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    current_date = Column(String, nullable=False)  # ISO date string e.g. "2026-01-01"
    start_time = Column(String, nullable=False)    # e.g. "04:00"
    month_days = Column(Integer, default=30)

    # Changeover settings
    mold_change_time_minutes = Column(Float, default=60.0)
    color_change_time_minutes = Column(Float, default=30.0)

    # GA Settings
    pop_size = Column(Integer, default=25)
    n_generations = Column(Integer, default=60)
    mutation_rate = Column(Float, default=0.3)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    components = relationship("Component", back_populates="plan", cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="plan", cascade="all, delete-orphan")


class Machine(Base):
    __tablename__ = "machines"

    id = Column(String, primary_key=True, default=generate_uuid)
    code = Column(String, nullable=False, unique=True)
    name = Column(String)
    group = Column(String)
    tonnage = Column(Integer)
    hours_per_day = Column(Float, default=24.0)
    efficiency = Column(Float, default=1.0)
    status = Column(String, default="available")


class Mold(Base):
    __tablename__ = "molds"

    id = Column(String, primary_key=True, default=generate_uuid)
    code = Column(String, nullable=False, unique=True)
    name = Column(String)
    group = Column(String)
    tonnage = Column(Integer)
    component_id = Column(String, nullable=True)


class Component(Base):
    __tablename__ = "components"

    id = Column(String, primary_key=True, default=generate_uuid)
    plan_id = Column(String, ForeignKey("plans.id"), nullable=False)
    component_id = Column(String, nullable=False)  # e.g. "C1"
    order_code = Column(String, nullable=True)     # e.g. "ORD001"
    name = Column(String)
    quantity = Column(Integer)
    finished = Column(Integer, default=0)
    cycle_time_sec = Column(Float)
    mold_id = Column(String)   # references Mold.code
    color = Column(String)
    start_date = Column(String, nullable=True)  # ISO date
    due_date = Column(String, nullable=True)    # ISO date
    lead_time_days = Column(Integer, default=2)
    status = Column(String, default="pending")

    # Dependencies
    dependency_mode = Column(String, default="wait_all")
    dependency_transfer_time_minutes = Column(Integer, default=0)
    prerequisites = Column(JSON, default=list)  # list of component_ids

    plan = relationship("Plan", back_populates="components")


class Run(Base):
    __tablename__ = "runs"

    id = Column(String, primary_key=True, default=generate_uuid)
    plan_id = Column(String, ForeignKey("plans.id"), nullable=False)
    run_name = Column(String, nullable=True)   # e.g. "Run #1" or timestamp label
    run_at = Column(DateTime(timezone=True), server_default=func.now())
    score = Column(Float, nullable=True)
    status = Column(String, default="completed")  # "completed" | "failed"
    unmet = Column(JSON, nullable=True)        # unmet quantities
    assignments = Column(JSON, nullable=True)  # full schedule result

    plan = relationship("Plan", back_populates="runs")