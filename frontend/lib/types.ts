// Domain objects matching the backend API exactly

export interface Machine {
  id: string
  name: string
  group: "small" | "medium" | "large"
  tonnage: number
  hours_per_day: number
  efficiency: number
}

export interface Mold {
  id: string
  name: string
  group: "small" | "medium" | "large"
  tonnage: number
}

export interface Component {
  id: string
  name: string
  quantity: number
  cycle_time_sec: number
  mold_id: string
  color: string
  due_day: number
  lead_time_days: number
  prerequisites: string[]
}

export interface PlanSetup {
  month_days: number
  mold_change_time_hours: number
  color_change_time_hours: number
  pop_size: number
  n_generations: number
  mutation_rate: number
}

// Schedule request payload
export interface ScheduleRequest {
  month_days: number
  mold_change_time_hours: number
  color_change_time_hours: number
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
  task_type: "CHANGE_COLOR" | "CHANGE_MOLD" | "WAIT" | "PRODUCE"
  start_hour: number
  end_hour: number
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
