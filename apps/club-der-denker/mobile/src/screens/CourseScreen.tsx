import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, Loading, Body } from '@/components/ui';
import { ItemCard, ItemData } from '@/components/ItemCard';
import { ProgressBar, LevelBadge, StreakPill } from '@/components/gamification';
import { api, deviceTimeZone } from '@/api/client';
import { savePack, loadPack, enqueueAnswer } from '@/cache/offline';
import { i18n, t, levelName } from '@/i18n';
import { colors, spacing, typography } from '@/theme';

/**
 * Paid course (spec 3.3): the daily pack of up to 4 items, gated server-side by
 * the timezone unlock engine, with a progress header (level, streak, day). The
 * pack is cached offline; answers queue when offline and sync on reconnect.
 */
export function CourseScreen() {
  const [items, setItems] = useState<ItemData[]>([]);
  const [idx, setIdx] = useState(0);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [today, prof] = await Promise.all([api.today(i18n.locale), api.profile().catch(() => null)]);
      setProfile(prof);
      if (today.locked) {
        setLocked(true);
      } else {
        setItems(today.items);
        setIdx(0);
        setLocked(false);
        await savePack({ dayIndex: today.dayIndex, items: today.items, cachedAt: Date.now() });
      }
    } catch {
      const cached = await loadPack();
      if (cached) {
        setItems(cached.items);
        setIdx(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleNext(selectedKey: string) {
    const item = items[idx];
    setBusy(true);
    try {
      const res = await api.answer(item.id, selectedKey);
      setProfile((p: any) => (p ? { ...p, level: res.level, streakDays: res.streakDays, itemsCompleted: res.itemsCompleted, progress: res.itemsCompleted / 112 } : p));
    } catch {
      await enqueueAnswer({ itemId: item.id, selectedKey, tz: deviceTimeZone(), at: Date.now() });
    } finally {
      setBusy(false);
    }
    if (idx + 1 < items.length) setIdx(idx + 1);
    else setLocked(true); // pack done -> locked until local midnight
  }

  if (loading) return <Loading />;

  const completedAll = profile && profile.itemsCompleted >= 112;

  return (
    <Screen scroll>
      {profile ? (
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <LevelBadge level={profile.level} label={levelName(profile.level)} />
            <StreakPill days={profile.streakDays} label={t('profile_streak')} />
          </View>
          <ProgressBar value={profile.progress ?? 0} />
          <Text style={styles.day}>{t('course_day', { day: profile.currentDay ?? 1 })}</Text>
        </View>
      ) : null}

      {completedAll ? (
        <View style={styles.center}><Body>{t('course_completed_all')}</Body></View>
      ) : locked || items.length === 0 ? (
        <View style={styles.center}><Body muted>{t('course_locked')}</Body></View>
      ) : (
        <ItemCard key={items[idx].id} item={items[idx]} onNext={handleNext} busy={busy} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginBottom: spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  day: { ...typography.caption, color: colors.textMuted },
  center: { flex: 1, minHeight: 240, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
});
