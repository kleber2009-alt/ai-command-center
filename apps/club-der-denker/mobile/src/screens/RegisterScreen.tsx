import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '@/api/client';
import { setToken } from '@/store/session';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

/**
 * Step 7 (spec 3.1): after confirmed payment the user sets a password. The
 * backend converts the anonymous lead into a full user profile and issues a
 * session token.
 */
export function RegisterScreen({ route, navigation }: Props) {
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');

  async function submit() {
    try {
      const { token } = await api.register(email, password);
      await setToken(token);
      navigation.replace('Course');
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Konto erstellen</Text>
      <TextInput style={styles.input} placeholder="E-Mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Passwort" secureTextEntry value={password} onChangeText={setPassword} />
      <TouchableOpacity style={styles.btn} onPress={submit}>
        <Text style={styles.btnText}>Speichern</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#d4d4d4', borderRadius: 10, padding: 16, fontSize: 16 },
  btn: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
