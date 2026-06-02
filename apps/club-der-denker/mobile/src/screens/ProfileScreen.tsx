import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '@/api/client';
import { setLocale, SUPPORTED, t } from '@/i18n';
import { clearToken } from '@/store/session';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

/**
 * Profile dashboard (spec 3.2): name, email, level badge, activity history,
 * joker status; language switch and GDPR account deletion.
 */
export function ProfileScreen({ navigation }: Props) {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    api.profile().then(setProfile).catch(() => {});
  }, []);

  async function changeLocale(loc: (typeof SUPPORTED)[number]) {
    await setLocale(loc);
    await api.setLocale(loc).catch(() => {});
    setProfile({ ...profile, locale: loc });
  }

  function confirmDelete() {
    Alert.alert('Konto löschen', 'GDPR: Daten werden unwiderruflich entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await api.deleteAccount();
          await clearToken();
          navigation.replace('Funnel');
        },
      },
    ]);
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.email}>{profile.email}</Text>
      <Text style={styles.stat}>{t('level')}: {profile.level}</Text>
      <Text style={styles.stat}>{t('streak')}: {profile.streakDays}</Text>
      <Text style={styles.stat}>Joker: {profile.jokerAvailable ? '1' : profile.jokerUsed ? '0 (verbraucht)' : '0'}</Text>
      <Text style={styles.stat}>{profile.itemsCompleted} / 112</Text>

      <View style={styles.langRow}>
        {SUPPORTED.map((loc) => (
          <TouchableOpacity key={loc} style={[styles.lang, profile.locale === loc && styles.langActive]} onPress={() => changeLocale(loc)}>
            <Text style={profile.locale === loc ? styles.langActiveText : styles.langText}>{loc.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.delete} onPress={confirmDelete}>
        <Text style={styles.deleteText}>Konto löschen (GDPR)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, padding: 24, paddingTop: 80, gap: 12 },
  email: { fontSize: 18, fontWeight: '700' },
  stat: { fontSize: 16, color: '#444' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  lang: { borderWidth: 1, borderColor: '#d4d4d4', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  langActive: { backgroundColor: '#111', borderColor: '#111' },
  langText: { color: '#111' },
  langActiveText: { color: '#fff' },
  delete: { marginTop: 'auto', padding: 16, alignItems: 'center' },
  deleteText: { color: '#c0392b', fontSize: 15 },
});
