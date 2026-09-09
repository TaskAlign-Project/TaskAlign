import pytest

from app.services.overview_import import (
    ImportReport,
    OrderRow,
    OverviewRow,
    build_components,
    build_molds,
    extract_color,
    normalize_group,
    normalize_key,
    parse_date,
    to_int,
)


# --- scalars ---------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("SMALL", "small"), ("MIDDLE", "medium"), ("BIG", "large"),
    (" small ", "small"), ("medium", "medium"), (None, None), ("หม้อใหญ่", None),
])
def test_normalize_group(raw, expected):
    assert normalize_group(raw) == expected


def test_unknown_group_is_none_not_a_default():
    """A wrong guess makes the component silently unschedulable, because
    ga_scheduler compares mold.group to machine.group with !=."""
    assert normalize_group("EXTRA LARGE") is None


@pytest.mark.parametrize("raw,expected", [
    (300000000911, "300000000911"),        # Overview stores an int
    ("'300000006233", "300000006233"),     # ZPPI prefixes an apostrophe
    (300000000911.0, "300000000911"),      # pandas/openpyxl float coercion
    ("  300000000911  ", "300000000911"),
    (None, ""),
])
def test_normalize_key_makes_both_sides_joinable(raw, expected):
    assert normalize_key(raw) == expected


def test_to_int_survives_blank_cells():
    """openpyxl returns None for empty cells and int(None) raises."""
    assert to_int(None) == 0
    assert to_int("") == 0
    assert to_int(3600.0) == 3600
    assert to_int("not a number", default=7) == 7


@pytest.mark.parametrize("raw,expected", [
    ("01.11.2025", "2025-11-01"),
    ("2025-11-01", "2025-11-01"),
    ("'04.11.2025", "2025-11-04"),
    ("300000006233-01.11.2025", None),   # the duplicate-column junk value
    (None, None),
])
def test_parse_date(raw, expected):
    assert parse_date(raw) == expected


# --- colour ----------------------------------------------------------------

@pytest.mark.parametrize("desc,expected", [
    ("LEG KSH-D15/D18'BLUE'", "BLUE"),
    ("HANDLE COVER KS-A18TTIND (GRAY)", "GRAY"),
    ("LEG KSH-206/211'GREEN", "GREEN"),          # unterminated quote
    ("LEG KSH-D18WH", "WHITE"),                  # WH suffix
    ("LID COVER KS-PR18ET 'DARK VANILLA'", "DARK VANILLA"),
    ("PANEL KSH'LIGHT GRAY'", "LIGHT GRAY"),     # longest match wins
    ("SWITCH BUTTON KSH-Q11/Q18", ""),           # genuinely no colour
    ("PCB HOLDER (2018)", ""),                   # parenthesised non-colour
])
def test_extract_color(desc, expected):
    assert extract_color(desc) == expected


def test_color_typos_fold_to_one_spelling():
    """Otherwise the GA charges a colour changeover between GRAY and GARY."""
    assert extract_color("LEG KSH'DARK GARY'") == extract_color("LEG KSH'DARK GRAY'")


# --- molds -----------------------------------------------------------------

def _ov(material, mold_code, group="small", tonnage=120, desc="PART", cycle=10.0, row=3, id_machine=""):
    return OverviewRow(
        material=material, mold_code=mold_code, description=desc, group=group,
        tonnage=tonnage, cycle_time_sec=cycle, color=extract_color(desc), excel_row=row,
        id_machine=id_machine,
    )


def test_one_mold_many_materials_collapses_to_one_mold():
    """A mold serves several material numbers because the same part is made in
    several colours."""
    rows = {
        "1": _ov("1", "1B4113BN", desc="LEG'GREEN'"),
        "2": _ov("2", "1B4113BN", desc="LEG'BLUE'"),
        "3": _ov("3", "1B4113BN", desc="LEG'GRAY'"),
    }
    molds = build_molds(rows, ImportReport())
    assert len(molds) == 1
    assert molds[0]["code"] == molds[0]["name"] == "1B4113BN"


def test_mold_code_and_name_are_identical():
    """api_v1.run_plan joins components to molds on the mold NAME, so code and
    name must match or build_mold_aliases cannot resolve mold_id."""
    molds = build_molds({"1": _ov("1", "11A206AN")}, ImportReport())
    assert molds[0]["code"] == molds[0]["name"]


