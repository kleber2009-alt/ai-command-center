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
