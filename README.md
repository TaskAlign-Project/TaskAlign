# TaskAlign: Factory Scheduling System

TaskAlign is a production scheduling assistant for conventional electronic equipment factories (injection‑molding part) that currently rely on manual planning. It helps factory managers and planners generate a feasible month plan—organized as a day‑by‑day timeline per machine—that can be reviewed and adjusted by humans instead of starting from scratch.

The system encodes user inputs (machines, molds, and product components) into a scheduling model that is suitable for optimization. Key constraints supported include machine–mold group matching (e.g., small/medium/large), mold tonnage limits vs. machine tonnage, mold exclusivity (a mold cannot run on two machines at the same time), and prerequisite dependencies between components. Capacity is calendar-based, using available hours per day and machine efficiency to compute effective daily capacity. The scheduler also models operational setup activities such as mold changes and color changes, and produces schedules with explicit start/end times for each task (setup, wait, and production), enabling direct visualization in Gantt/timeline views.

TaskAlign uses heuristic/optimization logic to propose a high-quality draft schedule (rather than guaranteeing a globally optimal plan) and is designed to support planner decision-making by making constraints explicit, highlighting unmet demand when capacity is insufficient, and providing a structured timeline that humans can fine-tune for real-world exceptions (e.g., breakdowns, urgent orders, or policy overrides).

## Features

1. **Injection Molding Production Scheduling (Optimization-Assisted)**
   - Users input planning data, including:
     - **Machines**
       - Machine ID / name
       - Machine **group** (e.g., `small` / `medium` / `large`)
       - Machine **tonnage**
       - **Hours per day** (calendar-based capacity)
       - **Efficiency** (effective capacity multiplier)
     - **Molds**
       - Mold ID / name
       - Mold **group** (must match machine group)
       - Mold **tonnage** (must be `<=` machine tonnage)
       - Mold is treated as a **constrained shared resource** (cannot be used on two machines at the same time)
     - **Product Components (Demand)**
       - Component ID / name
       - Required **mold_id**
       - **Color**
       - **Cycle time (sec / piece)**
       - **Quantity** (pieces)
       - **Prerequisite components** (dependency graph)
       - **Due day** and **lead time (days)** for monthly planning
   - The system generates a feasible month schedule by combining:
     - A **Genetic Algorithm (GA)** to search for good component priority orderings, and
     - A constraint-aware **decoder** that builds the actual day-by-day timeline while enforcing:
       - machine–mold group matching and tonnage constraints
       - mold exclusivity
       - prerequisites (with support for **pre-setup then wait** when prerequisites complete later the same day)
       - per-day capacity using `hours_per_day * efficiency`
       - setup activities (**mold change** and **color change**) as explicit tasks

2. **Timeline-Ready Output (Gantt Chart / Excel Friendly)**
   - Produces a detailed per-machine schedule with explicit **start/end times** for each task type:
     - `CHANGE_COLOR`, `CHANGE_MOLD`, `WAIT`, `PRODUCE`
   - Includes production details (component, mold, color, quantity, used hours) suitable for:
     - Gantt/timeline visualization
     - daily workload summaries per machine
     - exporting to spreadsheets for planner review and manual adjustments