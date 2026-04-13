import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAppUser } from '@/lib/useAppUser';
import { getRecipeWithIngredients, getRecipes } from '@/lib/recipes';
import { parseToastCsv } from '@/lib/toast';
import { getVarianceReport, VarianceReportItem } from '@/lib/reports';
import { buildVarianceCsv, buildVarianceHtml, shareCsv, printReport } from '@/lib/export';
import { RecipeWithIngredients } from '@/lib/recipes';

export default function VarianceReportScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<VarianceReportItem[] | null>(null);

  async function handlePickCsv() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
      if (result.canceled) return;
      const asset = result.assets[0];
      let text: string;
      if (asset.uri.startsWith('data:')) {
        text = atob(asset.uri.split(',')[1]);
      } else {
        text = await FileSystem.readAsStringAsync(asset.uri);
      }
      setCsvText(text);
      setCsvLoaded(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleRun() {
    if (!user || !csvText || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const recipes = await getRecipes(user.bar_id) as RecipeWithIngredients[];
      const sales = parseToastCsv(csvText);
      const data = await getVarianceReport(user.bar_id, dateStart, dateEnd, sales, recipes);
      setResults(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCsv() {
    if (!results) return;
    try {
      const csv = buildVarianceCsv(results, dateStart, dateEnd);
      await shareCsv(csv, `variance-${dateStart}-${dateEnd}.csv`);
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    }
  }

  async function handlePrint() {
    if (!results) return;
    try {
      const html = buildVarianceHtml(results, dateStart, dateEnd);
      await printReport(html);
    } catch (e: any) {
      Alert.alert('Print failed', e.message);
    }
  }

  const canRun = !!csvText && !!dateStart && !!dateEnd && !loading;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← Reports</Text></Pressable>
        <Text style={styles.title}>Variance Report</Text>
        <Text style={styles.subtitle}>Compare theoretical usage (Toast sales × recipes) vs actual consumption.</Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.dateRow}>
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
        </View>

        <Pressable style={styles.csvBtn} onPress={handlePickCsv}>
          <Text style={styles.csvBtnText}>{csvLoaded ? 'Toast CSV loaded ✓' : 'Load Toast CSV'}</Text>
        </Pressable>

        <Pressable
          style={[styles.runBtn, !canRun && { opacity: 0.5 }]}
          onPress={handleRun}
          disabled={!canRun}
        >
          {loading ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.runBtnText}>Run Report</Text>}
        </Pressable>
      </View>

      {results !== null && (
        <>
          {results.length === 0 ? (
            <Text style={styles.empty}>No variance data. Make sure recipes have matching Toast menu item names.</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.col, { flex: 2 }]}>Brand</Text>
                <Text style={[styles.col, { textAlign: 'right' }]}>Theory</Text>
                <Text style={[styles.col, { textAlign: 'right' }]}>Actual</Text>
                <Text style={[styles.col, { textAlign: 'right' }]}>Var%</Text>
              </View>
              <FlatList
                data={results}
                keyExtractor={r => r.bottle_id}
                renderItem={({ item }) => (
                  <View style={[styles.row, item.flagged && styles.rowFlagged]}>
                    <Text style={[styles.cell, { flex: 2 }]} numberOfLines={1}>{item.brand}</Text>
                    <Text style={[styles.cell, { textAlign: 'right' }]}>{item.theoretical_ml}ml</Text>
                    <Text style={[styles.cell, { textAlign: 'right' }]}>{item.actual_ml}ml</Text>
                    <Text style={[styles.cell, { textAlign: 'right' }, item.flagged && styles.flaggedText]}>
                      {item.variance_pct}%{item.flagged ? ' ⚠' : ''}
                    </Text>
                  </View>
                )}
              />
              <View style={styles.actions}>
                <Pressable style={styles.actionBtn} onPress={handleExportCsv}>
                  <Text style={styles.actionBtnText}>Export CSV</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={handlePrint}>
                  <Text style={styles.actionBtnText}>Print / PDF</Text>
                </Pressable>
              </View>
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
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: '#555', fontSize: 12, lineHeight: 17 },
  controls: { padding: 16, gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 10, fontSize: 13 },
  sep: { color: '#888' },
  csvBtn: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, alignItems: 'center' },
  csvBtnText: { color: '#888', fontSize: 13 },
  runBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 12, alignItems: 'center' },
  runBtnText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#333' },
  col: { color: '#888', fontSize: 11, textTransform: 'uppercase', flex: 1 },
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  rowFlagged: { backgroundColor: '#2a1a1a' },
  cell: { color: '#fff', fontSize: 13, flex: 1 },
  flaggedText: { color: '#ff6666' },
  empty: { color: '#666', textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, padding: 16 },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, alignItems: 'center' },
  actionBtnText: { color: '#888', fontSize: 13 },
});
