import { useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getConsumptionReport, ConsumptionReportItem } from '@/lib/reports';
import { buildConsumptionCsv, shareCsv } from '@/lib/export';

const OZ = 29.5735;

export default function ConsumptionReportScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ConsumptionReportItem[] | null>(null);

  async function handleRun() {
    if (!user || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const data = await getConsumptionReport(user.bar_id, dateStart, dateEnd);
      setResults(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!results) return;
    try {
      const csv = buildConsumptionCsv(results, dateStart, dateEnd);
      await shareCsv(csv, `consumption-${dateStart}-${dateEnd}.csv`);
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← Reports</Text></Pressable>
        <Text style={styles.title}>Consumption Report</Text>
      </View>

      <View style={styles.filters}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={dateStart}
          onChangeText={setDateStart}
          placeholder="Start (YYYY-MM-DD)"
          placeholderTextColor="#666"
        />
        <Text style={styles.sep}>–</Text>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={dateEnd}
          onChangeText={setDateEnd}
          placeholder="End (YYYY-MM-DD)"
          placeholderTextColor="#666"
        />
        <Pressable
          style={[styles.runBtn, (!dateStart || !dateEnd || loading) && { opacity: 0.5 }]}
          onPress={handleRun}
          disabled={!dateStart || !dateEnd || loading}
        >
          {loading ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.runBtnText}>Run</Text>}
        </Pressable>
      </View>

      {results !== null && (
        <>
          {results.length === 0 ? (
            <Text style={styles.empty}>No consumption data found for this date range.</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.col, { flex: 2 }]}>Brand</Text>
                <Text style={styles.col}>Type</Text>
                <Text style={[styles.col, { textAlign: 'right' }]}>ml</Text>
                <Text style={[styles.col, { textAlign: 'right' }]}>oz</Text>
              </View>
              <FlatList
                data={results}
                keyExtractor={r => r.bottle_id}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Text style={[styles.cell, { flex: 2 }]} numberOfLines={1}>{item.brand}</Text>
                    <Text style={styles.cell}>{item.spirit_type}</Text>
                    <Text style={[styles.cell, { textAlign: 'right' }]}>{item.consumed_ml}</Text>
                    <Text style={[styles.cell, { textAlign: 'right' }]}>{(item.consumed_ml / OZ).toFixed(1)}</Text>
                  </View>
                )}
              />
              <Pressable style={styles.exportBtn} onPress={handleExport}>
                <Text style={styles.exportBtnText}>Export CSV</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { padding: 20, paddingTop: 60 },
  back: { color: '#888', fontSize: 14, marginBottom: 8 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  filters: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 10, fontSize: 13 },
  sep: { color: '#888' },
  runBtn: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  runBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#333' },
  col: { color: '#888', fontSize: 11, textTransform: 'uppercase', flex: 1 },
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  cell: { color: '#fff', fontSize: 13, flex: 1 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  exportBtn: { margin: 16, borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, alignItems: 'center' },
  exportBtnText: { color: '#888', fontSize: 14 },
});
