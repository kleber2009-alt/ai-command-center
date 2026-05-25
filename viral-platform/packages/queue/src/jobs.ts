// One queue per worker type. The name doubles as the ENV-selected worker role.
export const QUEUE = {
  transcribe: 'transcribe',
  detect: 'detect-clips',
  broll: 'broll-plan',
  renderPreview: 'render-preview',
  renderFinal: 'render-final',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

// Typed payloads for each job. Keep these minimal — workers re-load heavy data
// (transcript JSON, etc.) from R2/DB so jobs stay small and idempotent (§3).
export interface TranscribeJob {
  projectId: string;
  userId: string;
  sourceVideoR2Key: string;
  durationMs: number;
}

export interface DetectClipsJob {
  projectId: string;
  userId: string;
}

export interface BrollPlanJob {
  projectId: string;
  userId: string;
  clipId: string;
}

export interface RenderJob {
  projectId: string;
  userId: string;
  clipId: string;
  renderId: string;
  format: '9:16' | '1:1' | '16:9';
  quality: '1080p' | '4k';
  captionPreset: string;
  preview: boolean;
}

export interface JobPayloads {
  [QUEUE.transcribe]: TranscribeJob;
  [QUEUE.detect]: DetectClipsJob;
  [QUEUE.broll]: BrollPlanJob;
  [QUEUE.renderPreview]: RenderJob;
  [QUEUE.renderFinal]: RenderJob;
}
