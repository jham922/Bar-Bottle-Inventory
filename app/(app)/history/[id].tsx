import { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getSession, getInventorySessionEntries, SessionWithMeta } from '@/lib/history';
import { InventorySessionEntry } from '@/types/database';
import { buildHistoryCsv, shareCsv } from '@/lib/export';
import { mlToOz } from '@/lib/scan';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appUser = useAppUser();
  const [session, setSession] = useState<SessionWithMeta | null>(null);
  const [entries, setEntries] = useState<InventorySessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appUser || !id) return;
    (async () => {
      try {
        const [foundSession, foundEntries] = await Promise.all([
          getSession(id),
          getInventorySessionEntries(id),
        ]);
        setSession(foundSession);
        setEntries(foundEntries);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [appUser, id]);

  async function handleExport() {
    if (!session) return;
    const csv = buildHistoryCsv(entries, session.submitted_at);
    const date = new Date(session.submitted_at).toISOString().slice(0, 10);
    await shareCsv(csv, `inventory-${date}.csv`);
  }

  const titleLabel = session
    ? new Date(session.submitted_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '…';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{titleLabel}</Text>
        <Pressable onPress={handleExport} style={styles.exportBtn}>
          <Text style={styles.exportBtnText}>Export CSV</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={e => e.id}
          renderItem={({ item }) => {
            const fillPct = item.fill_pct ?? 0;
            return (
              <View style={styles.row}>
                <Text style={styles.brand}>{item.brand}</Text>
                <Text style={styles.detail}>{item.spirit_type} · {item.total_volume_ml}ml</Text>
                <View style={styles.fillBarBg}>
                  <View style={[styles.fillBarFg, { width: `${Math.min(fillPct, 100)}%` }]} />
                </View>
                <Text style={styles.detail}>
                  {fillPct}% · {item.volume_remaining_ml}ml · {mlToOz(item.volume_remaining_ml)}oz
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, marginRight: 12 },
  exportBtn: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  exportBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  brand: { color: '#fff', fontSize: 16, fontWeight: '500' },
  detail: { color: '#888', fontSize: 13, marginTop: 2 },
  fillBarBg: { height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden', marginTop: 4, marginBottom: 2 },
  fillBarFg: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  error: { color: '#f87171', fontSize: 14, padding: 16 },
});
