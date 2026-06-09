import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Screen, Loading, Button, Card } from '@/components/ui';
import { ProgressBar, LevelBadge, StreakPill } from '@/components/gamification';
import { api } from '@/api/client';
import { useSession } from '@/store/SessionContext';
import { setLocale, SUPPORTED, LOCALE_NAMES, t, levelName, AppLocale } from '@/i18n';
import { colors, radii, spacing, typography } from '@/theme';

/**
 * Profile dashboard (spec 3.2): name, email, level badge, activity, joker
 * status; instant language switch and GDPR account deletion.
 */
export function ProfileScreen() {
  const { signOut } = useSession();
  const [profile, setProfile] = useState<any>(null);

  const load = useCallback(() => {
    api.profile().then(setProfile).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeLocale(loc: AppLocale) {
    await setLocale(loc);
    await api.setLocale(loc).catch(() => {});
    setProfile((p: any) => ({ ...p, locale: loc }));
  }

  function confirmDelete() {
    Alert.alert(t('delete_confirm_title'), t('delete_confirm_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await api.deleteAccount().catch(() => {});
          await signOut();
        },
      },
    ]);
  }

  if (!profile) return <Loading />;

  const joker = profile.jokerAvailable ? `1 ${t('joker_available')}` : profile.jokerUsed ? `0 (${t('joker_used')})` : '0';

  return (
    <Screen scroll>
      <Text style={styles.email}>{profile.displayName ?? profile.email}</Text>

      <Card style={{ gap: spacing.md }}>
        <View style={styles.row}>
          <LevelBadge level={profile.level} label={levelName(profile.level)} />
          <StreakPill days={profile.streakDays} label={t('profile_streak')} />
        </View>
        <ProgressBar value={profile.progress ?? 0} />
        <View style={styles.statRow}>
          <Stat label={t('profile_progress')} value={`${profile.itemsCompleted} / 112`} />
          <Stat label={t('profile_joker')} value={joker} />
        </View>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.sectionLabel}>{t('language')}</Text>
        <View style={styles.langRow}>
          {SUPPORTED.map((loc) => (
            <TouchableOpacity key={loc} style={[styles.lang, profile.locale === loc && styles.langActive]} onPress={() => changeLocale(loc)}>
              <Text style={profile.locale === loc ? styles.langActiveText : styles.langText}>{LOCALE_NAMES[loc]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ flex: 1 }} />
      <Button label={t('logout')} variant="secondary" onPress={signOut} />
      <Button label={t('delete_account')} variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  email: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statRow: { flexDirection: 'row', gap: spacing.md },
  statLabel: { ...typography.caption, color: colors.textFaint },
  statValue: { ...typography.title, color: colors.text },
  sectionLabel: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lang: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  langActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  langText: { ...typography.caption, color: colors.text },
  langActiveText: { ...typography.caption, color: colors.accentText, fontWeight: '600' },
});
