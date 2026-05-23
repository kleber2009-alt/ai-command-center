// Client-safe constants for HeyGen motion prompts.
// Отдельный файл, потому что `heygen.ts` тянет `node:https` и не импортируется
// в client components. Серверный код реэкспортирует MAX_REALISM_MOTION_PROMPT
// из heygen.ts через этот же файл.

export const MAX_REALISM_MOTION_PROMPT = [
  'Photorealistic, lifelike on-camera performance.',
  'Natural eye blinks every few seconds and soft micro-expressions reacting to the words.',
  'Gentle organic head movement and subtle weight shifts synced with speech rhythm.',
  'Relaxed shoulders with slight natural breathing motion.',
  'Confident, warm eye contact with the camera; sincere half-smiles between phrases.',
  'Crisp lip-sync with full mouth articulation and visible teeth on open vowels.',
  'No exaggerated gestures, no plastic or AI-artifact look; preserve realistic skin texture and pores.',
  'Locked camera — only the person moves.',
].join(' ');
