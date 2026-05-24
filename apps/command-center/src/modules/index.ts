import type { ModuleEntry } from './_types'

import aiHub from './ai-hub'
import aiOffice from './ai-office'
import aiSales from './ai-sales'
import igAgent from './ig-agent'
import miniApp from './mini-app'
import personaStudio from './persona-studio'
import personaTrain from './persona-train'
import tgAgent from './tg-agent'
import transcribe from './transcribe'
import viralClone from './viral-clone'
import viralDiscover from './viral-discover'
import voiceBot from './voice-bot'

const STATUS_RANK: Record<ModuleEntry['status'], number> = {
  production: 0,
  beta: 1,
  dev: 2,
  planned: 3,
}

export const MODULES: ModuleEntry[] = [
  personaStudio,
  transcribe,
  tgAgent,
  igAgent,
  aiOffice,
  aiSales,
  aiHub,
  viralDiscover,
  viralClone,
  voiceBot,
  miniApp,
  personaTrain,
].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])

export type { ModuleEntry } from './_types'
