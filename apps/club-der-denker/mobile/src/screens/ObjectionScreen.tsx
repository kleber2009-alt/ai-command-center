import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { t } from '@/i18n';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Objection'>;

/**
 * Step 4A (spec 3.1): the interruption path — a dedicated objection-handling
 * screen (text + image). From here the user can still proceed to step 5.
 */
export function ObjectionScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.body}>
        {/* Admin-managed objection-handling copy is loaded here. */}
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('Email')}>
        <Text style={styles.btnText}>{t('continue')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 24 },
  body: { fontSize: 18, lineHeight: 26 },
  btn: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
