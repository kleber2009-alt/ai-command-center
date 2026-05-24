import type { ModuleEntry } from '../_types'

const voiceBot: ModuleEntry = {
  slug: 'voice-bot',
  name: 'AI Voice Bot',
  tagline:
    'Голосовой клон через ElevenLabs IVC + voice training-flow. Production в @aio_voice_bot.',
  status: 'production',
  baseUrl: 'https://ai-office.46-62-215-11.nip.io/persona-train',
  docsPath: 'apps/ai-office/voice-bot',
  capabilities: [
    'ElevenLabs Instant Voice Cloning',
    'Telegram-бот для записи семплов',
    'Voice training flow внутри ai-office',
    'Shared voices table с persona-train',
  ],
  backend: [
    { label: 'Voice handlers', path: 'apps/ai-office/voice-bot' },
    { label: 'Persona-train link', path: 'apps/persona-train' },
  ],
  ui: [{ label: 'Telegram bot', path: '@aio_voice_bot' }],
  notes:
    'Логика живёт внутри ai-office. Чтобы стать самостоятельным модулем — нужно вынести в apps/voice-bot и упаковать SDK поверх ElevenLabs.',
}

export default voiceBot
