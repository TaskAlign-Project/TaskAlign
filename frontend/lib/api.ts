import type { ScheduleRequest, ScheduleResponse } from "./types"

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"

export async function runSchedule(
  payload: ScheduleRequest
): Promise<ScheduleResponse> {
  const res = await fetch(`${BASE_URL}/schedule_v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    let message = `Server error: ${res.status}`
    try {
      const body = await res.json()
      if (body.detail) {
        message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }

  return res.json()
}
