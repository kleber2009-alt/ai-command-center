// Shared domain types for the Club Der Denker engine.

export type Locale = 'de' | 'en' | 'ru' | 'es' | 'fr' | 'it';
export const LOCALES: Locale[] = ['de', 'en', 'ru', 'es', 'fr', 'it'];
export const DEFAULT_LOCALE: Locale = 'de';

export type ItemKind = 'free' | 'case' | 'course';
export type MediaKind = 'text' | 'image' | 'video';
export type UserStatus = 'guest' | 'lead' | 'active' | 'blocked';
export type ProductKind = 'course_access' | 'community_subscription';
export type PurchasePlatform = 'apple' | 'google' | 'web';

export interface AnswerOption {
  key: string; // 'a' | 'b' | 'c' | 'd'
  label: string;
  feedback: string; // shown immediately after selection
}

export interface ItemView {
  id: string;
  kind: ItemKind;
  globalOrder: number | null;
  dayIndex: number | null;
  daySlot: number | null;
  mediaKind: MediaKind;
  mediaUrl: string | null;
  body: string;
  options: AnswerOption[];
}

export interface ProfileView {
  id: string;
  email: string;
  displayName: string | null;
  locale: Locale;
  status: UserStatus;
  itemsCompleted: number;
  level: number;
  streakDays: number;
  jokerAvailable: boolean;
  jokerUsed: boolean;
  communityAccessUntil: string | null;
}
