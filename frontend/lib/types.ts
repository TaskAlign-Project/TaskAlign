// Domain objects matching the backend API exactly

export interface Machine {
  id: string
  code: string          // backend primary identifier
  name: string
  group: "small" | "medium" | "large"
  tonnage: number
  hours_per_day: number
  efficiency: number
  status?: MachineStatus // backend returns this on Machine directly
}

export type MachineStatus = "available" | "unavailable"

export interface Mold {
  id: string;      // This is now the UUID from the DB
  code: string;    // This is "MLD1", "MLD2", etc.
  name: string;
  group: "small" | "medium" | "large";
  tonnage: number;
  component_id?: string;
}

export type DependencyMode = "wait_all" | "parallel"

export interface Component {
  id: string
  component_id: string // the code like "C1-ORD001"
  name: string
  quantity: number
  finished: number
  cycle_time_sec: number
  mold_id: string
  color: string
  start_date: string // ISO date string (YYYY-MM-DD)
  due_date: string   // ISO date string (YYYY-MM-DD)
  lead_time_days: number
  prerequisites: string[]
  dependency_mode: DependencyMode
  transfer_time_minutes: number
  dependency_transfer_time_minutes?: number
  order_code?: string                         
  plan_id?: string
}

export interface PlanSetup {
  month_days: number
  current_date: string // ISO date string (YYYY-MM-DD) - the start date of the schedule
  start_time: string   // Time string (HH:MM) - the time of day when factory begins work
  mold_change_time_minutes: number
  color_change_time_minutes: number
  pop_size: number
  n_generations: number
  mutation_rate: number
}

// Schedule request payload
export interface ScheduleRequest {
  month_days: number
  mold_change_time_minutes: number
  color_change_time_minutes: number
  machines: Machine[]
  molds: Mold[]
  components: Component[]
  pop_size: number
  n_generations: number
  mutation_rate: number
}

// Schedule response
export interface Assignment {
  day: number
  machine_id: string
  machine_name: string
  sequence_in_day: number
  task_type: "CHANGE_COLOR" | "CHANGE_MOLD" | "WAIT" | "PRODUCE" | "TRANSFER"
  start_hour_clock: number
  end_hour_clock: number
  used_hours: number
  utilization?: number
  component_id?: string
  component_name?: string
  produced_qty?: number
  mold_id?: string
  color?: string
  from_color?: string
  to_color?: string
  from_mold_id?: string
  to_mold_id?: string
}

export interface ScheduleResponse {
  assignments: Assignment[]
  unmet: Record<string, number>
  score: number
}

// ---- Plan-specific types ----

export type PlanMachine = Machine & { status: MachineStatus }

export interface PlanRun {
  id: string
  plan_id: string
  run_name?: string
  run_at: string        // backend uses run_at, not created_at
  status: "completed" | "failed"
  score?: number
  unmet?: Record<string, number>
  assignments?: Assignment[]
  // Keep these for localStorage compat if needed
  mode?: "fresh" | "resume"
  created_at?: string
  result?: ScheduleResponse  // legacy localStorage shape
}

export interface Plan {
  id: string
  name: string
  current_date: string          
  start_time: string
  month_days: number
  mold_change_time_minutes: number
  color_change_time_minutes: number
  pop_size: number
  n_generations: number
  mutation_rate: number
  created_at: string
  updated_at: string
}
