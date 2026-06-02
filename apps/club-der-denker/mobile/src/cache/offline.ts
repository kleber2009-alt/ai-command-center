import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Offline cache (spec 5 "Автономность работы"): the current daily pack of 4
 * items is fully persisted on-device so the session continues if the network
 * drops. Pending answers are queued and synced when connectivity returns.
 */
const PACK_KEY = 'cdd.pack';
const QUEUE_KEY = 'cdd.answerQueue';

export interface CachedPack {
  dayIndex: number;
  items: any[];
  cachedAt: number;
}

export async function savePack(pack: CachedPack): Promise<void> {
  await AsyncStorage.setItem(PACK_KEY, JSON.stringify(pack));
}

export async function loadPack(): Promise<CachedPack | null> {
  const raw = await AsyncStorage.getItem(PACK_KEY);
  return raw ? (JSON.parse(raw) as CachedPack) : null;
}

export interface QueuedAnswer {
  itemId: string;
  selectedKey: string;
  tz: string;
  at: number;
}

export async function enqueueAnswer(a: QueuedAnswer): Promise<void> {
  const q = await loadQueue();
  q.push(a);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function loadQueue(): Promise<QueuedAnswer[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedAnswer[]) : [];
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
