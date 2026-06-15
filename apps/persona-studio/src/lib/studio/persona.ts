// Хелперы Persona (Модуль A): нормализация brand/tone из Json и сериализация
// Prisma-модели в PersonaView для клиента.

import type {
  PersonaBrand,
  PersonaTone,
  PersonaToneLength,
  PersonaView,
} from './types';

const TONE_LENGTHS: PersonaToneLength[] = ['short', 'medium', 'long'];

export function normalizeBrand(value: unknown): PersonaBrand {
  const v = (value ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : undefined);
  return {
    primary: str('primary'),
    accent: str('accent'),
    fontHeading: str('fontHeading'),
    fontBody: str('fontBody'),
    logoUrl: str('logoUrl'),
  };
}

export function normalizeTone(value: unknown): PersonaTone {
  const v = (value ?? {}) as Record<string, unknown>;
  const strArr = (k: string) =>
    Array.isArray(v[k]) ? (v[k] as unknown[]).filter((x): x is string => typeof x === 'string') : undefined;
  const length =
    typeof v.length === 'string' && TONE_LENGTHS.includes(v.length as PersonaToneLength)
      ? (v.length as PersonaToneLength)
      : undefined;
  return {
    examples: strArr('examples'),
    taboo: strArr('taboo'),
    length,
  };
}

// Минимальный набор полей аватара, который тянем в include для пикера/карточки.
type PersonaWithAvatar = {
  id: string;
  name: string;
  avatarId: string | null;
  avatarModelRef: string | null;
  voiceId: string | null;
  voiceProvider: string;
  lang: string;
  brand: unknown;
  tone: unknown;
  isDefault: boolean;
  createdAt: Date;
  avatar: {
    id: string;
    imageUrl: string;
    imageThumbUrl: string | null;
    styleLabel: string;
  } | null;
};

export function serializePersona(p: PersonaWithAvatar): PersonaView {
  return {
    id: p.id,
    name: p.name,
    avatarId: p.avatarId,
    avatar: p.avatar
      ? {
          id: p.avatar.id,
          imageUrl: p.avatar.imageUrl,
          imageThumbUrl: p.avatar.imageThumbUrl,
          styleLabel: p.avatar.styleLabel,
        }
      : null,
    avatarModelRef: p.avatarModelRef,
    voiceId: p.voiceId,
    voiceProvider: p.voiceProvider,
    lang: p.lang,
    brand: normalizeBrand(p.brand),
    tone: normalizeTone(p.tone),
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
  };
}

// Поля для include, чтобы сериализатор получил аватар.
export const PERSONA_INCLUDE = {
  avatar: {
    select: { id: true, imageUrl: true, imageThumbUrl: true, styleLabel: true },
  },
} as const;
