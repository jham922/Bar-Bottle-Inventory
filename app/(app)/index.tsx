import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getRecentActivity, ActivityItem } from '@/lib/activity';
import { supabase } from '@/lib/supabase';

interface DashboardStats {
  totalBottles: number;
  lowStockCount: number;
  spiritTypeCount: number;
  lastScanAt: string | null;
}

async function getDashboardStats(barId: string): Promise<DashboardStats> {
  const [bottlesRes, alertsRes, scansRes] = await Promise.all([
    supabase.from('bottles').select('id, spirit_type').eq('bar_id', barId),
    supabase.from('alerts').select('id', { count: 'exact' }).is('resolved_at', null),
    supabase.from('inventory_scans')
      .select('scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(1),
  ]);

  const bottles = bottlesRes.data ?? [];
  const spiritTypes = new Set(bottles.map((b: any) => b.spirit_type)).size;

  return {
    totalBottles: bottles.length,
    lowStockCount: alertsRes.count ?? 0,
    spiritTypeCount: spiritTypes,
    lastScanAt: scansRes.data?.[0]?.scanned_at ?? null,
  };
}

export default function HomeScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user?.bar_id) return;
    getDashboardStats(user.bar_id).then(setStats);
    if (isAdmin) getRecentActivity(user.bar_id).then(setActivity);
  }, [user]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.barName}>Bar Inventory</Text>
        <Text style={styles.userName}>{user?.display_name}</Text>
      </View>

      {stats ? (
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.totalBottles}</Text>
            <Text style={styles.statLabel}>Total Bottles</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.lowStockCount}</Text>
            <Text style={styles.statLabel}>Low Stock</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.spiritTypeCount}</Text>
            <Text style={styles.statLabel}>Spirit Types</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.lastScanAt ? new Date(stats.lastScanAt).toLocaleDateString() : '—'}</Text>
            <Text style={styles.statLabel}>Last Scan</Text>
          </View>
        </View>
      ) : (
        <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
      )}

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => router.push('/(app)/scan/index')}>
          <Text style={styles.actionBtnText}>Scan</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => router.push('/(app)/inventory/index')}>
          <Text style={[styles.actionBtnText, { color: '#ddd' }]}>Inventory</Text>
        </Pressable>
        {isAdmin && (
          <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => router.push('/(app)/reports/index')}>
            <Text style={[styles.actionBtnText, { color: '#ddd' }]}>Report</Text>
          </Pressable>
        )}
      </View>

      {isAdmin && activity.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {activity.slice(0, 8).map(item => (
            <View key={item.id} style={styles.activityRow}>
              <Text style={styles.activityText}>
                {item.users?.display_name ?? 'Someone'}: {item.action}
              </Text>
              <Text style={styles.activityTime}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  barName: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  userName: { color: '#888', fontSize: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, gap: 1, backgroundColor: '#222', borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  statCell: { width: '50%', backgroundColor: '#1a1a1a', padding: 16, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 24 },
  actionBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 14, alignItems: 'center' },
  actionBtnSecondary: { backgroundColor: '#222' },
  actionBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  section: { paddingHorizontal: 16 },
  sectionTitle: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  activityRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  activityText: { color: '#ccc', fontSize: 13, flex: 1, marginRight: 8 },
  activityTime: { color: '#555', fontSize: 12 },
});
