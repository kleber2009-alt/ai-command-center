/**
 * Project lifecycle, mirroring the pipeline in the spec (§3).
 * uploaded → transcribing → detecting → planning_broll → rendering_preview
 *   → ready_for_review → rendering_final → done | failed
 */
export const PROJECT_STATUS = [
  'uploaded',
  'transcribing',
  'detecting',
  'planning_broll',
  'rendering_preview',
  'ready_for_review',
  'rendering_final',
  'done',
  'failed',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number];

/** The status a project enters while a given job type runs. */
export const JOB_TO_STATUS = {
  transcribe: 'transcribing',
  'detect-clips': 'detecting',
  'broll-plan': 'planning_broll',
  'render-preview': 'rendering_preview',
  'render-final': 'rendering_final',
} as const satisfies Record<string, ProjectStatus>;

export const CLIP_STATUS = [
  'pending',
  'planning',
  'ready',
  'rendering',
  'rendered',
  'failed',
] as const;
export type ClipStatus = (typeof CLIP_STATUS)[number];

export const RENDER_STATUS = ['queued', 'rendering', 'done', 'failed'] as const;
export type RenderStatus = (typeof RENDER_STATUS)[number];
