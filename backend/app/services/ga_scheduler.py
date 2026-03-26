# app/services/ga_scheduler.py
import random
from datetime import date, datetime, time, timedelta
from typing import Dict, List, Tuple, Any, Optional

from app.models.models import Machine, Mold, ProductComponent

EPS = 1e-9


def _overlaps(a_start: float, a_end: float, b_start: float, b_end: float) -> bool:
    return not (a_end <= b_start or b_end <= a_start)


def _interval_is_free(intervals: List[Tuple[float, float]], start: float, end: float) -> bool:
    for s, e in intervals:
        if _overlaps(s, e, start, end):
            return False
    return True


def _reserve_interval(intervals: List[Tuple[float, float]], start: float, end: float) -> None:
    intervals.append((start, end))


def _build_dependency_graph(
    components: List[ProductComponent],
) -> Tuple[Dict[str, int], Dict[str, List[str]], Dict[str, List[str]]]:
    by_id = {c.id: c for c in components}
    indeg = {c.id: 0 for c in components}
    graph: Dict[str, List[str]] = {c.id: [] for c in components}
    prereqs_of: Dict[str, List[str]] = {c.id: list(c.prerequisites) for c in components}

    for c in components:
        for pr in c.prerequisites:
            if pr not in by_id:
                raise ValueError(f"Prerequisite '{pr}' not found for component '{c.id}'.")
            graph[pr].append(c.id)
            indeg[c.id] += 1

    return indeg, graph, prereqs_of


def _topological_order_priority(
    components: List[ProductComponent],
    rank: Dict[str, int],
    unlock_score: Dict[str, int],
) -> List[ProductComponent]:
    by_id = {c.id: c for c in components}
    indeg, graph, _ = _build_dependency_graph(components)

    ready = [cid for cid, d in indeg.items() if d == 0]
    out: List[ProductComponent] = []

    while ready:
        ready.sort(key=lambda cid: (-int(unlock_score.get(cid, 0)), int(rank.get(cid, 10**9))))
        cid = ready.pop(0)

        out.append(by_id[cid])
        for nxt in graph[cid]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                ready.append(nxt)

    if len(out) != len(components):
        raise ValueError("Circular dependency detected in prerequisites.")
    return out


def _feasible_on_machine(comp: ProductComponent, machine: Machine, molds_by_id: Dict[str, Mold]) -> bool:
    mold = molds_by_id.get(comp.mold_id)
    if mold is None:
        return False
    if mold.group != machine.group:
        return False
    if mold.tonnage > machine.tonnage:
        return False
    if comp.cycle_time_sec <= 0:
        return False
    return True


def _piece_hours(cycle_time_sec: float) -> float:
    return float(cycle_time_sec) / 3600.0


def _minutes_to_hours(x_minutes: float) -> float:
    return float(x_minutes) / 60.0


def _time_to_float_hour(t: time) -> float:
    """Convert a time-of-day to fractional clock hour. 04:30:00 -> 4.5"""
    return float(t.hour) + float(t.minute) / 60.0 + float(t.second) / 3600.0


def _date_to_day_index(anchor: date, d: date) -> int:
    # 1-indexed
    return (d - anchor).days + 1


def _day_index_to_date(anchor: date, day_idx: int) -> date:
    return anchor + timedelta(days=day_idx - 1)


def _hour_to_datetime(anchor_date: date, shift_start: time, day_idx: int, hour_offset: float) -> datetime:
    base_dt = datetime.combine(_day_index_to_date(anchor_date, day_idx), shift_start)
    return base_dt + timedelta(seconds=float(hour_offset) * 3600.0)


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S")


def _next_ready_time_due_to_prereqs_wait_all(
    comp: ProductComponent,
    completion_time: Dict[str, Tuple[int, float]],
    day: int,
    after_hour: float,
) -> Optional[float]:
    needed: List[float] = []
    for pr in comp.prerequisites:
        if pr not in completion_time:
            return None
        pr_day, pr_hour = completion_time[pr]
        if pr_day > day:
            return None
        if pr_day == day and pr_hour > after_hour + EPS:
            needed.append(pr_hour)
    return max(needed) if needed else after_hour


