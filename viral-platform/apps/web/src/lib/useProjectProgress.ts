'use client';

import type { ProjectStatus } from '@vp/shared';
import { useEffect, useState } from 'react';

export interface ProgressState {
  status: ProjectStatus;
  pct: number;
  message?: string;
}

/** Subscribe to the project's SSE progress stream (§7). */
export function useProjectProgress(projectId: string): ProgressState | null {
  const [state, setState] = useState<ProgressState | null>(null);

  useEffect(() => {
    const source = new EventSource(`/api/projects/${projectId}/events`);
    source.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ProgressState;
        setState(data);
      } catch {
        // ignore malformed events
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [projectId]);

  return state;
}
