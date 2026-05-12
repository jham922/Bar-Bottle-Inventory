import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAppUser } from '@/lib/useAppUser';
import { getInventorySessions, SessionWithMeta } from '@/lib/history';

export default function HistoryScreen() {
  const router = useRouter();
  const appUser = useAppUser();
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!appUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getInventorySessions(appUser.bar_id);
      setSessions(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [appUser]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inventory History</Text>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : sessions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No inventory counts submitted yet</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={s => s.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/history/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.date}>
                  {new Date(item.submitted_at).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                  {' · '}
                  {new Date(item.submitted_at).toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
                <Text style={styles.meta}>
                  {item.bottle_count} bottle{item.bottle_count !== 1 ? 's' : ''} · submitted by {item.submitter_name}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', padding: 16, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  date: { color: '#fff', fontSize: 15, fontWeight: '500' },
  meta: { color: '#888', fontSize: 13, marginTop: 2 },
  chevron: { color: '#555', fontSize: 22, marginLeft: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#666', fontSize: 16 },
  error: { color: '#f87171', fontSize: 14, padding: 16 },
});
