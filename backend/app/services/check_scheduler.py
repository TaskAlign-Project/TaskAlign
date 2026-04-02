from collections import defaultdict
from typing import List, Dict, Tuple


EPS = 1e-9


def check_overlap_rule(assignments) -> List[Dict]:
    """Rule 1: No overlapping tasks on the same machine (same day)."""
    violations = []
    machine_day_intervals: Dict[Tuple, List] = defaultdict(list)

    for a in assignments:
        key = (a.machine_id, a.day)
        machine_day_intervals[key].append((a.start_hour, a.end_hour, a.sequence_in_day))

    for (mid, day), intervals in machine_day_intervals.items():
        intervals.sort(key=lambda x: x[0])
        for i in range(len(intervals) - 1):
            _, end_i, seq_i = intervals[i]
            start_j, _, seq_j = intervals[i + 1]
            if end_i > start_j + EPS:
                violations.append({
                    "rule": "OVERLAP",
                    "detail": (
                        f"Machine {mid} day {day}: task seq {seq_i} "
                        f"(ends {end_i:.3f}h) overlaps with seq {seq_j} "
                        f"(starts {start_j:.3f}h)"
                    ),
                })

    return violations


def check_mold_conflict_rule(assignments) -> List[Dict]:
    """Rule 2: Same mold used by 2 different machines at the same time (same day)."""
    violations = []
    mold_day_intervals: Dict[Tuple, List] = defaultdict(list)

    for a in assignments:
        mold = None
        if a.task_type == "PRODUCE":
            mold = a.mold_id
        elif a.task_type == "CHANGE_MOLD":
            mold = a.to_mold_id
        if mold:
            mold_day_intervals[(mold, a.day)].append((a.start_hour, a.end_hour, a.machine_id))

    for (mold_id, day), intervals in mold_day_intervals.items():
        for i in range(len(intervals)):
            for j in range(i + 1, len(intervals)):
                s1, e1, m1 = intervals[i]
                s2, e2, m2 = intervals[j]
                if m1 != m2 and not (e1 <= s2 + EPS or e2 <= s1 + EPS):
                    violations.append({
                        "rule": "MOLD_CONFLICT",
                        "detail": (
                            f"Mold {mold_id} day {day}: used by {m1} "
                            f"({s1:.2f}-{e1:.2f}h) and {m2} "
                            f"({s2:.2f}-{e2:.2f}h) simultaneously"
                        ),
                    })

    return violations


def check_sequence_rule(assignments) -> List[Dict]:
    """Rule 3: sequence_in_day must be consecutive starting from 1 per machine per day."""
    violations = []
    machine_day_seqs: Dict[Tuple, List] = defaultdict(list)

    for a in assignments:
        machine_day_seqs[(a.machine_id, a.day)].append(a.sequence_in_day)

    for (mid, day), seqs in machine_day_seqs.items():
        seqs_sorted = sorted(seqs)
        expected = list(range(1, len(seqs_sorted) + 1))
        if seqs_sorted != expected:
            violations.append({
                "rule": "BAD_SEQUENCE",
                "detail": (
                    f"Machine {mid} day {day}: sequence_in_day is "
                    f"{seqs_sorted}, expected {expected}"
                ),
            })

    return violations


def check_produce_fields_rule(assignments) -> List[Dict]:
    """Rule 4: PRODUCE tasks must have component_id and produced_qty > 0."""
    violations = []

    for a in assignments:
        if a.task_type == "PRODUCE":
            if not a.component_id:
                violations.append({
                    "rule": "MISSING_COMPONENT",
                    "detail": (
                        f"Machine {a.machine_id} day {a.day} seq "
                        f"{a.sequence_in_day}: PRODUCE task missing component_id"
                    ),
                })
            if (a.produced_qty or 0) <= 0:
                violations.append({
                    "rule": "ZERO_QTY",
                    "detail": (
                        f"Machine {a.machine_id} day {a.day} seq "
                        f"{a.sequence_in_day}: PRODUCE task has produced_qty <= 0"
                    ),
                })

    return violations


def check_zero_hours_rule(assignments) -> List[Dict]:
    """Rule 5: used_hours must be > 0 for all tasks."""
    violations = []

    for a in assignments:
        if a.used_hours <= 0:
            violations.append({
                "rule": "ZERO_HOURS",
                "detail": (
                    f"Machine {a.machine_id} day {a.day} seq "
                    f"{a.sequence_in_day}: task_type {a.task_type} "
                    f"has used_hours <= 0"
                ),
            })

    return violations


def run_all_rule_checks(assignments) -> List[Dict]:
    """Run all rule checks and return a combined list of violations."""
    violations = []
    violations += check_overlap_rule(assignments)
    violations += check_mold_conflict_rule(assignments)
    violations += check_sequence_rule(assignments)
    violations += check_produce_fields_rule(assignments)
    violations += check_zero_hours_rule(assignments)
    return violations


def check_unmet(assignments, db_components) -> List[Dict]:
    """
    Sum produced_qty per component_id from assignments,
    compare against required qty from db_components.
    Returns a list of unmet details for components that are short.
    """
    produced_map: Dict[str, int] = defaultdict(int)
    for a in assignments:
        if a.task_type == "PRODUCE" and a.component_id and (a.produced_qty or 0) > 0:
            produced_map[a.component_id] += a.produced_qty

    unmet_details = []
    for comp in db_components:
        cid = comp.component_id
        required = max(int(comp.quantity) - int(comp.finished or 0), 0)
        produced = produced_map.get(cid, 0)
        if produced < required:
            unmet_details.append({
                "component_id": cid,
                "required": required,
                "produced": produced,
                "shortfall": required - produced,
            })

    return unmet_details