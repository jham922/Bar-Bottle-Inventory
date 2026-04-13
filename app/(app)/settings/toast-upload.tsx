import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAppUser } from '@/lib/useAppUser';
import { getRecipes } from '@/lib/recipes';
import { parseToastCsv, saveToastUpload, ToastSaleRow } from '@/lib/toast';
import { RecipeWithIngredients } from '@/lib/recipes';

export default function ToastUploadScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [preview, setPreview] = useState<ToastSaleRow[] | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handlePickFile() {
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
      const rows = parseToastCsv(text);
      setCsvText(text);
      setPreview(rows);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleUpload() {
    if (!user || !csvText || !dateStart || !dateEnd) return;
    setSaving(true);
    try {
      const recipes = await getRecipes(user.bar_id) as RecipeWithIngredients[];
      const sales = parseToastCsv(csvText);
      await saveToastUpload(user.bar_id, user.id, dateStart, dateEnd, sales, recipes);
      Alert.alert('Uploaded', 'Toast data saved. You can now generate variance reports.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const canUpload = !!csvText && !!dateStart && !!dateEnd && !saving;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 60 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Settings</Text></Pressable>
      <Text style={styles.title}>Toast Product Mix Upload</Text>
      <Text style={styles.hint}>Export "Product Mix" from Toast > Reports, then upload the CSV here. Make sure your recipes have matching Toast menu item names.</Text>

      <Text style={styles.label}>Date range start (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={dateStart}
        onChangeText={setDateStart}
        placeholder="2024-01-01"
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Date range end (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={dateEnd}
        onChangeText={setDateEnd}
        placeholder="2024-01-31"
        placeholderTextColor="#666"
      />

      <Pressable style={styles.fileBtn} onPress={handlePickFile}>
        <Text style={styles.fileBtnText}>{csvText ? 'Change CSV File' : 'Select CSV File'}</Text>
      </Pressable>

      {preview && preview.length > 0 && (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Preview ({preview.length} items matched)</Text>
          {preview.slice(0, 5).map((row, i) => (
            <Text key={i} style={styles.previewRow}>{row.menuItemName} — {row.unitsSold} sold</Text>
          ))}
          {preview.length > 5 && <Text style={styles.previewMore}>+{preview.length - 5} more...</Text>}
        </View>
      )}

      {preview && preview.length === 0 && (
        <Text style={styles.warn}>No valid rows found in CSV. Check the file format.</Text>
      )}

      <Pressable
        style={[styles.uploadBtn, !canUpload && { opacity: 0.5 }]}
        onPress={handleUpload}
        disabled={!canUpload}
      >
        {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnText}>Upload & Save</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  back: { color: '#888', fontSize: 14, marginBottom: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  hint: { color: '#555', fontSize: 12, lineHeight: 18, marginBottom: 20 },
  label: { color: '#888', fontSize: 12, marginBottom: 4, marginTop: 16 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 14, fontSize: 15 },
  fileBtn: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  fileBtnText: { color: '#888', fontSize: 14 },
  preview: { backgroundColor: '#1e1e1e', borderRadius: 8, padding: 14, marginTop: 16 },
  previewTitle: { color: '#888', fontSize: 12, marginBottom: 8 },
  previewRow: { color: '#fff', fontSize: 13, marginBottom: 4 },
  previewMore: { color: '#666', fontSize: 12, marginTop: 4 },
  warn: { color: '#cc6666', fontSize: 13, marginTop: 16 },
  uploadBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  uploadBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
});
