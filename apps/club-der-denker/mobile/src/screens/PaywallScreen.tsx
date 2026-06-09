import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button, Heading, Body, Card } from '@/components/ui';
import { useIAP } from '@/iap/useIAP';
import { t } from '@/i18n';
import { colors, spacing, typography } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'Paywall'>;

/**
 * Step 6 (spec 3.1 / spec 4): product description + sales page, shown only
 * after successful email capture. Purchase uses native IAP (react-native-iap):
 * Product 1 = non-consumable course access, tied to the lead via appAccountToken
 * so the store webhook validates it. On purchase we proceed to account creation.
 */
const FEATURES = ['feature_items', 'feature_days', 'feature_community'];

export function PaywallScreen({ navigation, route }: Props) {
  const { busy, buyCourse } = useIAP((product) => {
    // Course bought (validated by webhook for the lead) -> set a password.
    if (product) navigation.replace('Register', { email: '' });
  });

  function buy() {
    buyCourse(route.params?.leadUserId);
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
        <Heading>{t('paywall_title')}</Heading>
        <Body muted>{t('paywall_subtitle')}</Body>
        <Card style={{ gap: spacing.md }}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.feature}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.featureText}>{t(f)}</Text>
            </View>
          ))}
        </Card>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button label={t('buy_course')} loading={busy} onPress={buy} />
        <Button label={t('restore')} variant="ghost" onPress={() => navigation.navigate('Login')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  check: { color: colors.success, fontSize: 18, fontWeight: '700' },
  featureText: { ...typography.body, color: colors.text },
});
