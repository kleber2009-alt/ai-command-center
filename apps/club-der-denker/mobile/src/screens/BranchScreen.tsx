import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '@/api/client';
import { getDeviceId } from '@/store/session';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Branch'>;

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
    <View style={styles.container}>
      <Text style={styles.title}>Wähle deinen Weg</Text>
      <TouchableOpacity style={[styles.choice, styles.a]} onPress={() => choose('a')}>
        <Text style={styles.choiceText}>Variante A</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.choice, styles.b]} onPress={() => choose('b')}>
        <Text style={styles.choiceText}>Variante B</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, gap: 20 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  choice: { borderRadius: 16, padding: 32, alignItems: 'center' },
  a: { backgroundColor: '#e5e5e5' },
  b: { backgroundColor: '#111' },
  choiceText: { fontSize: 18, fontWeight: '600', color: '#fff' },
});
