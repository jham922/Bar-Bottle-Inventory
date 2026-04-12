import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getInventoryList, SPIRIT_TYPES, BottleWithLatestScan } from '@/lib/inventory';
import { mlToOz } from '@/lib/scan';

export default function InventoryScreen() {
  const router = useRouter();
  const appUser = useAppUser();
  const [bottles, setBottles] = useState<BottleWithLatestScan[]>([]);
  const [search, setSearch] = useState('');
  const [spiritFilter, setSpiritFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBottles = useCallback(async () => {
    if (!appUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getInventoryList(appUser.bar_id, search || undefined, spiritFilter);
      setBottles(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [appUser, search, spiritFilter]);

  useEffect(() => { loadBottles(); }, [loadBottles]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inventory</Text>

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by brand..."
        placeholderTextColor="#555"
        returnKeyType="search"
        onSubmitEditing={loadBottles}
      />

      {/* Spirit type filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[styles.chip, !spiritFilter && styles.chipActive]}
          onPress={() => setSpiritFilter(undefined)}
        >
          <Text style={[styles.chipText, !spiritFilter && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {SPIRIT_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.chip, spiritFilter === type && styles.chipActive]}
            onPress={() => setSpiritFilter(spiritFilter === type ? undefined : type)}
          >
            <Text style={[styles.chipText, spiritFilter === type && styles.chipTextActive]}>{type}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : bottles.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No bottles found</Text>
        </View>
      ) : (
        <FlatList
          data={bottles}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => {
            const fillPct = item.fill_pct ?? 0;
            const volumeMl = item.volume_remaining_ml ?? 0;
            const low = item.fill_pct !== null && fillPct < 25;
            return (
              <TouchableOpacity style={styles.row} onPress={() => router.push(`/inventory/${item.id}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.brand}>{item.brand}</Text>
                  <Text style={styles.detail}>{item.spirit_type} · {item.total_volume_ml} ml</Text>
                  {item.fill_pct !== null ? (
                    <>
                      <View style={styles.fillBarBg}>
                        <View style={[styles.fillBarFg, { width: `${Math.min(fillPct, 100)}%` }]} />
                      </View>
                      <Text style={styles.detail}>
                        {fillPct}% · {volumeMl} ml · {mlToOz(volumeMl)} oz
                        {low ? ' ⚠️' : ''}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.detail}>Not yet scanned</Text>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', padding: 16, paddingBottom: 8 },
  searchInput: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#fff',
    padding: 10,
    fontSize: 15,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  filterRow: { flexGrow: 0 },
  filterContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: '#888', fontSize: 13 },
  chipTextActive: { color: '#111', fontWeight: '600' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  brand: { color: '#fff', fontSize: 16, fontWeight: '500' },
  detail: { color: '#888', fontSize: 13, marginTop: 2 },
  fillBarBg: { height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden', marginTop: 4, marginBottom: 2 },
  fillBarFg: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  chevron: { color: '#555', fontSize: 22, marginLeft: 8 },
  emptyText: { color: '#666', fontSize: 16 },
  error: { color: '#f87171', fontSize: 14 },
});
