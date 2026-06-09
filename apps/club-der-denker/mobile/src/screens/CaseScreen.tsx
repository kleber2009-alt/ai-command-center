import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button, Body, Loading } from '@/components/ui';
import { api } from '@/api/client';
import { i18n, t } from '@/i18n';
import { colors, radii, spacing } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'Case'>;

/**
 * Step 3 (spec 3.1): after the 3 free items the guest status is voided and an
 * animated transition leads to the predefined practical case (text + media).
 */
export function CaseScreen({ navigation }: Props) {
  const [body, setBody] = useState<string | null>(null);
  const [media, setMedia] = useState<string | null>(null);

  useEffect(() => {
    api.funnelItems(i18n.locale).then((r) => {
      const c = r.items.find((i: any) => i.kind === 'case');
      setBody(c?.body ?? '');
      setMedia(c?.mediaUrl ?? null);
    });
  }, []);

  if (body === null) return <Loading />;

  return (
    <Screen scroll>
      <View style={{ flex: 1, gap: spacing.lg }}>
        {media ? <Image source={{ uri: media }} style={styles.media} /> : null}
        <Body>{body}</Body>
      </View>
      <Button label={t('continue')} onPress={() => navigation.replace('Branch')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  media: { width: '100%', height: 220, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt },
});
