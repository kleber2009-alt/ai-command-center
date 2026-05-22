// Registry of supported video-generation engines.
//
// Pure data + types — НИКАКИХ серверных импортов (bullmq, Prisma).
// Это файл импортируется и из client-form, и из API роута, и из воркеров.
//
// Каждый движок имеет:
//   - inputMode: какие поля ждёт от пользователя
//       'script'  — HeyGen: текст + voice_id, TTS внутри движка
//       'audio'   — OmniHuman: готовый audio URL (≤30 сек), движок только lip-sync
//   - queueName: имя BullMQ очереди (зеркалит QUEUE_NAMES в queue.ts —
//     дрифт ловится тестом cross-check ниже).
//   - cost: число токенов из ENV (с дефолтами).
//
// Контракт регистра проверяется TS — Record<VideoEngine, EngineConfig>
// гарантирует, что добавление в union без записи здесь падает на сборке.

export type VideoEngine = 'heygen-v5' | 'heygen-v4' | 'omnihuman-1.5';

export type EngineInputMode = 'script' | 'audio';

export type EngineAspect = '9:16' | '1:1' | '16:9';

/**
 * Какой провайдер голоса использует движок.
 * - 'heygen'     — voice_id из heygen-voices, синтез происходит внутри HeyGen video API
 * - 'elevenlabs' — voice_id из elevenlabs-voices, воркер сам синтезирует mp3 перед видео
 */
export type VoiceProvider = 'heygen' | 'elevenlabs';

export type EngineConfig = {
  label: string;
  description: string;
  cost: number;
  /** Должно совпадать с QUEUE_NAMES.* в queue.ts. */
  queueName: 'heygen-video' | 'omnihuman-video';
  inputMode: EngineInputMode;
  voiceProvider: VoiceProvider;
  supportedAspects: readonly EngineAspect[];
  /** Только для heygen-*: какой model_version отправлять в /v2/video/generate. */
  heygenVersion?: 'V' | 'IV';
  /** Виден в UI и принимается API. false = «зашит в коде, но выключен». */
  enabled: boolean;
};

// Cost defaults — env-driven. Process.env читается в Node и при build на Next:
// на клиенте эти числа уже зашиты как литералы при бандлинге.
const COST_HEYGEN = Number(process.env.COST_HEYGEN_VIDEO ?? 30);
const COST_OMNIHUMAN = Number(process.env.COST_OMNIHUMAN_VIDEO ?? 50);

export const VIDEO_ENGINES: Record<VideoEngine, EngineConfig> = {
  'heygen-v5': {
    label: 'HeyGen V — Studio',
    description: 'Talking photo, фотореалистичная мимика, ~2–4 мин рендер.',
    cost: COST_HEYGEN,
    queueName: 'heygen-video',
    inputMode: 'script',
    voiceProvider: 'heygen',
    supportedAspects: ['9:16', '1:1', '16:9'],
    heygenVersion: 'V',
    enabled: true,
  },
  'heygen-v4': {
    label: 'HeyGen IV — Legacy',
    description: 'Старая модель Avatar IV.',
    cost: COST_HEYGEN,
    queueName: 'heygen-video',
    inputMode: 'script',
    voiceProvider: 'heygen',
    supportedAspects: ['9:16', '1:1', '16:9'],
    heygenVersion: 'IV',
    enabled: false,
  },
  'omnihuman-1.5': {
    label: 'OmniHuman 1.5 — Lifelike',
    description: 'ByteDance lipsync + ElevenLabs TTS, выразительная анимация (≤30s аудио).',
    cost: COST_OMNIHUMAN,
    queueName: 'omnihuman-video',
    inputMode: 'script',
    voiceProvider: 'elevenlabs',
    supportedAspects: ['9:16', '1:1', '16:9'],
    enabled: false,
  },
};

export function engineConfig(engine: VideoEngine): EngineConfig {
  return VIDEO_ENGINES[engine];
}

export function isVideoEngine(s: string): s is VideoEngine {
  return s in VIDEO_ENGINES;
}

export function isEnabledEngine(s: string): s is VideoEngine {
  return isVideoEngine(s) && VIDEO_ENGINES[s].enabled;
}

export const VIDEO_ENGINE_LIST: readonly VideoEngine[] = (Object.keys(VIDEO_ENGINES) as VideoEngine[]).filter(
  (slug) => VIDEO_ENGINES[slug].enabled,
);
