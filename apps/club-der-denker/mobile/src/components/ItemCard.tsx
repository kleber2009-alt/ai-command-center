import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Button } from '@/components/ui';
import { t } from '@/i18n';
import { colors, radii, spacing, typography } from '@/theme';

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

export function ItemCard({ item, onNext, busy }: { item: ItemData; onNext: (selectedKey: string) => void; busy?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = item.options.find((o) => o.key === selected);

  return (
    <View style={styles.container}>
      {item.mediaKind === 'image' && item.mediaUrl ? (
        <Image source={{ uri: item.mediaUrl }} style={styles.media} resizeMode="cover" />
      ) : null}
      {item.mediaKind === 'video' && item.mediaUrl ? (
        <View style={styles.videoPlaceholder}>
          <Text style={styles.videoIcon}>▶</Text>
        </View>
      ) : null}

      <Text style={styles.body}>{item.body}</Text>

      <View style={styles.options}>
        {item.options.map((o) => {
          const isSelected = selected === o.key;
          const locked = selected !== null;
          return (
            <TouchableOpacity
              key={o.key}
              activeOpacity={0.85}
              disabled={locked}
              onPress={() => setSelected(o.key)}
              style={[styles.option, isSelected && styles.optionSelected, locked && !isSelected && styles.optionDimmed]}
            >
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {chosen ? (
        <View style={styles.feedback}>
          <Text style={styles.feedbackText}>{chosen.feedback}</Text>
          <Button label={t('next')} loading={busy} onPress={() => onNext(chosen.key)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  media: { width: '100%', height: 200, borderRadius: radii.lg },
  videoPlaceholder: { width: '100%', height: 200, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  videoIcon: { color: colors.text, fontSize: 40 },
  body: { ...typography.title, color: colors.text },
  options: { gap: spacing.sm },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  optionDimmed: { opacity: 0.5 },
  optionLabel: { ...typography.body, color: colors.text },
  optionLabelSelected: { fontWeight: '600' },
  feedback: { gap: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: spacing.md },
  feedbackText: { ...typography.body, color: colors.textMuted },
});
