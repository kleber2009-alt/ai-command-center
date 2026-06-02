import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { t } from '@/i18n';

/**
 * The fixed three-step element mechanic (spec 3.1 step 2 / 3.3):
 *   1. Display — text / image / video data set.
 *   2. Input — choose one of 3-4 multiple-choice options.
 *   3. Evaluation — feedback appears immediately and the next button enables.
 */
export interface ItemData {
  id: string;
  mediaKind: 'text' | 'image' | 'video';
  mediaUrl: string | null;
  body: string;
  options: { key: string; label: string; feedback: string }[];
}

export function ItemCard({ item, onNext }: { item: ItemData; onNext: (selectedKey: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = item.options.find((o) => o.key === selected);

  return (
    <View style={styles.card}>
      {item.mediaKind === 'image' && item.mediaUrl ? (
        <Image source={{ uri: item.mediaUrl }} style={styles.media} resizeMode="cover" />
      ) : null}
      <Text style={styles.body}>{item.body}</Text>

      <View style={styles.options}>
        {item.options.map((o) => (
          <TouchableOpacity
            key={o.key}
            disabled={selected !== null}
            onPress={() => setSelected(o.key)}
            style={[styles.option, selected === o.key && styles.optionSelected]}
          >
            <Text style={styles.optionLabel}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {chosen ? (
        <View style={styles.feedback}>
          <Text style={styles.feedbackText}>{chosen.feedback}</Text>
          <TouchableOpacity style={styles.nextBtn} onPress={() => onNext(chosen.key)}>
            <Text style={styles.nextText}>{t('next')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 16 },
  media: { width: '100%', height: 200, borderRadius: 12 },
  body: { fontSize: 18, lineHeight: 26 },
  options: { gap: 10 },
  option: { borderWidth: 1, borderColor: '#d4d4d4', borderRadius: 10, padding: 14 },
  optionSelected: { borderColor: '#111', backgroundColor: '#f5f5f5' },
  optionLabel: { fontSize: 16 },
  feedback: { gap: 12, marginTop: 8 },
  feedbackText: { fontSize: 15, color: '#444' },
  nextBtn: { backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center' },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
