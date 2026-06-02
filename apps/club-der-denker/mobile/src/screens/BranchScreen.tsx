import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Heading } from '@/components/ui';
import { api } from '@/api/client';
import { getDeviceId } from '@/store/session';
import { t } from '@/i18n';
import { colors, radii, spacing, typography } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'Branch'>;

/**
 * Step 4 (spec 3.1): a visual, irreversible binary choice (Option A / Option B).
 *   A — interruption path -> objection-handling screen.
 *   B — progress path -> directly to email capture (step 5).
 */
export function BranchScreen({ navigation }: Props) {
  async function choose(variant: 'a' | 'b') {
    const deviceId = await getDeviceId();
    api.funnelEvent(deviceId, variant === 'a' ? 'branch_a' : 'branch_b').catch(() => {});
    navigation.replace(variant === 'a' ? 'Objection' : 'Email');
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Heading style={styles.title}>{t('branch_title')}</Heading>
        <TouchableOpacity activeOpacity={0.85} style={[styles.choice, styles.a]} onPress={() => choose('a')}>
          <Text style={styles.choiceTextA}>{t('variant_a')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} style={[styles.choice, styles.b]} onPress={() => choose('b')}>
          <Text style={styles.choiceTextB}>{t('variant_b')}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  title: { textAlign: 'center', marginBottom: spacing.sm },
  choice: { borderRadius: radii.xl, paddingVertical: spacing.xxl, alignItems: 'center' },
  a: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  b: { backgroundColor: colors.accent },
  choiceTextA: { ...typography.title, color: colors.text },
  choiceTextB: { ...typography.title, color: colors.accentText },
});
