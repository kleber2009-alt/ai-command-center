// Сериализуемые типы для модуля Studio (Мастер-ТЗ Persona Studio).
// Prisma-модели содержат Date/Json — клиенту отдаём строки и узкие формы.

export type PersonaBrand = {
  primary?: string; // hex
  accent?: string; // hex
  fontHeading?: string;
  fontBody?: string;
  logoUrl?: string;
};

export type PersonaToneLength = 'short' | 'medium' | 'long';

export type PersonaTone = {
  examples?: string[]; // образцы постов пользователя
  taboo?: string[]; // табу-слова
  length?: PersonaToneLength;
};

// Узкая форма аватара для пикера в форме персоны.
export type PersonaAvatarOption = {
  id: string;
  imageUrl: string;
  imageThumbUrl: string | null;
  styleLabel: string;
};

// Персона как её видит клиент.
export type PersonaView = {
  id: string;
  name: string;
  avatarId: string | null;
  avatar: PersonaAvatarOption | null;
  avatarModelRef: string | null;
  voiceId: string | null;
  voiceProvider: string;
  lang: string;
  brand: PersonaBrand;
  tone: PersonaTone;
  isDefault: boolean;
  createdAt: string;
};

// Результат similarity-gate (§2 антиплагиат).
export type SimilarityGate = 'pass' | 'warn' | 'block';

export type SimilarityResult = {
  similarity: number | null; // cosine 0..1; null если эмбеддинги/источник недоступны
  gate: SimilarityGate;
  reason?: string;
};

// ── Модуль B · воркспейс генерации ──

export type GenerationStage = 'script' | 'voice' | 'video' | 'edit' | 'done' | 'error';
export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type GenerationView = {
  id: string;
  briefId: string;
  stage: GenerationStage;
  status: GenerationStatus;
  script: string | null;
  similarity: number | null;
  gate: SimilarityGate | null;
  videoGenerationId: string | null;
  videoEditId: string | null;
  finalUrl: string | null;
  costCredits: number;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BriefView = {
  id: string;
  personaId: string | null;
  sourceReelId: string | null;
  hookArchetype: string | null;
  format: string | null;
  lengthSec: number | null;
  lang: string;
  topic: string | null;
  status: string; // draft | ready
  createdAt: string;
  // источник-вдохновение (структура для UI, без дословного текста)
  source: {
    thumbnailUrl: string | null;
    authorUsername: string | null;
    url: string | null;
  } | null;
  generations: GenerationView[];
};
