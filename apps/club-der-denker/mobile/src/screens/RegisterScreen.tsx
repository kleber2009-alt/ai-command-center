import { useState } from 'react';
import { View, TextInput, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button, Heading } from '@/components/ui';
import { api } from '@/api/client';
import { useSession } from '@/store/SessionContext';
import { t } from '@/i18n';
import { colors, radii, spacing, typography } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'Register'>;

/**
 * Step 7 (spec 3.1): after confirmed payment the user sets a password. The
 * backend converts the anonymous lead into a full user profile and issues a
 * session token; signIn() flips the root navigator into the main tabs.
 */
export function RegisterScreen({ route }: Props) {
  const { signIn } = useSession();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { token } = await api.register(email, password);
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
        <Heading>{t('register_title')}</Heading>
        <TextInput style={styles.input} placeholder={t('login_email')} placeholderTextColor={colors.textFaint} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder={t('register_password')} placeholderTextColor={colors.textFaint} secureTextEntry value={password} onChangeText={setPassword} />
      </View>
      <Button label={t('register_save')} loading={busy} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, backgroundColor: colors.surface },
});
