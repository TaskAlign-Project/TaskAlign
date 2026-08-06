import assert from "node:assert/strict"
import test from "node:test"

import {
  buildAssignmentsWorkbook,
  filterAssignmentsBySearch,
  filterTimelineAssignments,
  getTimelineSearchEmptyMessage,
  formatRunDate,
  resolveScheduleStartDate,
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
