import { useState } from 'react';
import { View, TextInput, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button, Heading, Body } from '@/components/ui';
import { api } from '@/api/client';
import { useSession } from '@/store/SessionContext';
import { t } from '@/i18n';
import { colors, radii, spacing, typography } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'ForgotPassword'>;

/**
 * Password reset (spec §3.2): step 1 requests a code by email; step 2 enters
 * the code + a new password. On success signIn() goes straight into the app.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const { signIn } = useSession();
  const [stage, setStage] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      Alert.alert(t('login_email'), t('email_invalid'));
      return;
    }
    setBusy(true);
    try {
      await api.forgotPassword(email);
      Alert.alert(t('forgot_title'), t('code_sent'));
      setStage('reset');
    } catch (e: any) {
      Alert.alert(t('error_generic'), e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setBusy(true);
    try {
      const { token } = await api.resetPassword(email, code.trim(), password);
      await signIn(token);
    } catch (e: any) {
      Alert.alert(t('error_generic'), e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        {stage === 'request' ? (
          <>
            <Heading>{t('forgot_title')}</Heading>
            <Body muted>{t('forgot_hint')}</Body>
            <TextInput style={styles.input} placeholder={t('login_email')} placeholderTextColor={colors.textFaint} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <Button label={t('send_code')} loading={busy} onPress={requestCode} />
          </>
        ) : (
          <>
            <Heading>{t('reset_title')}</Heading>
            <TextInput style={styles.input} placeholder={t('code_label')} placeholderTextColor={colors.textFaint} keyboardType="number-pad" value={code} onChangeText={setCode} />
            <TextInput style={styles.input} placeholder={t('new_password')} placeholderTextColor={colors.textFaint} secureTextEntry value={password} onChangeText={setPassword} />
            <Button label={t('reset_cta')} loading={busy} onPress={doReset} />
          </>
        )}
      </View>
      <Button label={t('back')} variant="ghost" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, backgroundColor: colors.surface },
});
