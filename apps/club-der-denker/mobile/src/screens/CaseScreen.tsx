import { useEffect, useState } from 'react';
import { ScrollView, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '@/api/client';
import { i18n, t } from '@/i18n';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Case'>;

/**
 * Step 3 (spec 3.1): after the 3 free items the guest status is voided and an
 * animated transition leads to the predefined practical case (text + media).
 */
export function CaseScreen({ navigation }: Props) {
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<string | null>(null);

  useEffect(() => {
    api.funnelItems(i18n.locale).then((r) => {
      const c = r.items.find((i: any) => i.kind === 'case');
      if (c) {
        setBody(c.body);
        setMedia(c.mediaUrl);
      }
    });
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {media ? <Image source={{ uri: media }} style={styles.media} /> : null}
      <Text style={styles.body}>{body}</Text>
      <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('Branch')}>
        <Text style={styles.btnText}>{t('continue')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, gap: 16 },
  media: { width: '100%', height: 220, borderRadius: 12 },
  body: { fontSize: 18, lineHeight: 26 },
  btn: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