def _next_mold_free_time_for_window(
    mold_intervals: List[Tuple[float, float]],
    after_hour: float,
    window_hours: float,
    cap: float,
) -> Optional[float]:
    window_hours = float(window_hours)
    if window_hours <= 0:
        return after_hour if after_hour <= cap + EPS else None

    if after_hour + window_hours <= cap + EPS and _interval_is_free(mold_intervals, after_hour, after_hour + window_hours):
        return after_hour

    t = after_hour
    safety = 0
    while t + window_hours <= cap + EPS:
        safety += 1
        if safety > 10_000:
            return None

        overlaps = [(s, e) for (s, e) in mold_intervals if _overlaps(s, e, t, t + window_hours)]
        if not overlaps:
            return t
        t = max(e for (_s, e) in overlaps)

    return None


def _next_busy_start(intervals: List[Tuple[float, float]], after_hour: float) -> Optional[float]:
    starts = [s for (s, _e) in intervals if s >= after_hour + EPS]
    return min(starts) if starts else None


def _fitness_v2(
    tasks: List[Dict[str, Any]],
    unmet: Dict[str, int],
    components: List[ProductComponent],
    due_day_by_id: Dict[str, int],
    lead_time_days_by_id: Dict[str, int],
) -> float:
    unmet_pen = sum(unmet.values()) * 1_000_000.0

    produced_total = 0
    on_time_qty = 0
    late_qty = 0
    weighted_late_qty = 0

    changeover_hours = 0.0
    wait_hours = 0.0
    transfer_hours = 0.0

    first_prod_day: Dict[str, int] = {}

    for t in tasks:
        tt = t["task_type"]
        if tt == "PRODUCE":
            qty = int(t.get("produced_qty", 0))
            produced_total += qty
            cid = t["component_id"]
            first_prod_day[cid] = min(first_prod_day.get(cid, 10**9), int(t["day"]))

            due_day = int(due_day_by_id.get(cid, 10**9))
            if int(t["day"]) <= due_day:
                on_time_qty += qty
            else:
                days_late = int(t["day"]) - due_day
                late_qty += qty
                weighted_late_qty += qty * max(days_late, 1)

        elif tt in ("CHANGE_MOLD", "CHANGE_COLOR"):
            changeover_hours += float(t.get("used_hours", 0.0))
        elif tt == "WAIT":
            wait_hours += float(t.get("used_hours", 0.0))
        elif tt == "TRANSFER":
            transfer_hours += float(t.get("used_hours", 0.0))

    late_start_pen = 0.0
    for cid, d in first_prod_day.items():
        due_day = int(due_day_by_id.get(cid, 10**9))
        ltd = int(lead_time_days_by_id.get(cid, 0))
        latest_start = due_day - ltd
        if latest_start < 1:
            latest_start = 1
        if d > latest_start:
            late_start_pen += (d - latest_start) * 2_000.0

    late_prod_pen = (late_qty * 2_000.0) + (weighted_late_qty * 500.0)

    return (
        on_time_qty * 5.0
        + produced_total * 1.0
        - unmet_pen
        - late_prod_pen
        - late_start_pen
        - (changeover_hours * 50.0)
        - (transfer_hours * 20.0)
        - (wait_hours * 5.0)
    )


def _random_genome(components: List[ProductComponent]) -> List[str]:
    ids = [c.id for c in components]
    random.shuffle(ids)
    return ids


def _mutate_swap(genome: List[str]) -> List[str]:
    if len(genome) < 2:
        return genome
    i, j = random.sample(range(len(genome)), 2)
    genome[i], genome[j] = genome[j], genome[i]
    return genome


def _crossover_ox(p1: List[str], p2: List[str]) -> List[str]:
    n = len(p1)
    if n < 2:
        return p1[:]
    a, b = sorted(random.sample(range(n), 2))
    mid = p1[a:b]
    rest = [x for x in p2 if x not in mid]
    return rest[:a] + mid + rest[a:]


