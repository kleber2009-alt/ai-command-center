import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '@/api/client';
import { getDeviceId } from '@/store/session';
import { i18n, t } from '@/i18n';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Email'>;

/**
 * Step 5 (spec 3.1): a single email field (no password), shown AFTER branch B
 * but strictly BEFORE any price/payment page. Submitting saves the lead
 * immediately, then proceeds to the offer.
 */
export function EmailScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      Alert.alert('E-Mail', 'Bitte gültige Adresse eingeben');
      return;
    }
    setBusy(true);
    try {
      const deviceId = await getDeviceId();
      await api.saveLead(email, deviceId, i18n.locale);
      navigation.replace('Paywall');
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={t('email_placeholder')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TouchableOpacity style={styles.btn} disabled={busy} onPress={submit}>
        <Text style={styles.btnText}>{t('continue')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  input: { borderWidth: 1, borderColor: '#d4d4d4', borderRadius: 10, padding: 16, fontSize: 16 },
  btn: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
