import { useEffect, useState } from 'react';
import { ScrollView, ActivityIndicator, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ItemCard, ItemData } from '@/components/ItemCard';
import { api } from '@/api/client';
import { getDeviceId } from '@/store/session';
import { i18n } from '@/i18n';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Funnel'>;

/**
 * Step 1-2 (spec 3.1): direct start, the 3 anonymous free items. No splash,
 * no survey. Answers are sent silently in the background.
 */
export function FunnelScreen({ navigation }: Props) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    api.funnelItems(i18n.locale).then((r) => {
      setItems(r.items.filter((i: any) => i.kind === 'free'));
    });
  }, []);

  async function handleNext(selectedKey: string) {
    const deviceId = await getDeviceId();
    api.funnelEvent(deviceId, 'free_answer', { itemId: items[idx].id, selectedKey }).catch(() => {});
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
    } else {
      navigation.replace('Case'); // step 3: phase change
    }
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 60 }}>
      <ItemCard key={items[idx].id} item={items[idx]} onNext={handleNext} />
    </ScrollView>
  );
}
