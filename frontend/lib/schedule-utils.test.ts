import assert from "node:assert/strict"
import test from "node:test"

import type { Assignment } from "./types.ts"

import {
  buildAssignmentsWorkbook,
  filterAssignmentsBySearch,
  filterTimelineAssignments,
  getTimelineSearchEmptyMessage,
  formatRunDate,
  resolveScheduleStartDate,
  getAssignmentIndices,
  describeExportFilters,
  inferRunStartDate,
} from "./schedule-utils.ts"


test("uses the saved plan date when a run has no request snapshot", () => {
  const startDate = resolveScheduleStartDate(
    {},
    { current_date: "2026-02-10" }
  )

  assert.equal(startDate, "2026-02-10")
})

test("prefers the run snapshot for a historical run", () => {
  const startDate = resolveScheduleStartDate(
    { request_snapshot: { current_date: "2026-01-05" } },
    { current_date: "2026-02-10" }
  )

  assert.equal(startDate, "2026-01-05")
})

test("supports the legacy nested setup date", () => {
  const startDate = resolveScheduleStartDate(
    {},
    {
      setup: { current_date: "2026-03-15" },
    }
  )

  assert.equal(startDate, "2026-03-15")
})

test("uses the default only when no saved date exists", () => {
  const startDate = resolveScheduleStartDate(
    {},
    {}
  )

  assert.equal(startDate, "2026-01-01")
})

test("formats run dates as DD/MM/YYYY", () => {
  assert.equal(formatRunDate("2026-04-09T12:00:00Z"), "09/04/2026")
})

test("shows a fallback for a missing run date", () => {
  assert.equal(formatRunDate(undefined), "No date")
})

test("builds an Excel workbook containing schedule assignments", () => {
  const workbook = buildAssignmentsWorkbook([
    {
      day: 1,
      machine_id: "M1",
      machine_name: "Small-01",
      sequence_in_day: 1,
      task_type: "PRODUCE",
      start_hour_clock: 8,
      end_hour_clock: 9,
      used_hours: 1,
      mold_id: "Mold Small A",
      component_id: "C1",
      component_name: "Base Part",
      produced_qty: 100,
      color: "black",
    },
  ])

  assert.deepEqual(workbook.SheetNames, ["Schedule"])
  const sheet = workbook.Sheets.Schedule
  assert.equal(sheet.A1.v, "Day")
  assert.equal(sheet.K1.v, "Mold")
  assert.equal(sheet.A2.v, 1)
  assert.equal(sheet.K2.v, "Mold Small A")
  assert.equal(sheet.N2.v, 100)
})

const searchableAssignments = [
  {
    day: 1,
    machine_id: "M1",
    machine_name: "Small-01",
    sequence_in_day: 1,
    task_type: "PRODUCE" as const,
    start_hour_clock: 8,
    end_hour_clock: 9,
    used_hours: 1,
    mold_id: "Mold Small A",
    component_id: "C10",
    component_name: "Base Part",
    produced_qty: 100,
  },
]

test("timeline search is case-insensitive", () => {
  assert.deepEqual(
    filterAssignmentsBySearch(searchableAssignments, "c10"),
    searchableAssignments
  )
  assert.deepEqual(
    filterAssignmentsBySearch(searchableAssignments, "bAsE pArT"),
    searchableAssignments
  )
})

test("an absent component ID produces an empty timeline result", () => {
  assert.deepEqual(filterAssignmentsBySearch(searchableAssignments, "C1"), [])
})

test("C1 does not match other demo component names that mention C1", () => {
  const assignments = [
    {
      ...searchableAssignments[0],
      component_id: "C2",
      component_name: "Cover (wait_all on C1 + transfer)",
    },
    {
      ...searchableAssignments[0],
      component_id: "C4",
      component_name: "Clip (independent, color change from C1)",
    },
  ]

  assert.deepEqual(filterAssignmentsBySearch(assignments, "C1"), [])
})

