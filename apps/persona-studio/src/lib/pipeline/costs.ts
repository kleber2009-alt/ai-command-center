// Token prices of the pipeline steps (shown before each paid action).

import { COSTS } from '@/lib/tokens';
import { engineConfig } from '@/lib/video-engines';
import type { PipelineCosts } from './types';

export function pipelineCosts(): PipelineCosts {
  return {
    script: COSTS.studioScript,
    video: engineConfig('heygen-v5').cost,
    // × kadrikCostFactor(style) — the client multiplies per style
    montage: COSTS.kadrikMontage,
  };
}
