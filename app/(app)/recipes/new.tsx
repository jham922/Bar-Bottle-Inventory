import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { createRecipe } from '@/lib/recipes';

export default function NewRecipeScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [name, setName] = useState('');
  const [toastName, setToastName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const recipe = await createRecipe(user.bar_id, name.trim(), toastName.trim() || undefined);
      router.replace(`/(app)/recipes/${recipe.id}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>New Recipe</Text>

      <Text style={styles.label}>Cocktail name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Negroni" placeholderTextColor="#666" />

      <Text style={styles.label}>Toast menu item name</Text>
      <Text style={styles.hint}>Must match exactly how it appears in Toast's product mix export.</Text>
      <TextInput style={styles.input} value={toastName} onChangeText={setToastName} placeholder="e.g. Negroni" placeholderTextColor="#666" />

      <Pressable style={[styles.btn, (!name.trim() || saving) && { opacity: 0.5 }]} onPress={handleCreate} disabled={!name.trim() || saving}>
        {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Create & Add Ingredients →</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 24, paddingTop: 60 },
  back: { color: '#888', fontSize: 14, marginBottom: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  label: { color: '#888', fontSize: 12, marginBottom: 4, marginTop: 16 },
  hint: { color: '#555', fontSize: 11, marginBottom: 6 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 14, fontSize: 15 },
  btn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 28 },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
});
