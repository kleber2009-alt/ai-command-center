import { useState } from 'react';
import { View, TextInput, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button, Heading, Body } from '@/components/ui';
import { api } from '@/api/client';
import { getDeviceId } from '@/store/session';
import { i18n, t } from '@/i18n';
import { colors, radii, spacing, typography } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'Email'>;

/**
 * Step 5 (spec 3.1): a single email field (no password), shown AFTER branch B
 * but strictly BEFORE any price/payment page. Submitting saves the lead
 * immediately, then proceeds to the offer.
 */
export function EmailScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      Alert.alert(t('email_placeholder'), t('email_invalid'));
      return;
    }
    setBusy(true);
    try {
      const deviceId = await getDeviceId();
      await api.saveLead(email, deviceId, i18n.locale);
      navigation.replace('Paywall');
    } catch (e: any) {
      Alert.alert(t('error_generic'), e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        <Heading>{t('email_title')}</Heading>
        <Body muted>{t('email_subtitle')}</Body>
        <TextInput
          style={styles.input}
          placeholder={t('email_placeholder')}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>
      <Button label={t('continue')} loading={busy} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
});