test("timeline names require a complete case-insensitive match", () => {
  assert.deepEqual(filterAssignmentsBySearch(searchableAssignments, "base"), [])
  assert.deepEqual(
    filterAssignmentsBySearch(searchableAssignments, "BASE PART"),
    searchableAssignments
  )
})

test("an unknown search produces an empty timeline result", () => {
  assert.deepEqual(
    filterAssignmentsBySearch(searchableAssignments, "does-not-exist"),
    []
  )
})

test("empty timeline search explains when a component is completed", () => {
  const components = [
    {
      component_id: "C1",
      name: "Base Part",
      quantity: 100,
      finished: 100,
    },
  ]

  assert.equal(
    getTimelineSearchEmptyMessage("c1", components),
    "Component “C1” is completed and is not included in this timeline."
  )
  assert.equal(
    getTimelineSearchEmptyMessage("unknown", components),
    "No assignments found for “unknown” in this timeline."
  )
})

test("completed C1 is hidden even when an older run still contains C1", () => {
  const historicalAssignments = [
    {
      ...searchableAssignments[0],
      component_id: "C1",
      component_name: "Base Part (multi-day workload)",
    },
    {
      ...searchableAssignments[0],
      component_id: "C2",
      component_name: "Cover (wait_all on C1 + transfer)",
    },
  ]
  const components = [
    {
      component_id: "C1",
      name: "Base Part (multi-day workload)",
      quantity: 8000,
      finished: 8000,
    },
  ]

  assert.deepEqual(
    filterTimelineAssignments(historicalAssignments, "c1", components),
    []
  )
})


// ---- Export Excel: send the server what the filters leave on screen ----

function makeTask(overrides: Partial<Assignment>): Assignment {
  return {
    day: 1,
    machine_id: "M01",
    machine_name: "Machine 1",
    sequence_in_day: 1,
    task_type: "PRODUCE",
    start_hour_clock: 0,
    end_hour_clock: 1,
    used_hours: 1,
    ...overrides,
  }
}

test("getAssignmentIndices returns the positions of the filtered items in the full run", () => {
  const all = [
    makeTask({ day: 1, machine_id: "M01" }),
    makeTask({ day: 2, machine_id: "M02" }),
    makeTask({ day: 3, machine_id: "M01" }),
    makeTask({ day: 4, machine_id: "M03" }),
  ]
  const subset = all.filter((a) => a.machine_id === "M01")

  assert.deepEqual(getAssignmentIndices(all, subset), [0, 2])
})

test("getAssignmentIndices ignores the order of the subset (the page sorts its copy)", () => {
  const all = [makeTask({ day: 1 }), makeTask({ day: 2 }), makeTask({ day: 3 })]
  const sortedDescending = [...all].sort((a, b) => b.day - a.day)

  assert.deepEqual(getAssignmentIndices(all, sortedDescending), [0, 1, 2])
})

test("getAssignmentIndices is empty when nothing matches", () => {
  const all = [makeTask({ day: 1 })]
  assert.deepEqual(getAssignmentIndices(all, []), [])
})

test("the page's own filters keep object identity, so indices map back to the run", () => {
  // The Output page filters, searches and sorts a *copy*; the export relies on
  // those steps handing back the original assignment objects.
  const all = [
    makeTask({ component_id: "C1", component_name: "Lid", mold_id: "M-1" }),
    makeTask({ component_id: "C2", component_name: "Body", mold_id: "M-2" }),
    makeTask({ component_id: "C10", component_name: "Hinge", mold_id: "M-3" }),
  ]
  const searched = filterAssignmentsBySearch(all, "C1")
  const sortedCopy = [...searched].sort((a, b) => a.day - b.day)

  assert.deepEqual(getAssignmentIndices(all, sortedCopy), [0])
  assert.equal(sortedCopy[0], all[0])
})

