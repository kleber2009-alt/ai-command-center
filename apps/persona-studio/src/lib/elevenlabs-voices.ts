// Voice presets — pure data, client-safe. Нейтральные названия (без бренда
// провайдера). Курированный набор библиотечных голосов; все поддерживают ru/en.

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
    label: 'Мужской — энергичный',
    gender: 'male',
  },
  {
    voice_id: '21m00Tcm4TlvDq8ikWAM',
    language: 'multi',
    label: 'Женский — нейтральный',
    gender: 'female',
  },
  {
    voice_id: 'ErXwobaYiN019PkySvjV',
    language: 'multi',
    label: 'Мужской — мягкий',
    gender: 'male',
  },
  {
    voice_id: 'EXAVITQu4vr4xnSDxMaL',
    language: 'multi',
    label: 'Женский — выразительный',
    gender: 'female',
  },
];

export function elevenVoiceById(id: string): ElevenVoicePreset | null {
  return ELEVENLABS_VOICE_PRESETS.find((v) => v.voice_id === id) ?? null;
}
