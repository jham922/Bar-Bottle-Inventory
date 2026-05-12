import { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getLastSession, getPendingBottles, submitInventoryCount, PendingBottle } from '@/lib/history';
import { mlToOz } from '@/lib/scan';

export default function SubmitInventoryScreen() {
  const router = useRouter();
  const appUser = useAppUser();
  const [bottles, setBottles] = useState<PendingBottle[]>([]);
  const [sinceLabel, setSinceLabel] = useState<string>('the beginning');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appUser) return;
    (async () => {
      try {
        const last = await getLastSession(appUser.bar_id);
        if (last) {
          setSinceLabel(new Date(last.submitted_at).toLocaleString());
        }
        const pending = await getPendingBottles(appUser.bar_id, last?.submitted_at ?? null);
        setBottles(pending);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [appUser]);

  async function handleSubmit() {
    if (!appUser || bottles.length === 0) return;
    setSubmitting(true);
    try {
      await submitInventoryCount(appUser.bar_id, appUser.id, bottles);
      router.back();
    } catch (e: any) {
      setError(e.message ?? 'Submit failed');
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Submit Inventory Count</Text>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : bottles.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No new scans since last count</Text>
          <Text style={styles.emptySubtext}>Scan some bottles before submitting.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.subtitle}>
            {bottles.length} bottle{bottles.length !== 1 ? 's' : ''} scanned since {sinceLabel}
          </Text>

          <FlatList
            data={bottles}
            keyExtractor={b => b.bottle_id}
            style={styles.list}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.brand}>{item.brand}</Text>
                <Text style={styles.detail}>
                  {item.fill_pct}% · {item.volume_remaining_ml}ml · {mlToOz(item.volume_remaining_ml)}oz
                </Text>
              </View>
            )}
          />

          <Pressable
            style={[styles.btn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.btnText}>
              {submitting ? 'Submitting…' : 'Confirm & Submit'}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 16, paddingTop: 60 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 16 },
  list: { flex: 1 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  brand: { color: '#fff', fontSize: 15, fontWeight: '500' },
  detail: { color: '#888', fontSize: 13, marginTop: 2 },
  btn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  emptySubtext: { color: '#666', fontSize: 13, marginTop: 6 },
  error: { color: '#f87171', fontSize: 14 },
});
