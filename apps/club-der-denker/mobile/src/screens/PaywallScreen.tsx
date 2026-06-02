import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { t } from '@/i18n';
import type { RootStackParamList } from '@/navigation';

/**
 * Step 6 (spec 3.1 / spec 4): product description + sales page, shown only
 * after successful email capture. Purchase uses native IAP (react-native-iap):
 * Product 1 = non-consumable course access. The store receipt is validated by
 * the backend webhook before the account-creation step is allowed.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Paywall'>;

export function PaywallScreen({ navigation }: Props) {
  async function buy() {
    // TODO: react-native-iap requestPurchase(courseSku); on success the backend
    // receives the Apple/Google webhook and flips course_access -> active.
    // For the scaffold we proceed to the account-creation step.
    navigation.replace('Register', { email: '' });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hauptprogramm</Text>
      <Text style={styles.body}>112 Elemente · 28 Tage · Community-Zugang</Text>
      <TouchableOpacity style={styles.btn} onPress={buy}>
        <Text style={styles.btnText}>{t('buy_course')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 16, color: '#555' },
  btn: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