def test_different_tonnage_splits_into_separate_molds():
    """Merging different-tonnage rows by taking the max used to produce a mold
    spec no machine actually satisfies. Each distinct (group, tonnage) is now
    its own mold instead, named "<code>-<group>-<tonnage>T"."""
    rows = {"1": _ov("1", "11G203AN", tonnage=160), "2": _ov("2", "11G203AN", tonnage=190)}
    molds = build_molds(rows, ImportReport())
    assert {m["tonnage"] for m in molds} == {160, 190}
    assert {m["code"] for m in molds} == {"11G203AN-small-160T", "11G203AN-small-190T"}


def test_mold_component_id_is_left_unset():
    """One mold maps to many materials, so no single value is correct — and
    ga_scheduler never reads the field."""
    assert build_molds({"1": _ov("1", "A")}, ImportReport())[0]["component_id"] is None


def test_conflicting_group_or_tonnage_splits_into_separate_molds():
    """A mold code logged against both a 90T small press (some colours) and a
    160T medium press (others) used to merge into group=small, tonnage=160 --
    a spec no small machine satisfies, silently making every component on that
    mold unschedulable. Splitting by the exact (group, tonnage) pairing keeps
    each variant on the machine class it was actually produced on."""
    rows = {
        "1": _ov("1", "2C304CN", group="small", tonnage=90),
        "2": _ov("2", "2C304CN", group="small", tonnage=90),
        "3": _ov("3", "2C304CN", group="medium", tonnage=160),
    }
    report = ImportReport()
    molds = build_molds(rows, report)
    assert len(molds) == 2
    by_tonnage = {m["tonnage"]: m for m in molds}
    assert by_tonnage[90]["group"] == "small"
    assert by_tonnage[160]["group"] == "medium"
    assert any("split into separate molds" in w for w in report.warnings)


def test_components_resolve_to_the_split_mold_that_matches_their_own_row():
    """Each material keeps the mold variant it was actually logged against,
    rather than inheriting whatever (group, tonnage) another colour's row
    happened to merge in as."""
    overview = {
        "A": _ov("A", "11C202AN", group="small", tonnage=90),
        "B": _ov("B", "11C202AN", group="medium", tonnage=160),
    }
    build_molds(overview, ImportReport())  # mutates resolved_mold_id in place
    components = build_components(
        overview, [_order("A", "O1"), _order("B", "O2")], ImportReport()
    )
    mold_id_by_material = {c["component_id"].split("-")[0]: c["mold_id"] for c in components}
    assert mold_id_by_material["A"] == "11C202AN-small-90T"
    assert mold_id_by_material["B"] == "11C202AN-medium-160T"


def test_wrong_overview_group_is_corrected_from_machine_specs():
    """Overview's typed "Machine group"/"Size (Ton)" columns are free text and
    can disagree with the machine named in "ID Machine" (e.g. a 350T press
    mislabelled MIDDLE). With only one row for the mold there's nothing to
    split against, so the real machine's spec must win instead."""
    rows = {"1": _ov("1", "91A207AN", group="medium", tonnage=350, id_machine="M122Y")}
    report = ImportReport()
    molds = build_molds(rows, report, machine_specs={"M122Y": ("large", 350)})
    assert len(molds) == 1
    assert molds[0]["group"] == "large"
    assert molds[0]["code"] == "91A207AN"  # still a single variant -- no split needed
    assert any("machines table says" in w for w in report.warnings)


def test_no_machine_specs_leaves_overview_label_untouched():
    """Without a machines lookup (e.g. parsing outside a DB session), the
    Overview label is trusted as before -- this is an additive check, not a
    required one."""
    rows = {"1": _ov("1", "91A207AN", group="medium", tonnage=350, id_machine="M122Y")}
    molds = build_molds(rows, ImportReport())
    assert molds[0]["group"] == "medium"


def test_unrecognised_id_machine_is_left_alone():
    """A machine code Overview names but that isn't in the machines table
    (e.g. retired, or a typo) has nothing to correct against -- it falls
    through to the feasibility check below instead."""
    rows = {"1": _ov("1", "91A207AN", group="large", tonnage=350, id_machine="M999Z")}
    molds = build_molds(rows, ImportReport(), machine_specs={"M122Y": ("large", 350)})
    assert molds[0]["group"] == "large"


def test_tonnage_no_real_machine_can_reach_is_rejected_not_imported():
    """91A207AN needing a 350T MEDIUM machine (the uncorrected label, e.g. ID
    Machine wasn't recognised) matches nothing -- the largest medium machine
    is only 190T. Rather than creating an unschedulable mold, it's rejected
    outright and reported so the user fixes Overview before re-importing."""
    rows = {"1": _ov("1", "91A207AN", group="medium", tonnage=350, id_machine="")}
    report = ImportReport()
    machine_specs = {"M112G": ("medium", 190), "M121G": ("large", 420)}
    molds = build_molds(rows, report, machine_specs=machine_specs)
    assert molds == []
    assert rows["1"].rejected_reason
    warning = next(w for w in report.warnings if "91A207AN" in w)
    assert "medium" in warning and "350T" in warning and "190T" in warning
    assert "Not imported" in warning


