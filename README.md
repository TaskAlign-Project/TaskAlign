# TaskAlign: Factory Scheduling System

TaskAlign is a production scheduling assistant for conventional electronic equipment factories (injection‑molding part) that currently rely on manual planning. It helps factory managers and planners generate a feasible month plan, organized as a day‑by‑day timeline per machine, that can be reviewed and adjusted by humans instead of starting from scratch.

The system encodes user inputs (machines, molds, and product components) into a scheduling model that is suitable for optimization. Key constraints supported include machine and mold group matching (e.g., small/medium/large), mold tonnage limits vs. machine tonnage, mold exclusivity (a mold cannot run on two machines at the same time), and prerequisite dependencies between components. Capacity is calendar-based, using available hours per day and machine efficiency to compute effective daily capacity. The scheduler also models operational setup activities such as mold changes and color changes, and produces schedules with explicit start/end times for each task (setup, wait, and production), enabling direct visualization in Gantt/timeline views.

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
       - One mold code that exists in several tonnages is kept as separate molds, named `<code>-<group>-<tonnage>T`
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
       - machine and mold group matching and tonnage constraints
       - mold exclusivity
       - prerequisites (with support for **pre-setup then wait** when prerequisites complete later the same day)
       - per-day capacity using `hours_per_day * efficiency`
       - setup activities (**mold change** and **color change**) as explicit tasks
   - Each schedule is saved as a named **Plan**, with its own machines, molds, components, and full run history, so a factory can keep several plans (e.g., different months or lines) side by side.

2. **Direct Import From the Client's Existing Reports**
   - Skips manual re-entry by parsing the factory's own spreadsheets directly:
     - **Overview**: the assembly/mold master sheet (mold code, machine group, tonnage, cycle time per component).
     - **ZPPI010**: the SAP production-order export (material, planned/produced quantity, start/due dates).
   - Supports **append** or **replace** modes, an option to skip orders already fully produced, and a **dry run** to preview counts before committing anything to the plan.
   - Database errors during import are reported in plain language instead of raw SQL messages.

3. **Flexible Scheduling Modes**
   - **Fresh Start:** builds a schedule from zero for a new planning period.
   - **Resume:** re-runs the optimizer on top of an existing plan's current inputs, picking up from what's already been produced.

4. **Dashboard With Production Progress**
   - The home page summarizes the selected plan in a compact grid of tiles.
   - A **Production progress** tile shows how much of the total demand is done, in progress, or not started.

5. **Timeline-Ready Output (Gantt Chart / Excel Friendly)**
   - Produces a detailed per-machine schedule with explicit **start/end times** for each task type:
     - `CHANGE_COLOR`, `CHANGE_MOLD`, `WAIT`, `PRODUCE`
   - Every run in the history keeps **its own start date**, so switching between Run #1, #2, #3 shows the dates each run was generated with.
   - Includes production details (component, mold, color, quantity, used hours) suitable for:
     - Gantt/timeline visualization in the web UI, with manual adjustment support
     - daily workload summaries per machine
     - exporting to an Excel workbook laid out like the client's own daily production-plan sheet
   - **Export Excel follows the current filters** on the Output page (machine, component, day range and so on), and the workbook states which filters were applied.

6. **Schedule Validation & Unmet-Demand Checks**
   - Every run is automatically checked against a set of rules before it's trusted:
     - no overlapping tasks on the same machine
     - no mold used on two machines at once
     - correct task sequencing within a day
     - valid production fields and non-zero task durations
   - Components that couldn't be fully scheduled within the available capacity are flagged as **unmet demand** rather than silently dropped.

7. **Machine, Mold & Component Management**
   - Dedicated pages to create, edit, and delete machines, molds, and components outside of the bulk import flow, for day-to-day upkeep between planning runs.
   - The Components page can be filtered by status: **Done**, **In progress**, and **Undone**.
   - Pages that need a plan show a clear "No plan selected" message instead of a blank screen.

## Running the Project

There are two ways to run TaskAlign.

### Option 1: Docker (for development, or a machine that has Docker)

Requires [Docker](https://www.docker.com/) (with Compose) installed. No other setup is needed. The database, backend, and frontend all run in containers.

```bash
docker compose up -d --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

Database migrations run automatically on backend startup. To stop everything:

```bash
docker compose down
```

Default ports and database credentials can be overridden by copying [`.env.example`](.env.example) to `.env` and editing it. This is optional, sensible defaults are already built in.

### Option 2: Portable Windows package (for clients, no Docker)

A single zip file that a Windows 10/11 user can extract and double-click. It needs no installation, no administrator rights, and no internet connection. Python, Node.js, all libraries, and the data are inside the zip.

1. Extract the zip (right-click, **Extract All**). Do not run it from inside the zip.
2. Open the `TaskAlign` folder and double-click **START TaskAlign.bat**.
3. Wait up to a minute on the first start. The browser opens TaskAlign by itself.
4. Keep the black window open while working. Close it to stop TaskAlign.

Everything runs on the user's own computer only (`127.0.0.1`), and all data is stored in one file, `data/taskalign.db`. To back up or move the data, copy the `data` folder.

On some Windows 11 computers, **Smart App Control** blocks the launcher because it is not digitally signed. The user must turn Smart App Control off to run it. Windows cannot turn it back on without a reset, so this is the user's decision. Microsoft Defender and the firewall keep working.

To build the zip (on macOS or Linux), see [`portable/README.md`](portable/README.md):

```bash
python3 portable/build.py --empty    # clean database, the client starts from zero
python3 portable/build.py            # copies the data from the running Docker database
```

The portable package uses SQLite instead of PostgreSQL. The application code is the same, and the backend picks SQLite when `DATABASE_URL` starts with `sqlite`.
