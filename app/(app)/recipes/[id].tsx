import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getRecipeWithIngredients, upsertIngredients, RecipeWithIngredients, IngredientInput } from '@/lib/recipes';
import { useAppUser } from '@/lib/useAppUser';

interface EditableIngredient {
  bottleId: string | null;
  ingredientName: string;
  quantityOz: string;
  tracked: boolean;
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAppUser();
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [ingredients, setIngredients] = useState<EditableIngredient[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getRecipeWithIngredients(id).then(r => {
      if (r) {
        setRecipe(r);
        setIngredients(r.ingredients.map(i => ({
          bottleId: i.bottle_id,
          ingredientName: i.ingredient_name,
          quantityOz: String(i.quantity_oz),
          tracked: i.tracked,
        })));
      }
      setLoading(false);
    });
  }, [id]);

  function addIngredient() {
    setIngredients(prev => [...prev, { bottleId: null, ingredientName: '', quantityOz: '1', tracked: true }]);
  }

  function removeIngredient(idx: number) {
    setIngredients(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!id || !recipe) return;
    setSaving(true);
    try {
      const inputs: IngredientInput[] = ingredients
        .filter(i => i.ingredientName.trim())
        .map(i => ({
          bottleId: i.bottleId,
          ingredientName: i.ingredientName.trim(),
          quantityOz: parseFloat(i.quantityOz) || 1,
          tracked: i.tracked,
        }));
      await upsertIngredients(id, inputs);
      Alert.alert('Saved', 'Recipe updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#fff" />;
  if (!recipe) return <View style={styles.container}><Text style={styles.text}>Recipe not found.</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 60 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Recipes</Text></Pressable>
      <Text style={styles.title}>{recipe.name}</Text>
      {recipe.toast_menu_item_name && <Text style={styles.toastLink}>Toast: {recipe.toast_menu_item_name}</Text>}

      <Text style={styles.sectionTitle}>Ingredients</Text>
      <Text style={styles.hint}>Enter each spirit or ingredient. Toggle "tracked" off for non-bottle ingredients (soda, juice, garnishes) — they'll appear in the recipe but won't affect variance calculations.</Text>

      {ingredients.map((ing, idx) => (
        <View key={idx} style={styles.ingredientRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.input}
              value={ing.ingredientName}
              onChangeText={v => setIngredients(prev => prev.map((x, i) => i === idx ? { ...x, ingredientName: v } : x))}
              placeholder="Ingredient name"
              placeholderTextColor="#666"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={ing.quantityOz}
                onChangeText={v => setIngredients(prev => prev.map((x, i) => i === idx ? { ...x, quantityOz: v } : x))}
                placeholder="oz"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
              <Text style={styles.ozLabel}>oz</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.trackLabel}>Tracked</Text>
                <Switch
                  value={ing.tracked}
                  onValueChange={v => setIngredients(prev => prev.map((x, i) => i === idx ? { ...x, tracked: v } : x))}
                  trackColor={{ true: '#fff', false: '#333' }}
                  thumbColor="#000"
                />
              </View>
            </View>
          </View>
          <Pressable onPress={() => removeIngredient(idx)} style={{ paddingLeft: 12 }}>
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}

      <Pressable style={styles.addBtn} onPress={addIngredient}>
        <Text style={styles.addBtnText}>+ Add Ingredient</Text>
      </Pressable>

      <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save Recipe</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  back: { color: '#888', fontSize: 14, marginBottom: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  toastLink: { color: '#888', fontSize: 12, marginBottom: 20 },
  sectionTitle: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 6 },
  hint: { color: '#555', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, backgroundColor: '#1e1e1e', borderRadius: 8, padding: 10 },
  input: { backgroundColor: '#2a2a2a', color: '#fff', borderRadius: 6, padding: 10, fontSize: 14 },
  ozLabel: { color: '#888', fontSize: 13 },
  trackLabel: { color: '#888', fontSize: 12 },
  remove: { color: '#cc6666', fontSize: 18, lineHeight: 22 },
  addBtn: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8, marginBottom: 20 },
  addBtnText: { color: '#888', fontSize: 14 },
  saveBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  text: { color: '#fff', padding: 20 },
});