def test_rejected_material_drops_its_orders_instead_of_importing_them():
    overview = {"1": _ov("1", "91A207AN", group="medium", tonnage=350)}
    report = ImportReport()
    build_molds(overview, report, machine_specs={"M112G": ("medium", 190)})
    components = build_components(overview, [_order("1", "O1")], report)
    assert components == []
    assert report.stats["orders_rejected_infeasible"] == 1


def test_feasible_variant_of_a_split_mold_is_kept_even_if_a_sibling_is_rejected():
    """2T201AN logged as 350T against both a real 350T LARGE press (valid) and
    -- via a mislabelled row -- effectively needing 350T on a machine group
    that tops out at 190T (invalid). The valid variant must still be
    imported; only the impossible one is dropped."""
    rows = {
        "1": _ov("1", "2T201AN", group="large", tonnage=350, id_machine="M121G"),
        "2": _ov("2", "2T201AN", group="medium", tonnage=350, id_machine=""),
    }
    report = ImportReport()
    machine_specs = {"M112G": ("medium", 190), "M121G": ("large", 420)}
    molds = build_molds(rows, report, machine_specs=machine_specs)
    assert len(molds) == 1
    assert molds[0]["group"] == "large"
    assert rows["2"].rejected_reason
    assert rows["1"].resolved_mold_id == "2T201AN"  # only one feasible variant -- no split needed


# --- components ------------------------------------------------------------

def _order(material, order, planned=100, produced=0):
    return OrderRow(
        material=material, order=order, planned=planned, produced=produced,
        start_date="2025-11-01", due_date="2025-11-04", description="", excel_row=4,
    )


def test_one_component_per_production_order():
    overview = {"300000007114": _ov("300000007114", "3K201AN")}
    orders = [_order("300000007114", "209000000001"), _order("300000007114", "209000000002")]
    components = build_components(overview, orders, ImportReport())
    assert [c["component_id"] for c in components] == [
        "300000007114-209000000001",
        "300000007114-209000000002",
    ]


def test_component_ids_stay_unique_across_orders():
    """component_id is the GA node id and the unmet key; collisions make
    dependency resolution ambiguous."""
    overview = {"M": _ov("M", "A")}
    orders = [_order("M", f"ORD{i}") for i in range(11)]
    components = build_components(overview, orders, ImportReport())
    assert len({c["component_id"] for c in components}) == 11


def test_produced_quantity_becomes_finished():
    """check_unmet computes max(quantity - finished, 0), so fulfilled orders
    resolve to zero remaining work without being filtered out."""
    overview = {"M": _ov("M", "A")}
    components = build_components(overview, [_order("M", "O", planned=200, produced=200)], ImportReport())
    assert components[0]["quantity"] == 200
    assert components[0]["finished"] == 200


def test_finished_is_clamped_to_quantity():
    overview = {"M": _ov("M", "A")}
    components = build_components(overview, [_order("M", "O", planned=100, produced=150)], ImportReport())
    assert components[0]["finished"] == 100


def test_skip_completed_drops_fulfilled_orders():
    overview = {"M": _ov("M", "A")}
    orders = [_order("M", "DONE", planned=10, produced=10), _order("M", "OPEN", planned=10, produced=0)]
    components = build_components(overview, orders, ImportReport(), skip_completed=True)
    assert [c["order_code"] for c in components] == ["OPEN"]


def test_orders_without_an_overview_row_are_skipped_with_a_warning():
    """No Overview row means no mold and no cycle time — unschedulable."""
    report = ImportReport()
    components = build_components({}, [_order("999", "O")], report)
    assert components == []
    assert report.stats["orders_unmatched"] == 1
    assert any("no" in w and "Overview" in w for w in report.warnings)


def test_mold_id_references_the_mold_name():
    overview = {"M": _ov("M", "3K201AN")}
    components = build_components(overview, [_order("M", "O")], ImportReport())
    molds = build_molds(overview, ImportReport())
    assert components[0]["mold_id"] in {m["name"] for m in molds}


def test_missing_colour_is_empty_not_guessed():
    """Blank-colour parts all match each other in ga_scheduler and so incur no
    changeover, which is the intended behaviour."""
    overview = {"M": _ov("M", "A", desc="SWITCH BUTTON KSH-Q11/Q18")}
    components = build_components(overview, [_order("M", "O")], ImportReport())
    assert components[0]["color"] == ""