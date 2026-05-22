// ElevenLabs voice presets — pure data, client-safe.
//
// Курированный набор для MVP. Используются well-known ElevenLabs library voice IDs
// (доступны на любом аккаунте). Все voice_id здесь работают с
// eleven_turbo_v2_5 multilingual моделью — поддерживают ru/en.

export type ElevenVoicePreset = {
  voice_id: string;
  language: string;
  label: string;
  gender: 'male' | 'female';
};

export const ELEVENLABS_VOICE_PRESETS: ElevenVoicePreset[] = [
  {
    voice_id: 'pNInz6obpgDQGcFmaJgB',
    language: 'multi',
    label: 'Adam (мужской, мультиязык)',
    gender: 'male',
  },
  {
    voice_id: '21m00Tcm4TlvDq8ikWAM',
    language: 'multi',
    label: 'Rachel (женский, мультиязык)',
    gender: 'female',
  },
  {
    voice_id: 'ErXwobaYiN019PkySvjV',
    language: 'multi',
    label: 'Antoni (мужской, мягкий)',
    gender: 'male',
  },
  {
    voice_id: 'EXAVITQu4vr4xnSDxMaL',
    language: 'multi',
    label: 'Bella (женский, выразительный)',
    gender: 'female',
  },
];

export function elevenVoiceById(id: string): ElevenVoicePreset | null {
  return ELEVENLABS_VOICE_PRESETS.find((v) => v.voice_id === id) ?? null;
}