def _decode_v2(
    genome: List[str],
    components: List[ProductComponent],
    machines: List[Machine],
    molds: List[Mold],
    month_days: int,
    mold_change_time_minutes: int,
    color_change_time_minutes: int,
    current_date: date,
    shift_start_time: time,
) -> Tuple[List[Dict[str, Any]], Dict[str, int], Dict[str, int], Dict[str, int]]:
    molds_by_id = {m.id: m for m in molds}

    rank = {cid: i for i, cid in enumerate(genome)}

    _indeg, dep_graph, _pr = _build_dependency_graph(components)
    unlock_score: Dict[str, int] = {c.id: len(dep_graph.get(c.id, [])) for c in components}

    comp_order = _topological_order_priority(components, rank=rank, unlock_score=unlock_score)

    start_day_by_id: Dict[str, int] = {}
    due_day_by_id: Dict[str, int] = {}
    lead_time_days_by_id: Dict[str, int] = {}

    for c in components:
        sd = getattr(c, "start_date", None) or current_date
        dd = getattr(c, "due_date", None)
        if dd is None:
            raise ValueError(f"Component '{c.id}' is missing due_date (required).")

        sdi = _date_to_day_index(current_date, sd)
        ddi = _date_to_day_index(current_date, dd)

        sdi = max(1, min(month_days, sdi))
        ddi = max(1, min(month_days, ddi))

        start_day_by_id[c.id] = sdi
        due_day_by_id[c.id] = ddi
        lead_time_days_by_id[c.id] = int(getattr(c, "lead_time_days", 0) or 0)

    remaining: Dict[str, int] = {}
    for c in components:
        finished = int(getattr(c, "finished", 0) or 0)
        remaining[c.id] = max(int(c.quantity) - finished, 0)

    completion_time: Dict[str, Tuple[int, float]] = {}

    mold_busy: Dict[int, Dict[str, List[Tuple[float, float]]]] = {
        d: {m.id: [] for m in molds} for d in range(1, month_days + 1)
    }

    machine_state: Dict[str, Dict[str, Optional[str]]] = {
        m.id: {"mold_id": None, "color": None, "last_component_id": None} for m in machines
    }

    component_owner: Dict[str, str] = {}
    tasks: List[Dict[str, Any]] = []

    # track if a component has already had its one-time transfer (for wait_all)
    transfer_done_once: set[str] = set()

    mold_change_h = _minutes_to_hours(mold_change_time_minutes)
    color_change_h = _minutes_to_hours(color_change_time_minutes)

    shift_start_hour = _time_to_float_hour(shift_start_time)

    for day in range(1, month_days + 1):
        usable: Dict[str, float] = {}
        max_clock_hours = 23.59 - shift_start_hour  # can't go past midnight
        for m in machines:
            if getattr(m, "status", "available") != "available":
                usable[m.id] = 0.0
            else:
                raw = float(m.hours_per_day) * float(m.efficiency)
                usable[m.id] = min(raw, max_clock_hours)

        t: Dict[str, float] = {m.id: 0.0 for m in machines}
        seq: Dict[str, int] = {m.id: 1 for m in machines}
        done: Dict[str, bool] = {m.id: (usable[m.id] <= EPS) for m in machines}

        current_mold: Dict[str, Optional[str]] = {m.id: machine_state[m.id]["mold_id"] for m in machines}
        current_color: Dict[str, Optional[str]] = {m.id: machine_state[m.id]["color"] for m in machines}
        last_component: Dict[str, Optional[str]] = {m.id: machine_state[m.id]["last_component_id"] for m in machines}

        while True:
            active = [m for m in machines if (not done[m.id]) and (t[m.id] < usable[m.id] - EPS)]
            if not active:
                break

            active.sort(key=lambda m: t[m.id])
            machine = active[0]
            mid = machine.id

            now = t[mid]
            cap = usable[mid]

            candidates = []
            wait_candidates_next_times: List[float] = []

            for comp in comp_order:
                if remaining[comp.id] <= 0:
                    continue

                if day < start_day_by_id[comp.id]:
                    continue

                owner = component_owner.get(comp.id)
                if owner is not None and owner != mid:
                    continue

                if not _feasible_on_machine(comp, machine, molds_by_id):
                    continue

                need_mold_change = (current_mold[mid] != comp.mold_id)
                need_color_change = (current_color[mid] != comp.color)

                setup = 0.0
                if need_color_change:
                    setup += max(0.0, color_change_h)
                if need_mold_change:
                    setup += max(0.0, mold_change_h)

                start_after_setup = now + setup
                per_piece_h = _piece_hours(comp.cycle_time_sec) / float(machine.efficiency)
                if per_piece_h <= 0:
                    continue

                mode = getattr(comp, "dependency_mode", "wait_all") or "wait_all"
                transfer_h = _minutes_to_hours(int(getattr(comp, "dependency_transfer_time_minutes", 0) or 0))

                if mode == "wait_all":
                    prereq_ready = _next_ready_time_due_to_prereqs_wait_all(comp, completion_time, day, start_after_setup)
                    if prereq_ready is None:
                        continue
                    transfer_start = max(start_after_setup, prereq_ready)
                elif mode == "parallel":
                    transfer_start = start_after_setup
                else:
                    raise ValueError(f"Invalid dependency_mode '{mode}' for component '{comp.id}'.")

                produce_start = transfer_start + transfer_h
                if produce_start + per_piece_h > cap + EPS:
                    continue

                intervals = mold_busy[day].get(comp.mold_id)
                if intervals is None:
                    continue

                if need_mold_change and mold_change_h > 0.0:
                    mold_hold_start = now + (color_change_h if need_color_change else 0.0)
                else:
                    mold_hold_start = now

                mold_hold_end_min = produce_start + per_piece_h

                if not _interval_is_free(intervals, mold_hold_start, mold_hold_end_min):
                    required_window = mold_hold_end_min - mold_hold_start
                    nxt = _next_mold_free_time_for_window(intervals, mold_hold_start, required_window, cap)
                    if nxt is not None and nxt > now + EPS and nxt < cap - EPS:
                        wait_candidates_next_times.append(nxt)
                    continue

                sticky = 1 if (last_component[mid] is not None and comp.id == last_component[mid]) else 0
                unlock = int(unlock_score.get(comp.id, 0))
                color_match = 1 if (current_color[mid] is not None and comp.color == current_color[mid]) else 0
                mold_match = 1 if (current_mold[mid] is not None and comp.mold_id == current_mold[mid]) else 0
                due_day = due_day_by_id[comp.id]

                candidates.append(
                    (
                        sticky,
                        unlock,
                        -due_day,
                        color_match,
                        mold_match,
                        rank.get(comp.id, 10**9),
                        comp,
                        need_color_change,
                        need_mold_change,
                    )
                )

            if not candidates:
                if wait_candidates_next_times:
                    t_next = min(wait_candidates_next_times)
                    if t_next > now + EPS:
                        wait_h = t_next - now
                        tasks.append({
                            "day": day,
                            "machine_id": mid,
                            "machine_name": machine.name,
                            "sequence_in_day": seq[mid],
                            "task_type": "WAIT",
                            "used_hours": wait_h,
                            "start_hour": now,
                            "end_hour": t_next,
                            "utilization": min(1.0, wait_h / cap) if cap > EPS else 0.0,
                        })
                        t[mid] = t_next
                        seq[mid] += 1
                        continue

                done[mid] = True
                t[mid] = cap
                continue

            if last_component[mid] is not None and any(c[0] == 1 for c in candidates):
                candidates = [c for c in candidates if c[0] == 1]

            candidates.sort(key=lambda x: (-x[0], -x[1], x[2], -x[3], -x[4], x[5]))
            chosen: ProductComponent = candidates[0][6]
            need_color_change = candidates[0][7]
            need_mold_change = candidates[0][8]

            # CHANGE_COLOR
            if need_color_change and color_change_h > 0.0:
                if now + color_change_h > cap + EPS:
                    done[mid] = True
                    t[mid] = cap
                    continue
                start_dt = _hour_to_datetime(current_date, shift_start_time, day, now)
                end_dt = _hour_to_datetime(current_date, shift_start_time, day, now + color_change_h)
                tasks.append({
                    "day": day,
                    "date": str(_day_index_to_date(current_date, day)),
                    "machine_id": mid,
                    "machine_name": machine.name,
                    "machine_group": machine.group,
                    "sequence_in_day": seq[mid],
                    "task_type": "CHANGE_COLOR",
                    "from_color": current_color[mid],
                    "to_color": chosen.color,
                    "used_hours": color_change_h,
                    "start_hour": now,
                    "end_hour": now + color_change_h,
                    "start_hour_clock": shift_start_hour + float(now),
                    "end_hour_clock": shift_start_hour + float(now + color_change_h),
                    "start_time": _fmt_time(start_dt),
                    "end_time": _fmt_time(end_dt),
                    "start_datetime": start_dt.isoformat(),
                    "end_datetime": end_dt.isoformat(),
                    "utilization": min(1.0, color_change_h / cap) if cap > EPS else 0.0,
                })
                now += color_change_h
                t[mid] = now
                seq[mid] += 1
            current_color[mid] = chosen.color

            # CHANGE_MOLD
            if need_mold_change and mold_change_h > 0.0:
                if now + mold_change_h > cap + EPS:
                    done[mid] = True
                    t[mid] = cap
                    continue

                intervals = mold_busy[day][chosen.mold_id]
                if not _interval_is_free(intervals, now, now + mold_change_h):
                    nxt = _next_mold_free_time_for_window(intervals, now, mold_change_h, cap)
                    if nxt is not None and nxt > now + EPS and nxt < cap - EPS:
                        wait_h = nxt - now
                        start_dt = _hour_to_datetime(current_date, shift_start_time, day, now)
                        end_dt = _hour_to_datetime(current_date, shift_start_time, day, nxt)
                        tasks.append({
                            "day": day,
                            "date": str(_day_index_to_date(current_date, day)),
                            "machine_id": mid,
                            "machine_name": machine.name,
                            "machine_group": machine.group,
                            "sequence_in_day": seq[mid],
                            "task_type": "WAIT",
                            "used_hours": wait_h,
                            "start_hour": now,
                            "end_hour": nxt,
                            "start_hour_clock": shift_start_hour + float(now),
                            "end_hour_clock": shift_start_hour + float(nxt),
                            "start_time": _fmt_time(start_dt),
                            "end_time": _fmt_time(end_dt),
                            "start_datetime": start_dt.isoformat(),
                            "end_datetime": end_dt.isoformat(),
                            "utilization": min(1.0, wait_h / cap) if cap > EPS else 0.0,
                        })
                        t[mid] = nxt
                        seq[mid] += 1
                        continue

                    done[mid] = True
                    t[mid] = cap
                    continue

                _reserve_interval(intervals, now, now + mold_change_h)
                start_dt = _hour_to_datetime(current_date, shift_start_time, day, now)
                end_dt = _hour_to_datetime(current_date, shift_start_time, day, now + mold_change_h)
                tasks.append({
                    "day": day,
                    "date": str(_day_index_to_date(current_date, day)),
                    "machine_id": mid,
                    "machine_name": machine.name,
                    "machine_group": machine.group,
                    "sequence_in_day": seq[mid],
                    "task_type": "CHANGE_MOLD",
                    "from_mold_id": current_mold[mid],
                    "to_mold_id": chosen.mold_id,
                    "used_hours": mold_change_h,
                    "start_hour": now,
                    "end_hour": now + mold_change_h,
                    "start_hour_clock": shift_start_hour + float(now),
                    "end_hour_clock": shift_start_hour + float(now + mold_change_h),
                    "start_time": _fmt_time(start_dt),
                    "end_time": _fmt_time(end_dt),
                    "start_datetime": start_dt.isoformat(),
                    "end_datetime": end_dt.isoformat(),
                    "utilization": min(1.0, mold_change_h / cap) if cap > EPS else 0.0,
                })
                now += mold_change_h
                t[mid] = now
                seq[mid] += 1
            current_mold[mid] = chosen.mold_id

            # WAIT for prereqs (wait_all only)
            mode = getattr(chosen, "dependency_mode", "wait_all") or "wait_all"
            transfer_h = _minutes_to_hours(int(getattr(chosen, "dependency_transfer_time_minutes", 0) or 0))

            if mode == "wait_all":
                prereq_ready_now = _next_ready_time_due_to_prereqs_wait_all(chosen, completion_time, day, now)
                if prereq_ready_now is None:
                    done[mid] = True
                    t[mid] = cap
                    continue

                if prereq_ready_now > now + EPS:
                    if prereq_ready_now >= cap - EPS:
                        done[mid] = True
                        t[mid] = cap
                        continue

                    intervals = mold_busy[day].get(current_mold[mid]) if current_mold[mid] else None
                    if intervals is not None:
                        if not _interval_is_free(intervals, now, prereq_ready_now):
                            nxt = _next_mold_free_time_for_window(intervals, now, prereq_ready_now - now, cap)
                            if nxt is not None and nxt > now + EPS and nxt < cap - EPS:
                                wait_h = nxt - now
                                start_dt = _hour_to_datetime(current_date, shift_start_time, day, now)
                                end_dt = _hour_to_datetime(current_date, shift_start_time, day, nxt)
                                tasks.append({
                                    "day": day,
                                    "date": str(_day_index_to_date(current_date, day)),
                                    "machine_id": mid,
                                    "machine_name": machine.name,
                                    "machine_group": machine.group,
                                    "sequence_in_day": seq[mid],
                                    "task_type": "WAIT",
                                    "used_hours": wait_h,
                                    "start_hour": now,
                                    "end_hour": nxt,
                                    "start_hour_clock": shift_start_hour + float(now),
                                    "end_hour_clock": shift_start_hour + float(nxt),
                                    "start_time": _fmt_time(start_dt),
                                    "end_time": _fmt_time(end_dt),
                                    "start_datetime": start_dt.isoformat(),
                                    "end_datetime": end_dt.isoformat(),
                                    "utilization": min(1.0, wait_h / cap) if cap > EPS else 0.0,
                                })
                                now = nxt
                                t[mid] = now
                                seq[mid] += 1
                                continue

                            done[mid] = True
                            t[mid] = cap
                            continue

                        _reserve_interval(intervals, now, prereq_ready_now)

                    wait_h = prereq_ready_now - now
                    start_dt = _hour_to_datetime(current_date, shift_start_time, day, now)
                    end_dt = _hour_to_datetime(current_date, shift_start_time, day, prereq_ready_now)
                    tasks.append({
                        "day": day,
                        "date": str(_day_index_to_date(current_date, day)),
                        "machine_id": mid,
                        "machine_name": machine.name,
                        "machine_group": machine.group,
                        "sequence_in_day": seq[mid],
                        "task_type": "WAIT",
                        "used_hours": wait_h,
                        "start_hour": now,
                        "end_hour": prereq_ready_now,
                        "start_hour_clock": shift_start_hour + float(now),
                        "end_hour_clock": shift_start_hour + float(prereq_ready_now),
                        "start_time": _fmt_time(start_dt),
                        "end_time": _fmt_time(end_dt),
                        "start_datetime": start_dt.isoformat(),
                        "end_datetime": end_dt.isoformat(),
                        "utilization": min(1.0, wait_h / cap) if cap > EPS else 0.0,
                    })
                    now = prereq_ready_now
                    t[mid] = now
                    seq[mid] += 1

            # TRANSFER
            do_transfer = False
            if transfer_h > 0.0:
                if mode == "parallel":
                    # parallel: transfer is required each day before producing
                    do_transfer = True
                elif mode == "wait_all":
                    # wait_all: transfer only once, when the component first starts
                    do_transfer = (chosen.id not in transfer_done_once)

            if do_transfer:
                if now + transfer_h > cap + EPS:
                    done[mid] = True
                    t[mid] = cap
                    continue

                if current_mold[mid] is not None:
                    intervals = mold_busy[day].get(current_mold[mid])
                    if intervals is not None:
                        if not _interval_is_free(intervals, now, now + transfer_h):
                            nxt = _next_mold_free_time_for_window(intervals, now, transfer_h, cap)
                            if nxt is not None and nxt > now + EPS and nxt < cap - EPS:
                                wait_h = nxt - now
                                start_dt = _hour_to_datetime(current_date, shift_start_time, day, now)
                                end_dt = _hour_to_datetime(current_date, shift_start_time, day, nxt)
                                tasks.append({
                                    "day": day,
                                    "date": str(_day_index_to_date(current_date, day)),
                                    "machine_id": mid,
                                    "machine_name": machine.name,
                                    "machine_group": machine.group,
                                    "sequence_in_day": seq[mid],
                                    "task_type": "WAIT",
                                    "used_hours": wait_h,
                                    "start_hour": now,
                                    "end_hour": nxt,
                                    "start_hour_clock": shift_start_hour + float(now),
                                    "end_hour_clock": shift_start_hour + float(nxt),
                                    "start_time": _fmt_time(start_dt),
                                    "end_time": _fmt_time(end_dt),
                                    "start_datetime": start_dt.isoformat(),
                                    "end_datetime": end_dt.isoformat(),
                                    "utilization": min(1.0, wait_h / cap) if cap > EPS else 0.0,
                                })
                                now = nxt
                                t[mid] = now
                                seq[mid] += 1
                                continue

                            done[mid] = True
                            t[mid] = cap
                            continue

                        _reserve_interval(intervals, now, now + transfer_h)

                start_dt = _hour_to_datetime(current_date, shift_start_time, day, now)
                end_dt = _hour_to_datetime(current_date, shift_start_time, day, now + transfer_h)
                tasks.append({
                    "day": day,
                    "date": str(_day_index_to_date(current_date, day)),
                    "machine_id": mid,
                    "machine_name": machine.name,
                    "machine_group": machine.group,
                    "sequence_in_day": seq[mid],
                    "task_type": "TRANSFER",
                    "component_id": chosen.id,
                    "component_name": chosen.name,
                    "used_hours": transfer_h,
                    "start_hour": now,
                    "end_hour": now + transfer_h,
                    "start_hour_clock": shift_start_hour + float(now),
                    "end_hour_clock": shift_start_hour + float(now + transfer_h),
                    "start_time": _fmt_time(start_dt),
                    "end_time": _fmt_time(end_dt),
                    "start_datetime": start_dt.isoformat(),
                    "end_datetime": end_dt.isoformat(),
                    "utilization": min(1.0, transfer_h / cap) if cap > EPS else 0.0,
                })
                transfer_done_once.add(chosen.id)
                now += transfer_h
                t[mid] = now
                seq[mid] += 1

            # PRODUCE
            per_piece_h = _piece_hours(chosen.cycle_time_sec) / float(machine.efficiency)
            if per_piece_h <= 0:
                done[mid] = True
                t[mid] = cap
                continue

            start_prod = now
            intervals = mold_busy[day][chosen.mold_id]

            nxt_busy = _next_busy_start(intervals, start_prod)
            hard_end = cap if nxt_busy is None else min(cap, nxt_busy)
            available_run_h = hard_end - start_prod

            if available_run_h < per_piece_h - EPS:
                done[mid] = True
                t[mid] = cap
                continue

            max_qty_fit = int(available_run_h // per_piece_h)
            qty = min(remaining[chosen.id], max_qty_fit)
            if qty <= 0:
                done[mid] = True
                t[mid] = cap
                continue

            # Prevent tiny tail batches: if we can fit very few pieces AND
            # there's still more remaining after this, defer to next day.
            MIN_BATCH_HOURS = 0.1  # at least 6 minutes of production
            is_last_batch = (qty >= remaining[chosen.id])
            if not is_last_batch and qty * per_piece_h < MIN_BATCH_HOURS:
                done[mid] = True
                t[mid] = cap
                continue

            used_h = qty * per_piece_h
            end_prod = start_prod + used_h

            # Guard: floating point can push end_prod just past cap
            if end_prod > cap + EPS:
                qty = max(0, int((cap - start_prod) // per_piece_h))
                if qty <= 0:
                    done[mid] = True
                    t[mid] = cap
                    continue
                used_h = qty * per_piece_h
                end_prod = start_prod + used_h

            if not _interval_is_free(intervals, start_prod, end_prod):
                nxt = _next_mold_free_time_for_window(intervals, start_prod, per_piece_h, cap)
                if nxt is not None and nxt > start_prod + EPS and nxt < cap - EPS:
                    wait_h = nxt - start_prod
                    start_dt = _hour_to_datetime(current_date, shift_start_time, day, start_prod)
                    end_dt = _hour_to_datetime(current_date, shift_start_time, day, nxt)
                    tasks.append({
                        "day": day,
                        "date": str(_day_index_to_date(current_date, day)),
                        "machine_id": mid,
                        "machine_name": machine.name,
                        "machine_group": machine.group,
                        "sequence_in_day": seq[mid],
                        "task_type": "WAIT",
                        "used_hours": wait_h,
                        "start_hour": start_prod,
                        "end_hour": nxt,
                        "start_hour_clock": shift_start_hour + float(start_prod),
                        "end_hour_clock": shift_start_hour + float(nxt),
                        "start_time": _fmt_time(start_dt),
                        "end_time": _fmt_time(end_dt),
                        "start_datetime": start_dt.isoformat(),
                        "end_datetime": end_dt.isoformat(),
                        "utilization": min(1.0, wait_h / cap) if cap > EPS else 0.0,
                    })
                    t[mid] = nxt
                    seq[mid] += 1
                    continue
                done[mid] = True
                t[mid] = cap
                continue

            _reserve_interval(intervals, start_prod, end_prod)

            if chosen.id not in component_owner:
                component_owner[chosen.id] = mid

            start_dt = _hour_to_datetime(current_date, shift_start_time, day, start_prod)
            end_dt = _hour_to_datetime(current_date, shift_start_time, day, end_prod)
            tasks.append({
                "day": day,
                "date": str(_day_index_to_date(current_date, day)),
                "machine_id": mid,
                "machine_name": machine.name,
                "machine_group": machine.group,
                "sequence_in_day": seq[mid],
                "task_type": "PRODUCE",
                "mold_id": chosen.mold_id,
                "component_id": chosen.id,
                "component_name": chosen.name,
                "color": chosen.color,
                "produced_qty": qty,
                "used_hours": used_h,
                "start_hour": start_prod,
                "end_hour": end_prod,
                "start_hour_clock": shift_start_hour + float(start_prod),
                "end_hour_clock": shift_start_hour + float(end_prod),
                "start_time": _fmt_time(start_dt),
                "end_time": _fmt_time(end_dt),
                "start_datetime": start_dt.isoformat(),
                "end_datetime": end_dt.isoformat(),
                "utilization": min(1.0, used_h / cap) if cap > EPS else 0.0,
            })

            remaining[chosen.id] -= qty
            last_component[mid] = chosen.id
            current_mold[mid] = chosen.mold_id
            current_color[mid] = chosen.color

            t[mid] = end_prod
            seq[mid] += 1

            if remaining[chosen.id] <= 0:
                completion_time[chosen.id] = (day, end_prod)

        for m in machines:
            machine_state[m.id]["mold_id"] = current_mold[m.id]
            machine_state[m.id]["color"] = current_color[m.id]
            machine_state[m.id]["last_component_id"] = last_component[m.id]

    unmet = {cid: qty for cid, qty in remaining.items() if qty > 0}
    return tasks, unmet, due_day_by_id, lead_time_days_by_id


def ga_optimize_v2(
    components: List[ProductComponent],
    machines: List[Machine],
    molds: List[Mold],
    month_days: int,
    mold_change_time_minutes: int,
    color_change_time_minutes: int,
    current_date: date,
    start_time: time,
    pop_size: int = 30,
    n_generations: int = 80,
    mutation_rate: float = 0.25,
) -> Dict[str, Any]:
    if month_days < 1:
        raise ValueError("month_days must be >= 1")
    if pop_size < 2:
        raise ValueError("pop_size must be >= 2")
    if n_generations < 1:
        raise ValueError("n_generations must be >= 1")
    if not (0.0 <= float(mutation_rate) <= 1.0):
        raise ValueError("mutation_rate must be between 0 and 1")
    if mold_change_time_minutes < 0 or color_change_time_minutes < 0:
        raise ValueError("changeover minutes must be >= 0")

    population = [_random_genome(components) for _ in range(pop_size)]

    best_score = None
    best_genome = None

    for _ in range(n_generations):
        scored = []
        for g in population:
            tasks, unmet, due_day_by_id, lead_time_days_by_id = _decode_v2(
                genome=g,
                components=components,
                machines=machines,
                molds=molds,
                month_days=month_days,
                mold_change_time_minutes=mold_change_time_minutes,
                color_change_time_minutes=color_change_time_minutes,
                current_date=current_date,
                shift_start_time=start_time,
            )
            score = _fitness_v2(tasks, unmet, components, due_day_by_id, lead_time_days_by_id)
            scored.append((score, g))

        scored.sort(key=lambda x: x[0], reverse=True)
        if best_score is None or scored[0][0] > best_score:
            best_score = scored[0][0]
            best_genome = scored[0][1][:]

        elite_k = max(2, pop_size // 5)
        new_pop = [g[:] for (_, g) in scored[:elite_k]]

        while len(new_pop) < pop_size:
            i, j = random.sample(range(pop_size), 2)
            parent = scored[i][1] if scored[i][0] > scored[j][0] else scored[j][1]
            new_pop.append(parent[:])

        children = []
        for i in range(0, pop_size, 2):
            if i + 1 >= pop_size:
                children.append(new_pop[i][:])
                break
            c1 = _crossover_ox(new_pop[i], new_pop[i + 1])
            c2 = _crossover_ox(new_pop[i + 1], new_pop[i])
            children.extend([c1, c2])

        for i in range(len(children)):
            if random.random() < mutation_rate:
                children[i] = _mutate_swap(children[i][:])

        population = children[:pop_size]

    final_tasks, final_unmet, due_day_by_id, lead_time_days_by_id = _decode_v2(
        genome=best_genome,
        components=components,
        machines=machines,
        molds=molds,
        month_days=month_days,
        mold_change_time_minutes=mold_change_time_minutes,
        color_change_time_minutes=color_change_time_minutes,
        current_date=current_date,
        shift_start_time=start_time,
    )
    final_score = _fitness_v2(final_tasks, final_unmet, components, due_day_by_id, lead_time_days_by_id)

    return {
        "assignments": final_tasks,
        "unmet": final_unmet,
        "score": final_score,
    }