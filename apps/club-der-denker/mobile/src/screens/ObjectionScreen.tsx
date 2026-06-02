import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button, Heading, Body, Loading } from '@/components/ui';
import { api } from '@/api/client';
import { i18n, t } from '@/i18n';
import { spacing } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'Objection'>;

/**
 * Step 4A (spec 3.1): the interruption path — a dedicated objection-handling
 * screen (admin-managed text + image). From here the user can still proceed
 * to step 5 (email capture).
 */
export function ObjectionScreen({ navigation }: Props) {
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    // Objection copy is delivered as the case item's alternate text; falls back
    // to an empty body until the admin fills it.
    api
      .funnelItems(i18n.locale)
      .then((r) => setBody(r.items.find((i: any) => i.kind === 'case')?.body ?? ''))
      .catch(() => setBody(''));
  }, []);

  if (body === null) return <Loading />;

  return (
    <Screen scroll>
      <View style={{ flex: 1, gap: spacing.md, justifyContent: 'center' }}>
        <Heading>{t('objection_title')}</Heading>
        <Body muted>{body}</Body>
      </View>
      <Button label={t('continue')} onPress={() => navigation.replace('Email')} />
    </Screen>
  );
}