test("describeExportFilters lists only the filters in force", () => {
  assert.equal(describeExportFilters({}), "")
  assert.equal(
    describeExportFilters({
      dayStart: "5 Nov",
      dayEnd: "10 Nov",
      machineGroup: "Large",
      machine: "M121G - Nanrong",
      taskTypes: ["Production"],
      search: " C1 ",
    }),
    'Dates: 5 Nov to 10 Nov | Machine group: Large | Machine: M121G - Nanrong | Task types: Production | Search: "C1"'
  )
})

test("describeExportFilters handles a half-open date range", () => {
  assert.equal(describeExportFilters({ dayStart: "5 Nov" }), "Dates: 5 Nov to end")
  assert.equal(describeExportFilters({ dayEnd: "10 Nov" }), "Dates: start to 10 Nov")
})

test("describeExportFilters ignores a blank search", () => {
  assert.equal(describeExportFilters({ search: "   " }), "")
})


// ---- A run keeps the start date it was generated with ----

test("a run shows its own start date, not the plan's newer one", () => {
  // Run #1 was generated starting 1 Nov; the plan has since been moved to 2 Nov.
  const run = {
    assignments: [
      { day: 1, date: "2025-11-01" },
      { day: 2, date: "2025-11-02" },
      { day: 5, date: "2025-11-05" },
    ],
  }

  assert.equal(resolveScheduleStartDate(run, { current_date: "2025-11-02" }), "2025-11-01")
})

test("each run resolves to its own start date", () => {
  const plan = { current_date: "2025-11-02" }
  const run1 = { assignments: [{ day: 1, date: "2025-11-01" }, { day: 3, date: "2025-11-03" }] }
  const run2 = { assignments: [{ day: 1, date: "2025-11-02" }, { day: 3, date: "2025-11-04" }] }

  assert.equal(resolveScheduleStartDate(run1, plan), "2025-11-01")
  assert.equal(resolveScheduleStartDate(run2, plan), "2025-11-02")
})

test("a run that starts mid-run in the data still resolves to day 1", () => {
  // Day 1 may have no task at all (e.g. a weekend); day 3 alone is enough.
  assert.equal(inferRunStartDate([{ day: 3, date: "2025-11-05" }]), "2025-11-03")
})

test("start date inference crosses month and year boundaries", () => {
  assert.equal(inferRunStartDate([{ day: 5, date: "2026-01-02" }]), "2025-12-29")
  assert.equal(inferRunStartDate([{ day: 3, date: "2026-03-01" }]), "2026-02-27")
})

test("a few stale dates do not change the answer (majority wins)", () => {
  const tasks = [
    { day: 1, date: "2025-11-01" },
    { day: 2, date: "2025-11-02" },
    { day: 3, date: "2025-11-03" },
    { day: 9, date: "2025-11-04" }, // moved by hand; its date was never updated
  ]

  assert.equal(inferRunStartDate(tasks), "2025-11-01")
})

test("falls back to start_datetime when a task has no date", () => {
  assert.equal(
    inferRunStartDate([{ day: 2, start_datetime: "2025-11-02T05:00:00" }]),
    "2025-11-01"
  )
})

test("tasks without a usable date are ignored, then the plan date is used", () => {
  const run = { assignments: [{ day: 1, date: "" }, { day: 2 }, { day: 0, date: "2025-11-01" }] }

  assert.equal(inferRunStartDate(run.assignments), undefined)
  assert.equal(resolveScheduleStartDate(run, { current_date: "2025-11-02" }), "2025-11-02")
})

test("an explicit snapshot on the run still takes priority", () => {
  const run = {
    request_snapshot: { current_date: "2025-10-15" },
    assignments: [{ day: 1, date: "2025-11-01" }],
  }

  assert.equal(resolveScheduleStartDate(run, { current_date: "2025-11-02" }), "2025-10-15")
})

test("a run with no tasks falls back to the plan date", () => {
  assert.equal(resolveScheduleStartDate({}, { current_date: "2025-11-02" }), "2025-11-02")
  assert.equal(resolveScheduleStartDate({ assignments: [] }, { current_date: "2025-11-02" }), "2025-11-02")
})
