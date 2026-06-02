import { useEffect, useState } from 'react';
import { FlatList, View, Text, Image, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '@/api/client';
import { i18n, t } from '@/i18n';
import type { RootStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Feed'>;

/**
 * Read-only community feed (spec 3.4). Renders admin posts only — no comments,
 * likes or user posts. When access is locked, shows the subscription paywall.
 */
export function FeedScreen(_props: Props) {
  const [posts, setPosts] = useState<any[]>([]);
  const [paywall, setPaywall] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .feed(i18n.locale)
      .then((r) => {
        if (r.locked) setPaywall(r.showPaywall);
        else setPosts(r.posts);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (paywall) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Community</Text>
        <TouchableOpacity style={styles.btn}>
          <Text style={styles.btnText}>{t('subscribe_community')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: 16, paddingTop: 60 }}
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <View style={styles.post}>
          {item.mediaUrl ? <Image source={{ uri: item.mediaUrl }} style={styles.media} /> : null}
          <Text style={styles.postTitle}>{item.title}</Text>
          <Text style={styles.postBody}>{item.body}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  btn: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', alignSelf: 'stretch' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  post: { marginBottom: 20, gap: 8 },
  media: { width: '100%', height: 180, borderRadius: 12 },
  postTitle: { fontSize: 18, fontWeight: '600' },
  postBody: { fontSize: 15, color: '#444', lineHeight: 22 },
});
