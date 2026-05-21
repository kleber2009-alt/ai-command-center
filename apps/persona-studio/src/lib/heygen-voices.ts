// Voice presets — pure data, safe to import from client components.
// Kept out of heygen.ts because that file pulls in node:https for the SDK
// helpers, which webpack can't bundle for the browser.

export type VoicePreset = {
  voice_id: string;
  language: string;
  label: string;
  gender: 'male' | 'female';
};

export const VOICE_PRESETS: VoicePreset[] = [
  {
    voice_id: '93d1ab8db88b479ca452e31897389118',
    language: 'ru',
    label: 'Русский (мужской)',
    gender: 'male',
  },
  {
    voice_id: '1bd001e7e50f421d891986aad5158bc8',
    language: 'en',
    label: 'English (male)',
    gender: 'male',
  },
  {
    voice_id: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
    language: 'en',
    label: 'English (female)',
    gender: 'female',
  },
];

export function voiceById(id: string): VoicePreset | null {
  return VOICE_PRESETS.find((v) => v.voice_id === id) ?? null;
}
