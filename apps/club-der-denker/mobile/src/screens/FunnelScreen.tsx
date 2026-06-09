import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Loading, ErrorView } from '@/components/ui';
import { ItemCard, ItemData } from '@/components/ItemCard';
import { StepDots } from '@/components/gamification';
import { api } from '@/api/client';
import { getDeviceId } from '@/store/session';
import { i18n, t } from '@/i18n';
import { spacing } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'Funnel'>;

/**
 * Step 1-2 (spec 3.1): direct start, the 3 anonymous free items. No splash,
 * no survey. Answers are sent silently in the background.
 */
export function FunnelScreen({ navigation }: Props) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState('');

  function load() {
    setError('');
    api
      .funnelItems(i18n.locale)
      .then((r) => setItems(r.items.filter((i: any) => i.kind === 'free')))
      .catch(() => setError(t('error_generic')));
  }

  useEffect(load, []);

  async function handleNext(selectedKey: string) {
    const deviceId = await getDeviceId();
    api.funnelEvent(deviceId, 'free_answer', { itemId: items[idx].id, selectedKey }).catch(() => {});
    if (idx + 1 < items.length) setIdx(idx + 1);
    else navigation.replace('Case'); // step 3: phase change
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (items.length === 0) return <Loading />;

  return (
    <Screen scroll>
      <View style={{ marginBottom: spacing.lg }}>
        <StepDots total={items.length} current={idx} />
      </View>
      <ItemCard key={items[idx].id} item={items[idx]} onNext={handleNext} />
    </Screen>
  );
}
