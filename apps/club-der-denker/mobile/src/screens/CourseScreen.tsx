import { useEffect, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ItemCard, ItemData } from '@/components/ItemCard';
import { api, deviceTimeZone } from '@/api/client';
import { savePack, loadPack, enqueueAnswer } from '@/cache/offline';
import { i18n, t } from '@/i18n';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Course'>;

/**
 * Paid course (spec 3.3): the daily pack of up to 4 items, gated server-side
 * by the timezone unlock engine. The pack is cached offline; answers are
 * queued when offline and synced on reconnect.
 */
export function CourseScreen(_props: Props) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [idx, setIdx] = useState(0);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.today(i18n.locale);
        if (r.locked) {
          setLocked(true);
        } else {
          setItems(r.items);
          await savePack({ dayIndex: r.dayIndex, items: r.items, cachedAt: Date.now() });
        }
      } catch {
        // Offline: fall back to the cached pack.
        const cached = await loadPack();
        if (cached) setItems(cached.items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleNext(selectedKey: string) {
    const item = items[idx];
    try {
      await api.answer(item.id, selectedKey);
    } catch {
      await enqueueAnswer({ itemId: item.id, selectedKey, tz: deviceTimeZone(), at: Date.now() });
    }
    if (idx + 1 < items.length) setIdx(idx + 1);
    else setLocked(true); // pack done -> locked until local midnight
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (locked || items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.locked}>{t('locked_until_midnight')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 60 }}>
      <ItemCard key={items[idx].id} item={items[idx]} onNext={handleNext} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  locked: { fontSize: 16, color: '#555', textAlign: 'center' },
});
