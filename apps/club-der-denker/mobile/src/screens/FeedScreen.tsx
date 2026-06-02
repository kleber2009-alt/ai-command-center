import { useEffect, useState, useCallback } from 'react';
import { FlatList, View, Text, Image, StyleSheet } from 'react-native';
import { Screen, Loading, Button, Heading } from '@/components/ui';
import { useIAP } from '@/iap/useIAP';
import { i18n, t } from '@/i18n';
import { api } from '@/api/client';
import { colors, radii, spacing, typography } from '@/theme';

/**
 * Read-only community feed (spec 3.4). Renders admin posts only — no comments,
 * likes or user posts. When access is locked, shows the subscription paywall.
 */
export function FeedScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [paywall, setPaywall] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .feed(i18n.locale)
      .then((r) => {
        if (r.locked) {
          setPaywall(r.showPaywall);
          setPosts([]);
        } else {
          setPaywall(false);
          setPosts(r.posts);
        }
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  // Subscribing (authenticated) verifies inline; reload the feed on success.
  const { busy, subscribeCommunity } = useIAP(() => load());

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading />;

  if (paywall) {
    return (
      <Screen>
        <View style={styles.center}>
          <Heading>{t('feed_locked_title')}</Heading>
          <Button label={t('subscribe_community')} loading={busy} onPress={subscribeCommunity} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={styles.post}>
            {item.mediaUrl ? <Image source={{ uri: item.mediaUrl }} style={styles.media} /> : null}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  post: { gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.lg },
  media: { width: '100%', height: 180, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textMuted },
});
