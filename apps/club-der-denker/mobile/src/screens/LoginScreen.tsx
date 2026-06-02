import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button, Heading } from '@/components/ui';
import { api } from '@/api/client';
import { useSession } from '@/store/SessionContext';
import { t } from '@/i18n';
import { colors, radii, spacing, typography } from '@/theme';
import type { FunnelStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FunnelStackParamList, 'Login'>;

/**
 * Returning-user login (spec 3.2): email + password, plus social sign-in
 * (Google / Apple). On success signIn() flips into the main tabs.
 */
export function LoginScreen({ navigation }: Props) {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { token } = await api.login(email, password);
      await signIn(token);
    } catch (e: any) {
      Alert.alert(t('error_generic'), e.message);
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: 'apple' | 'google') {
    // TODO(social auth): obtain the native identity token via
    // expo-apple-authentication / expo-auth-session, then exchange it here.
    Alert.alert(provider === 'apple' ? 'Apple' : 'Google', t('error_generic'));
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        <Heading>{t('login_title')}</Heading>
        <TextInput style={styles.input} placeholder={t('login_email')} placeholderTextColor={colors.textFaint} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder={t('login_password')} placeholderTextColor={colors.textFaint} secureTextEntry value={password} onChangeText={setPassword} />
        <Button label={t('login_cta')} loading={busy} onPress={submit} />

        <Text style={styles.divider}>{t('or_continue_with')}</Text>
        <TouchableOpacity style={[styles.social, styles.apple]} onPress={() => social('apple')}>
          <Text style={styles.socialTextDark}> {t('continue_apple')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.social, styles.google]} onPress={() => social('google')}>
          <Text style={styles.socialTextLight}>G  {t('continue_google')}</Text>
        </TouchableOpacity>
      </View>
      <Button label={t('back')} variant="ghost" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, backgroundColor: colors.surface },
  divider: { ...typography.caption, color: colors.textFaint, textAlign: 'center', marginTop: spacing.sm },
  social: { borderRadius: radii.md, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  apple: { backgroundColor: '#ffffff' },
  google: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: colors.border },
  socialTextDark: { ...typography.title, color: '#000000' },
  socialTextLight: { ...typography.title, color: '#3c4043' },
});
