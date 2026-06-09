import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '@/theme';

/** Horizontal progress bar (0..1). */
export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

/** Level badge 1..5 with label. */
export function LevelBadge({ level, label }: { level: number; label?: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeNum}>{level}</Text>
      {label ? <Text style={styles.badgeLabel}>{label}</Text> : null}
    </View>
  );
}

/** Streak counter pill with flame glyph. */
export function StreakPill({ days, label }: { days: number; label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillIcon}>🔥</Text>
      <Text style={styles.pillText}>
        {days} · {label}
      </Text>
    </View>
  );
}

/** Dots showing position within a short sequence (funnel free items). */
export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i === current && styles.dotActive, i < current && styles.dotDone]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: radii.pill },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill },
  badgeNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, color: colors.accentText, textAlign: 'center', lineHeight: 22, fontWeight: '700' },
  badgeLabel: { color: colors.text, ...typography.caption },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill },
  pillIcon: { fontSize: 14 },
  pillText: { color: colors.text, ...typography.caption },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 24 },
  dotDone: { backgroundColor: colors.accent },
});
