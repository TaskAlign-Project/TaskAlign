import assert from "node:assert/strict"
import test from "node:test"

import { formatRunDate, resolveScheduleStartDate } from "./schedule-utils.ts"


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
