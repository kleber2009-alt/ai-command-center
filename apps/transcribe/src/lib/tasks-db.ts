export type TaskStatus = 'backlog' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskProject = 'transcribe' | 'ytdlp' | 'ai-office' | 'general'

export type Task = {
  id: string
  created_at: string
  updated_at: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  stage: string | null
  position: number
  project: TaskProject
}

export const TASK_STATUSES: TaskStatus[] = ['backlog', 'in_progress', 'blocked', 'done']

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'low',
  medium: 'med',
  high: 'high',
}

export const TASK_PROJECTS: TaskProject[] = ['transcribe', 'ytdlp', 'ai-office', 'general']

export const PROJECT_LABEL: Record<TaskProject, string> = {
  transcribe: 'Transcribe',
  ytdlp: 'yt-dlp',
  'ai-office': 'AI Office',
  general: 'General',
}
