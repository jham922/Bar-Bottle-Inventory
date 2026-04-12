import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useAppUser } from '@/lib/useAppUser';
import { getActiveAlerts, formatDuration, ActiveAlert } from '@/lib/alerts';
import { mlToOz } from '@/lib/scan';

export default function AlertsScreen() {
  const appUser = useAppUser();
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderList, setOrderList] = useState<Set<string>>(new Set());

  const loadAlerts = useCallback(async () => {
    if (!appUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveAlerts(appUser.bar_id);
      setAlerts(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [appUser]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  function toggleOrderList(bottleId: string) {
    setOrderList((prev) => {
      const next = new Set(prev);
      if (next.has(bottleId)) {
        next.delete(bottleId);
      } else {
        next.add(bottleId);
      }
      return next;
    });
  }

  async function handleExportOrderList() {
    const items = alerts.filter((a) => orderList.has(a.bottle_id));
    if (items.length === 0) {
      Alert.alert('Order List Empty', 'Add bottles to the order list first.');
      return;
    }
    const lines = [
      'Order List',
      `Generated: ${new Date().toLocaleString()}`,
      '',
      ...items.map((a) =>
        `${a.brand} (${a.spirit_type}) — ${a.current_volume_ml ?? 0} ml remaining, threshold: ${a.threshold_ml} ml`
      ),
    ];
    await Share.share({ message: lines.join('\n') });
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Low-Stock Alerts</Text>
        {orderList.size > 0 && (
          <TouchableOpacity style={styles.exportButton} onPress={handleExportOrderList}>
            <Text style={styles.exportButtonText}>Export Order List ({orderList.size})</Text>
          </TouchableOpacity>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {alerts.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No active low-stock alerts</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => {
            const inOrder = orderList.has(item.bottle_id);
            const duration = item.ms_below_threshold ? formatDuration(item.ms_below_threshold) : null;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.brand}>{item.brand}</Text>
                    <Text style={styles.detail}>{item.spirit_type}</Text>
                  </View>
                  <Text style={styles.warningIcon}>⚠️</Text>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Current</Text>
                    <Text style={styles.statValue}>
                      {item.current_fill_pct ?? '—'}%
                    </Text>
                    <Text style={styles.statSub}>
                      {item.current_volume_ml ?? '—'} ml · {item.current_volume_ml ? mlToOz(item.current_volume_ml) : '—'} oz
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Threshold</Text>
                    <Text style={styles.statValue}>{item.threshold_ml} ml</Text>
                  </View>
                  {duration && (
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>Below for</Text>
                      <Text style={styles.statValue}>{duration}</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.orderButton, inOrder && styles.orderButtonActive]}
                  onPress={() => toggleOrderList(item.bottle_id)}
                >
                  <Text style={[styles.orderButtonText, inOrder && styles.orderButtonTextActive]}>
                    {inOrder ? '✓ On Order List' : '+ Add to Order List'}
                  </Text>
                </TouchableOpacity>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  exportButton: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  exportButtonText: { color: '#fff', fontSize: 13 },
  card: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  brand: { color: '#fff', fontSize: 17, fontWeight: '600' },
  detail: { color: '#888', fontSize: 13, marginTop: 2 },
  warningIcon: { fontSize: 20, marginLeft: 8 },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  stat: { flex: 1 },
  statLabel: { color: '#666', fontSize: 11, marginBottom: 2 },
  statValue: { color: '#fff', fontSize: 15, fontWeight: '600' },
  statSub: { color: '#666', fontSize: 11 },
  orderButton: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  orderButtonActive: { backgroundColor: '#fff', borderColor: '#fff' },
  orderButtonText: { color: '#aaa', fontSize: 14 },
  orderButtonTextActive: { color: '#111', fontWeight: '600' },
  emptyText: { color: '#666', fontSize: 16 },
  error: { color: '#f87171', fontSize: 14, textAlign: 'center', padding: 8 },
});
