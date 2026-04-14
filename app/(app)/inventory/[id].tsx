import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getBottleHistory } from '@/lib/inventory';
import { mlToOz } from '@/lib/scan';
import { supabase } from '@/lib/supabase';
import { Bottle, InventoryScan } from '@/types/database';

export default function BottleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const appUser = useAppUser();

  const [bottle, setBottle] = useState<Bottle | null>(null);
  const [history, setHistory] = useState<InventoryScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Alert threshold editing (admin only)
  const [thresholdMl, setThresholdMl] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const { data: b, error: bErr } = await supabase.from('bottles').select('*').eq('id', id).single();
      if (bErr) throw bErr;
      setBottle(b as Bottle);

      const h = await getBottleHistory(id);
      setHistory(h);

      // Load existing alert threshold
      const { data: alert } = await supabase
        .from('alerts')
        .select('threshold_ml')
        .eq('bottle_id', id)
        .is('resolved_at', null)
        .maybeSingle();
      if (alert) setThresholdMl(String(alert.threshold_ml));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Bottle',
      `Delete "${bottle?.brand}" and all its scan history? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await supabase.from('inventory_scans').delete().eq('bottle_id', id);
              await supabase.from('alerts').delete().eq('bottle_id', id);
              await supabase.from('bottles').delete().eq('id', id);
              router.replace('/(app)/inventory');
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to delete');
            }
          },
        },
      ]
    );
  }

  async function handleSaveThreshold() {
    const ml = parseInt(thresholdMl, 10);
    if (isNaN(ml) || ml <= 0) {
      Alert.alert('Invalid threshold', 'Enter a positive number of ml.');
      return;
    }
    setSavingThreshold(true);
    try {
      // Upsert: delete existing unresolved alert, insert fresh one
      await supabase.from('alerts').delete().eq('bottle_id', id).is('resolved_at', null);
      await supabase.from('alerts').insert({ bottle_id: id, threshold_ml: ml });
      Alert.alert('Saved', `Alert set at ${ml} ml`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save');
    } finally {
      setSavingThreshold(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (error || !bottle) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.error}>{error ?? 'Bottle not found'}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const latest = history[0];
  const fillPct = latest?.fill_pct ?? null;
  const volumeMl = latest?.volume_remaining_ml ?? null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <Text style={styles.link}>‹ Inventory</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{bottle.brand}</Text>
      <Text style={styles.subtitle}>{bottle.spirit_type} · {bottle.total_volume_ml} ml</Text>

      {fillPct !== null ? (
        <>
          <View style={styles.fillBarBg}>
            <View style={[styles.fillBarFg, { width: `${Math.min(fillPct, 100)}%` }]} />
          </View>
          <Text style={styles.volumeText}>
            {fillPct}% · {volumeMl} ml · {mlToOz(volumeMl!)} oz remaining
          </Text>
        </>
      ) : (
        <Text style={styles.noScanText}>Not yet scanned</Text>
      )}

      {appUser?.role === 'admin' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Low-Stock Alert</Text>
          <Text style={styles.label}>Alert when below (ml)</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={thresholdMl}
              onChangeText={setThresholdMl}
              keyboardType="numeric"
              placeholder="e.g. 200"
              placeholderTextColor="#555"
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveThreshold} disabled={savingThreshold}>
              <Text style={styles.saveButtonText}>{savingThreshold ? '...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {appUser?.role === 'admin' && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Delete Bottle</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scan History</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>No scans yet</Text>
        ) : (
          history.map((scan) => (
            <View key={scan.id} style={styles.historyRow}>
              <View style={styles.fillBarBgSmall}>
                <View style={[styles.fillBarFgSmall, { width: `${Math.min(scan.fill_pct, 100)}%` }]} />
              </View>
              <View style={styles.historyDetails}>
                <Text style={styles.historyPct}>{scan.fill_pct}% — {scan.volume_remaining_ml} ml</Text>
                <Text style={styles.historyDate}>{new Date(scan.scanned_at).toLocaleString()}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  centered: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  content: { padding: 16, gap: 8 },
  backRow: { marginBottom: 8 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 12 },
  fillBarBg: { height: 10, backgroundColor: '#333', borderRadius: 5, overflow: 'hidden', marginBottom: 4 },
  fillBarFg: { height: '100%', backgroundColor: '#fff', borderRadius: 5 },
  volumeText: { color: '#aaa', fontSize: 14 },
  noScanText: { color: '#555', fontSize: 14 },
  section: { marginTop: 24 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  label: { color: '#888', fontSize: 13, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#fff',
    padding: 10,
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  saveButtonText: { color: '#111', fontWeight: '600' },
  historyRow: { marginBottom: 12 },
  fillBarBgSmall: { height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden', marginBottom: 3 },
  fillBarFgSmall: { height: '100%', backgroundColor: '#888', borderRadius: 3 },
  historyDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  historyPct: { color: '#ccc', fontSize: 14 },
  historyDate: { color: '#555', fontSize: 12 },
  emptyText: { color: '#555', fontSize: 14 },
  deleteButton: { marginTop: 24, borderWidth: 1, borderColor: '#f87171', borderRadius: 8, padding: 14, alignItems: 'center' },
  deleteButtonText: { color: '#f87171', fontWeight: '600', fontSize: 15 },
  error: { color: '#f87171', fontSize: 14, marginBottom: 8 },
  link: { color: '#aaa', fontSize: 15 },
});
