# Bottle Inventory App — Plan 3: Analytics

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build recipe management, Toast POS CSV upload, theoretical usage calculation, variance report, and consumption report with CSV/PDF/email export.

**Architecture:** All analytics are computed client-side from Supabase data — no additional backend needed. Toast CSV is parsed in the app using a streaming parser. Variance uses `computeActualUsage` from Plan 2's `lib/alerts.ts`. PDF export uses `expo-print`. CSV export uses the native share sheet.

**Tech Stack:** Expo, React Native, TypeScript, expo-print, expo-sharing, papaparse (CSV parser), Supabase JS client

**Prerequisite:** Plans 1 and 2 must be complete.

---

## File Structure

```
app/(app)/
  recipes/
    index.tsx              # Recipe list
    [id].tsx               # Recipe detail + edit ingredients
    new.tsx                # Create new recipe
  reports/
    index.tsx              # Report home (consumption + variance tabs)
    consumption.tsx        # Consumption report screen
    variance.tsx           # Variance report screen
  settings/
    toast-upload.tsx       # Toast CSV upload screen

lib/
  recipes.ts               # Recipe CRUD
  toast.ts                 # CSV parsing + theoretical usage
  reports.ts               # Consumption + variance queries
  export.ts                # CSV and PDF generation + sharing

__tests__/
  lib/
    recipes.test.ts
    toast.test.ts
    reports.test.ts
    export.test.ts
```

---

## Task 1: Install Dependencies

- [ ] **Step 1: Install packages**

```bash
npx expo install expo-print expo-sharing expo-document-picker
npm install papaparse
npm install --save-dev @types/papaparse
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add expo-print, expo-sharing, papaparse"
```

---

## Task 2: Recipe Helpers

**Files:**
- Create: `lib/recipes.ts`
- Create: `__tests__/lib/recipes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/recipes.test.ts`:
```ts
import { getRecipes, createRecipe, upsertIngredients, getRecipeWithIngredients } from '@/lib/recipes';

const mockRecipe = { id: 'r1', bar_id: 'bar1', name: 'Negroni', toast_menu_item_name: 'Negroni', created_at: '2026-01-01' };
const mockIngredients = [
  { id: 'i1', recipe_id: 'r1', bottle_id: 'b1', ingredient_name: "Hendrick's Gin", quantity_oz: 1, tracked: true },
  { id: 'i2', recipe_id: 'r1', bottle_id: 'b2', ingredient_name: 'Campari', quantity_oz: 1, tracked: true },
];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockImplementation((table: string) => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: table === 'recipes' ? [mockRecipe] : mockIngredients, error: null }),
      }),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    })),
  },
}));

describe('getRecipes', () => {
  it('returns list of recipes', async () => {
    const recipes = await getRecipes('bar1');
    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe('Negroni');
  });
});

describe('createRecipe', () => {
  it('creates and returns a recipe', async () => {
    const recipe = await createRecipe('bar1', 'Negroni', 'Negroni');
    expect(recipe.id).toBe('r1');
    expect(recipe.toast_menu_item_name).toBe('Negroni');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/recipes.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement recipe helpers**

Create `lib/recipes.ts`:
```ts
import { supabase } from './supabase';
import { Recipe, RecipeIngredient } from '@/types/database';

export async function getRecipes(barId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('bar_id', barId)
    .order('name');
  if (error) throw error;
  return data as Recipe[];
}

export async function createRecipe(
  barId: string,
  name: string,
  toastMenuItemName?: string
): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes')
    .insert({ bar_id: barId, name, toast_menu_item_name: toastMenuItemName ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as Recipe;
}

export async function updateRecipe(recipeId: string, updates: Partial<Pick<Recipe, 'name' | 'toast_menu_item_name'>>): Promise<void> {
  const { error } = await supabase.from('recipes').update(updates).eq('id', recipeId);
  if (error) throw error;
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
  if (error) throw error;
}

export interface IngredientInput {
  bottleId: string | null;
  ingredientName: string;
  quantityOz: number;
  tracked: boolean;
}

export async function upsertIngredients(recipeId: string, ingredients: IngredientInput[]): Promise<void> {
  // Delete all existing ingredients, then insert new set
  await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  if (ingredients.length === 0) return;
  const { error } = await supabase.from('recipe_ingredients').insert(
    ingredients.map(i => ({
      recipe_id: recipeId,
      bottle_id: i.bottleId,
      ingredient_name: i.ingredientName,
      quantity_oz: i.quantityOz,
      tracked: i.tracked,
    }))
  );
  if (error) throw error;
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredient[];
}

export async function getRecipeWithIngredients(recipeId: string): Promise<RecipeWithIngredients | null> {
  const [recipeRes, ingredientsRes] = await Promise.all([
    supabase.from('recipes').select('*').eq('id', recipeId).single(),
    supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipeId),
  ]);
  if (recipeRes.error || !recipeRes.data) return null;
  return { ...(recipeRes.data as Recipe), ingredients: (ingredientsRes.data ?? []) as RecipeIngredient[] };
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/recipes.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/recipes.ts __tests__/lib/recipes.test.ts
git commit -m "feat: recipe CRUD helpers"
```

---

## Task 3: Recipe Screens

**Files:**
- Create: `app/(app)/recipes/index.tsx`
- Create: `app/(app)/recipes/new.tsx`
- Create: `app/(app)/recipes/[id].tsx`

- [ ] **Step 1: Build recipe list screen**

Create `app/(app)/recipes/index.tsx`:
```tsx
import { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAppUser } from '@/lib/useAppUser';
import { getRecipes, deleteRecipe } from '@/lib/recipes';
import { Recipe } from '@/types/database';

export default function RecipesScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!user?.bar_id) return;
    setLoading(true);
    getRecipes(user.bar_id).then(setRecipes).finally(() => setLoading(false));
  }, [user]));

  function handleDelete(recipe: Recipe) {
    Alert.alert('Delete recipe', `Delete "${recipe.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteRecipe(recipe.id);
        setRecipes(prev => prev.filter(r => r.id !== recipe.id));
      }},
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recipes</Text>
        <Pressable style={styles.addBtn} onPress={() => router.push('/(app)/recipes/new')}>
          <Text style={styles.addBtnText}>+ New</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={recipes}
          keyExtractor={r => r.id}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/(app)/recipes/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {item.toast_menu_item_name && (
                  <Text style={styles.toast}>Toast: {item.toast_menu_item_name}</Text>
                )}
              </View>
              <Pressable onPress={() => handleDelete(item)}>
                <Text style={styles.delete}>Delete</Text>
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No recipes yet. Add your cocktails to enable variance reports.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  addBtn: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  addBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 10, padding: 14, marginBottom: 8 },
  name: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  toast: { color: '#888', fontSize: 11, marginTop: 2 },
  delete: { color: '#cc6666', fontSize: 13 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40, lineHeight: 20 },
});
```

- [ ] **Step 2: Build new recipe screen**

Create `app/(app)/recipes/new.tsx`:
```tsx
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
```

- [ ] **Step 3: Build recipe detail/edit screen**

Create `app/(app)/recipes/[id].tsx`:
```tsx
import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getRecipeWithIngredients, upsertIngredients, updateRecipe, RecipeWithIngredients, IngredientInput } from '@/lib/recipes';
import { getInventoryList } from '@/lib/inventory';
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
```

- [ ] **Step 4: Add Recipes tab to layout**

In `app/(app)/_layout.tsx`, add after reports tab:
```tsx
<Tabs.Screen
  name="recipes/index"
  options={{ title: 'Recipes', href: isAdmin ? undefined : null }}
/>
```

- [ ] **Step 5: Commit**

```bash
git add app/(app)/recipes/ app/(app)/_layout.tsx
git commit -m "feat: recipe management screens — list, create, edit ingredients"
```

---

## Task 4: Toast CSV Upload & Theoretical Usage

**Files:**
- Create: `lib/toast.ts`
- Create: `__tests__/lib/toast.test.ts`
- Create: `app/(app)/settings/toast-upload.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/toast.test.ts`:
```ts
import { parseToastCsv, computeTheoreticalUsage } from '@/lib/toast';

const sampleCsv = `Menu Item,Quantity Sold
Negroni,47
Old Fashioned,62
Aperol Spritz,38
`;

const recipes = [
  {
    id: 'r1', name: 'Negroni', toast_menu_item_name: 'Negroni',
    ingredients: [
      { bottle_id: 'b-gin', ingredient_name: "Hendrick's Gin", quantity_oz: 1, tracked: true },
      { bottle_id: 'b-campari', ingredient_name: 'Campari', quantity_oz: 1, tracked: true },
      { bottle_id: null, ingredient_name: 'Sweet Vermouth', quantity_oz: 1, tracked: false },
    ],
  },
  {
    id: 'r2', name: 'Old Fashioned', toast_menu_item_name: 'Old Fashioned',
    ingredients: [
      { bottle_id: 'b-bourbon', ingredient_name: 'Bulleit Bourbon', quantity_oz: 2, tracked: true },
    ],
  },
];

describe('parseToastCsv', () => {
  it('extracts menu item names and quantities', () => {
    const sales = parseToastCsv(sampleCsv);
    expect(sales).toHaveLength(3);
    const negroni = sales.find(s => s.menuItemName === 'Negroni');
    expect(negroni?.unitsSold).toBe(47);
  });
});

describe('computeTheoreticalUsage', () => {
  it('calculates ml per bottle_id from sales × recipe oz', () => {
    const sales = [
      { menuItemName: 'Negroni', unitsSold: 47 },
      { menuItemName: 'Old Fashioned', unitsSold: 62 },
    ];
    const usage = computeTheoreticalUsage(sales, recipes as any);

    // Gin: 47 × 1oz × 29.5735 = 1389.95ml ≈ 1390
    expect(usage['b-gin']).toBeCloseTo(47 * 1 * 29.5735, 0);
    // Bourbon: 62 × 2oz × 29.5735 = 3667.1ml
    expect(usage['b-bourbon']).toBeCloseTo(62 * 2 * 29.5735, 0);
    // Vermouth is not tracked — should not appear
    expect(usage['b-vermouth']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/toast.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement Toast helpers**

Create `lib/toast.ts`:
```ts
import Papa from 'papaparse';
import { supabase } from './supabase';
import { RecipeWithIngredients } from './recipes';

export interface ToastSaleRow {
  menuItemName: string;
  unitsSold: number;
}

export function parseToastCsv(csvText: string): ToastSaleRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });

  return result.data
    .map(row => {
      // Toast CSV columns: "Menu Item" and "Quantity Sold" (exact names may vary — try common variants)
      const name = row['Menu Item'] ?? row['Item'] ?? row['menu_item'] ?? '';
      const qty = parseInt(row['Quantity Sold'] ?? row['Qty Sold'] ?? row['quantity_sold'] ?? '0', 10);
      return { menuItemName: name.trim(), unitsSold: qty };
    })
    .filter(r => r.menuItemName && r.unitsSold > 0);
}

// Returns { [bottle_id]: theoretical_ml_used }
export function computeTheoreticalUsage(
  sales: ToastSaleRow[],
  recipes: RecipeWithIngredients[]
): Record<string, number> {
  const usageByBottleId: Record<string, number> = {};
  const OZ_TO_ML = 29.5735;

  for (const sale of sales) {
    const recipe = recipes.find(
      r => r.toast_menu_item_name?.toLowerCase() === sale.menuItemName.toLowerCase()
    );
    if (!recipe) continue;

    for (const ingredient of recipe.ingredients) {
      if (!ingredient.tracked || !ingredient.bottle_id) continue;
      const mlUsed = sale.unitsSold * ingredient.quantity_oz * OZ_TO_ML;
      usageByBottleId[ingredient.bottle_id] = (usageByBottleId[ingredient.bottle_id] ?? 0) + mlUsed;
    }
  }

  return usageByBottleId;
}

export async function saveToastUpload(
  barId: string,
  userId: string,
  dateStart: string,
  dateEnd: string,
  sales: ToastSaleRow[],
  recipes: RecipeWithIngredients[]
): Promise<string> {
  // Save upload record
  const { data: upload, error: uploadError } = await supabase
    .from('toast_uploads')
    .insert({ bar_id: barId, uploaded_by: userId, date_range_start: dateStart, date_range_end: dateEnd })
    .select()
    .single();
  if (uploadError) throw uploadError;

  // Save individual sales rows
  const salesRows = sales.map(s => {
    const recipe = recipes.find(r => r.toast_menu_item_name?.toLowerCase() === s.menuItemName.toLowerCase());
    return {
      upload_id: upload.id,
      recipe_id: recipe?.id ?? null,
      menu_item_name: s.menuItemName,
      units_sold: s.unitsSold,
    };
  });

  if (salesRows.length > 0) {
    const { error } = await supabase.from('toast_sales').insert(salesRows);
    if (error) throw error;
  }

  return upload.id;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/toast.test.ts
```
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Build Toast upload screen**

Create `app/(app)/settings/toast-upload.tsx`:
```tsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAppUser } from '@/lib/useAppUser';
import { parseToastCsv, saveToastUpload, ToastSaleRow } from '@/lib/toast';
import { getRecipes, getRecipeWithIngredients, RecipeWithIngredients } from '@/lib/recipes';
import { logActivity } from '@/lib/auth';

export default function ToastUploadScreen() {
  const user = useAppUser();
  const [csvRows, setCsvRows] = useState<ToastSaleRow[]>([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState(false);

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const rows = parseToastCsv(text);
      if (rows.length === 0) {
        Alert.alert('No data found', 'Could not parse any menu items from this file. Check that it is a Toast product mix CSV export.');
        return;
      }
      setCsvRows(rows);
      setParsed(true);
    } catch (e: any) {
      Alert.alert('Error reading file', e.message);
    }
  }

  async function handleSave() {
    if (!user || !dateStart || !dateEnd || csvRows.length === 0) return;
    setSaving(true);
    try {
      const recipeList = await getRecipes(user.bar_id);
      const recipes: RecipeWithIngredients[] = await Promise.all(
        recipeList.map(r => getRecipeWithIngredients(r.id).then(rw => rw!))
      );
      const uploadId = await saveToastUpload(user.bar_id, user.id, dateStart, dateEnd, csvRows, recipes);
      await logActivity(user.bar_id, user.id, `Uploaded Toast product mix (${dateStart} to ${dateEnd})`, 'toast_upload', uploadId);
      Alert.alert('Upload saved', `${csvRows.length} menu items saved. Go to Reports → Variance to see the analysis.`);
      setCsvRows([]);
      setParsed(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 60 }}>
      <Text style={styles.title}>Toast Product Mix Upload</Text>
      <Text style={styles.hint}>
        In Toast: Reports → Product Mix → export as CSV. Then upload it here.
      </Text>

      <Pressable style={styles.uploadArea} onPress={pickFile}>
        <Text style={styles.uploadIcon}>📂</Text>
        <Text style={styles.uploadText}>{parsed ? `${csvRows.length} items loaded` : 'Tap to choose Toast CSV file'}</Text>
      </Pressable>

      {parsed && (
        <>
          <View style={styles.preview}>
            {csvRows.slice(0, 5).map((r, i) => (
              <View key={i} style={styles.previewRow}>
                <Text style={styles.previewName}>{r.menuItemName}</Text>
                <Text style={styles.previewQty}>{r.unitsSold} sold</Text>
              </View>
            ))}
            {csvRows.length > 5 && <Text style={styles.more}>+ {csvRows.length - 5} more</Text>}
          </View>

          <Text style={styles.label}>Date range start (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={dateStart} onChangeText={setDateStart} placeholder="2026-04-01" placeholderTextColor="#666" />

          <Text style={styles.label}>Date range end (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={dateEnd} onChangeText={setDateEnd} placeholder="2026-04-07" placeholderTextColor="#666" />

          <Pressable
            style={[styles.btn, (!dateStart || !dateEnd || saving) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={!dateStart || !dateEnd || saving}
          >
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Save Upload</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  hint: { color: '#888', fontSize: 13, lineHeight: 20, marginBottom: 24 },
  uploadArea: { borderWidth: 2, borderColor: '#333', borderStyle: 'dashed', borderRadius: 10, padding: 32, alignItems: 'center', marginBottom: 20 },
  uploadIcon: { fontSize: 32, marginBottom: 8 },
  uploadText: { color: '#aaa', fontSize: 14 },
  preview: { backgroundColor: '#1e1e1e', borderRadius: 8, padding: 12, marginBottom: 20 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  previewName: { color: '#ddd', fontSize: 13 },
  previewQty: { color: '#888', fontSize: 13 },
  more: { color: '#666', fontSize: 12, marginTop: 6, textAlign: 'center' },
  label: { color: '#888', fontSize: 12, marginBottom: 4, marginTop: 14 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 14, fontSize: 15 },
  btn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
});
```

Add Toast Upload link to settings screen — in `app/(app)/settings/index.tsx`, add a row after Team Management:
```tsx
<Pressable style={styles.row} onPress={() => router.push('/(app)/settings/toast-upload')}>
  <Text style={styles.rowText}>Toast Product Mix Upload</Text>
</Pressable>
```

- [ ] **Step 6: Commit**

```bash
git add lib/toast.ts __tests__/lib/toast.test.ts app/(app)/settings/toast-upload.tsx app/(app)/settings/index.tsx
git commit -m "feat: Toast CSV upload and theoretical usage calculation"
```

---

## Task 5: Report Helpers (Consumption + Variance)

**Files:**
- Create: `lib/reports.ts`
- Create: `__tests__/lib/reports.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/reports.test.ts`:
```ts
import { getConsumptionReport, getVarianceReport } from '@/lib/reports';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'inventory_scans') {
        return {
          select: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              lte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: [
                    { bottle_id: 'b1', volume_remaining_ml: 750, scanned_at: '2026-04-01T10:00:00Z', bottles: { brand: 'Bulleit', spirit_type: 'Bourbon', bar_id: 'bar1' } },
                    { bottle_id: 'b1', volume_remaining_ml: 413, scanned_at: '2026-04-07T10:00:00Z', bottles: { brand: 'Bulleit', spirit_type: 'Bourbon', bar_id: 'bar1' } },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [], error: null }) }) }) };
    }),
  },
}));

describe('getConsumptionReport', () => {
  it('calculates ml consumed per bottle', async () => {
    const report = await getConsumptionReport('bar1', '2026-04-01', '2026-04-07');
    expect(report).toHaveLength(1);
    expect(report[0].brand).toBe('Bulleit');
    expect(report[0].consumed_ml).toBe(337); // 750 - 413
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/reports.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement report helpers**

Create `lib/reports.ts`:
```ts
import { supabase } from './supabase';
import { computeActualUsage } from './alerts';
import { computeTheoreticalUsage, ToastSaleRow } from './toast';
import { RecipeWithIngredients } from './recipes';

export interface ConsumptionReportItem {
  bottle_id: string;
  brand: string;
  spirit_type: string;
  consumed_ml: number;
}

export async function getConsumptionReport(
  barId: string,
  dateStart: string,
  dateEnd: string
): Promise<ConsumptionReportItem[]> {
  const { data, error } = await supabase
    .from('inventory_scans')
    .select('bottle_id, volume_remaining_ml, scanned_at, bottles!inner(brand, spirit_type, bar_id)')
    .gte('scanned_at', `${dateStart}T00:00:00Z`)
    .lte('scanned_at', `${dateEnd}T23:59:59Z`)
    .order('scanned_at', { ascending: true });
  if (error) throw error;

  // Group scans by bottle_id, filter to this bar
  const byBottle: Record<string, { brand: string; spirit_type: string; scans: { volume_remaining_ml: number; scanned_at: string }[] }> = {};

  for (const row of (data as any[])) {
    if (row.bottles.bar_id !== barId) continue;
    if (!byBottle[row.bottle_id]) {
      byBottle[row.bottle_id] = { brand: row.bottles.brand, spirit_type: row.bottles.spirit_type, scans: [] };
    }
    byBottle[row.bottle_id].scans.push({ volume_remaining_ml: row.volume_remaining_ml, scanned_at: row.scanned_at });
  }

  return Object.entries(byBottle)
    .map(([bottle_id, { brand, spirit_type, scans }]) => ({
      bottle_id,
      brand,
      spirit_type,
      consumed_ml: computeActualUsage(scans),
    }))
    .filter(r => r.consumed_ml > 0)
    .sort((a, b) => b.consumed_ml - a.consumed_ml);
}

export interface VarianceReportItem {
  bottle_id: string;
  brand: string;
  theoretical_ml: number;
  actual_ml: number;
  diff_ml: number;
  variance_pct: number;
  flagged: boolean;
}

export async function getVarianceReport(
  barId: string,
  dateStart: string,
  dateEnd: string,
  toastSales: ToastSaleRow[],
  recipes: RecipeWithIngredients[],
  flagThresholdPct: number = 10
): Promise<VarianceReportItem[]> {
  const theoretical = computeTheoreticalUsage(toastSales, recipes);
  const consumption = await getConsumptionReport(barId, dateStart, dateEnd);

  const actualByBottleId: Record<string, { brand: string; consumed_ml: number }> = {};
  for (const c of consumption) {
    actualByBottleId[c.bottle_id] = { brand: c.brand, consumed_ml: c.consumed_ml };
  }

  const allBottleIds = new Set([...Object.keys(theoretical), ...Object.keys(actualByBottleId)]);

  const results: VarianceReportItem[] = [];
  for (const bottleId of allBottleIds) {
    const theoreticalMl = theoretical[bottleId] ?? 0;
    const actualMl = actualByBottleId[bottleId]?.consumed_ml ?? 0;
    const brand = actualByBottleId[bottleId]?.brand ?? bottleId;
    if (theoreticalMl === 0 && actualMl === 0) continue;

    const diffMl = actualMl - theoreticalMl;
    const variancePct = theoreticalMl > 0 ? Math.abs(diffMl / theoreticalMl) * 100 : 100;
    results.push({
      bottle_id: bottleId,
      brand,
      theoretical_ml: Math.round(theoreticalMl),
      actual_ml: Math.round(actualMl),
      diff_ml: Math.round(diffMl),
      variance_pct: Math.round(variancePct * 10) / 10,
      flagged: variancePct > flagThresholdPct,
    });
  }

  return results.sort((a, b) => b.variance_pct - a.variance_pct);
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/reports.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reports.ts __tests__/lib/reports.test.ts
git commit -m "feat: consumption and variance report calculation"
```

---

## Task 6: Export Helpers

**Files:**
- Create: `lib/export.ts`
- Create: `__tests__/lib/export.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/export.test.ts`:
```ts
import { buildInventoryCsv, buildConsumptionCsv, buildVarianceCsv } from '@/lib/export';

describe('buildInventoryCsv', () => {
  it('produces correct CSV headers and rows', () => {
    const items = [{ brand: 'Bulleit', spirit_type: 'Bourbon', total_volume_ml: 750, fill_pct: 55, volume_remaining_ml: 413, scanned_at: '2026-04-09' }];
    const csv = buildInventoryCsv(items as any);
    expect(csv).toContain('Brand,Spirit Type,Bottle Size (ml),Fill %,Remaining (ml),Last Scanned');
    expect(csv).toContain('Bulleit,Bourbon,750,55,413');
  });
});

describe('buildVarianceCsv', () => {
  it('includes flagged column', () => {
    const items = [{ brand: 'Campari', theoretical_ml: 1390, actual_ml: 1640, diff_ml: 250, variance_pct: 18, flagged: true }];
    const csv = buildVarianceCsv(items as any, '2026-04-01', '2026-04-07');
    expect(csv).toContain('Flagged');
    expect(csv).toContain('YES');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/export.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement export helpers**

Create `lib/export.ts`:
```ts
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { InventoryListItem } from './inventory';
import { ConsumptionReportItem, VarianceReportItem } from './reports';

export function buildInventoryCsv(items: InventoryListItem[]): string {
  const header = 'Brand,Spirit Type,Bottle Size (ml),Fill %,Remaining (ml),Last Scanned';
  const rows = items.map(i =>
    [i.brand, i.spirit_type, i.total_volume_ml, i.fill_pct ?? '', i.volume_remaining_ml ?? '', i.scanned_at ? new Date(i.scanned_at).toLocaleDateString() : ''].join(',')
  );
  return [header, ...rows].join('\n');
}

export function buildConsumptionCsv(items: ConsumptionReportItem[], dateStart: string, dateEnd: string): string {
  const header = `Consumption Report: ${dateStart} to ${dateEnd}\nBrand,Spirit Type,Consumed (ml),Consumed (oz)`;
  const OZ = 29.5735;
  const rows = items.map(i =>
    [i.brand, i.spirit_type, i.consumed_ml, (i.consumed_ml / OZ).toFixed(1)].join(',')
  );
  return [header, ...rows].join('\n');
}

export function buildVarianceCsv(items: VarianceReportItem[], dateStart: string, dateEnd: string): string {
  const header = `Variance Report: ${dateStart} to ${dateEnd}\nBrand,Theoretical (ml),Actual (ml),Difference (ml),Variance %,Flagged`;
  const rows = items.map(i =>
    [i.brand, i.theoretical_ml, i.actual_ml, i.diff_ml, `${i.variance_pct}%`, i.flagged ? 'YES' : 'no'].join(',')
  );
  return [header, ...rows].join('\n');
}

export async function shareCsv(csvContent: string, filename: string): Promise<void> {
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: filename });
}

export async function printReport(htmlContent: string): Promise<void> {
  await Print.printAsync({ html: htmlContent });
}

export function buildVarianceHtml(items: VarianceReportItem[], dateStart: string, dateEnd: string): string {
  const rows = items.map(i => `
    <tr style="${i.flagged ? 'background:#fff0f0' : ''}">
      <td>${i.brand}</td>
      <td>${i.theoretical_ml}ml</td>
      <td>${i.actual_ml}ml</td>
      <td>${i.diff_ml > 0 ? '+' : ''}${i.diff_ml}ml</td>
      <td>${i.variance_pct}%</td>
      <td>${i.flagged ? '⚠️ Review' : '✓'}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html><html><head>
    <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th{background:#333;color:#fff;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #eee}h1{font-size:18px}</style>
    </head><body>
    <h1>Variance Report: ${dateStart} to ${dateEnd}</h1>
    <table><tr><th>Brand</th><th>Theoretical</th><th>Actual</th><th>Difference</th><th>Variance</th><th>Status</th></tr>
    ${rows}
    </table>
    </body></html>
  `;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/export.test.ts
```
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts __tests__/lib/export.test.ts
git commit -m "feat: CSV and PDF export helpers"
```

---

## Task 7: Report Screens

**Files:**
- Create: `app/(app)/reports/index.tsx`
- Create: `app/(app)/reports/consumption.tsx`
- Create: `app/(app)/reports/variance.tsx`

- [ ] **Step 1: Build report home**

Create `app/(app)/reports/index.tsx`:
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function ReportsScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reports</Text>
      <Pressable style={styles.card} onPress={() => router.push('/(app)/reports/consumption')}>
        <Text style={styles.icon}>📊</Text>
        <Text style={styles.cardTitle}>Consumption Report</Text>
        <Text style={styles.cardSub}>See how much of each spirit was used over a time period</Text>
      </Pressable>
      <Pressable style={[styles.card, styles.cardDark]} onPress={() => router.push('/(app)/reports/variance')}>
        <Text style={styles.icon}>⚖️</Text>
        <Text style={[styles.cardTitle, { color: '#fff' }]}>Variance Report</Text>
        <Text style={[styles.cardSub, { color: '#888' }]}>Compare theoretical vs actual usage using Toast sales data</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 24, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 14 },
  cardDark: { backgroundColor: '#1e1e1e' },
  icon: { fontSize: 28, marginBottom: 8 },
  cardTitle: { color: '#000', fontWeight: 'bold', fontSize: 18, marginBottom: 4 },
  cardSub: { color: '#555', fontSize: 13, lineHeight: 18 },
});
```

- [ ] **Step 2: Build consumption report screen**

Create `app/(app)/reports/consumption.tsx`:
```tsx
import { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getConsumptionReport, ConsumptionReportItem } from '@/lib/reports';
import { buildConsumptionCsv, shareCsv } from '@/lib/export';

const DATE_RANGES = [
  { label: 'This week', days: 7 },
  { label: 'This month', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

function getDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(start), end: fmt(end) };
}

export default function ConsumptionReportScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [selectedDays, setSelectedDays] = useState(7);
  const [items, setItems] = useState<ConsumptionReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load(days: number) {
    if (!user?.bar_id) return;
    setSelectedDays(days);
    setLoading(true);
    const { start, end } = getDateRange(days);
    try {
      const data = await getConsumptionReport(user.bar_id, start, end);
      setItems(data);
      setLoaded(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    const { start, end } = getDateRange(selectedDays);
    const csv = buildConsumptionCsv(items, start, end);
    await shareCsv(csv, `consumption-${start}-to-${end}.csv`);
  }

  const maxConsumed = items[0]?.consumed_ml ?? 1;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← Reports</Text></Pressable>
        <Text style={styles.title}>Consumption</Text>
      </View>

      <View style={styles.tabs}>
        {DATE_RANGES.map(r => (
          <Pressable
            key={r.days}
            style={[styles.tab, selectedDays === r.days && styles.tabActive]}
            onPress={() => load(r.days)}
          >
            <Text style={[styles.tabText, selectedDays === r.days && styles.tabTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading && <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />}

      {!loading && loaded && (
        <FlatList
          data={items}
          keyExtractor={i => i.bottle_id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.empty}>No consumption data for this period.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.brand}>{item.brand}</Text>
                  <Text style={styles.consumed}>{item.consumed_ml}ml</Text>
                </View>
                <Text style={styles.type}>{item.spirit_type}</Text>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${(item.consumed_ml / maxConsumed) * 100}%` as any }]} />
                </View>
              </View>
            </View>
          )}
        />
      )}

      {!loading && loaded && items.length > 0 && (
        <View style={styles.exportBar}>
          <Pressable style={styles.exportBtn} onPress={handleExport}>
            <Text style={styles.exportBtnText}>📥 Export CSV</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { padding: 20, paddingTop: 60 },
  back: { color: '#888', fontSize: 14, marginBottom: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  tab: { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 8, padding: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: '#888', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#000' },
  row: { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 14, marginBottom: 8 },
  brand: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  consumed: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  type: { color: '#666', fontSize: 11, marginBottom: 8 },
  barBg: { height: 4, backgroundColor: '#333', borderRadius: 2 },
  barFill: { height: '100%', backgroundColor: '#fff', opacity: 0.6, borderRadius: 2 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  exportBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#111', borderTopWidth: 1, borderTopColor: '#222' },
  exportBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  exportBtnText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
});
```

- [ ] **Step 3: Build variance report screen**

Create `app/(app)/reports/variance.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { getVarianceReport, VarianceReportItem } from '@/lib/reports';
import { getRecipes, getRecipeWithIngredients, RecipeWithIngredients } from '@/lib/recipes';
import { buildVarianceCsv, shareCsv, printReport, buildVarianceHtml } from '@/lib/export';
import { supabase } from '@/lib/supabase';
import { ToastSaleRow } from '@/lib/toast';

export default function VarianceReportScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [items, setItems] = useState<VarianceReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [latestUpload, setLatestUpload] = useState<{ date_range_start: string; date_range_end: string; id: string } | null>(null);

  useEffect(() => {
    if (!user?.bar_id) return;
    // Load the most recent Toast upload
    supabase
      .from('toast_uploads')
      .select('id, date_range_start, date_range_end')
      .eq('bar_id', user.bar_id)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { if (data) setLatestUpload(data as any); });
  }, [user]);

  async function loadVariance() {
    if (!user?.bar_id || !latestUpload) return;
    setLoading(true);
    try {
      // Get sales for this upload
      const { data: salesData } = await supabase
        .from('toast_sales')
        .select('menu_item_name, units_sold')
        .eq('upload_id', latestUpload.id);

      const toastSales: ToastSaleRow[] = (salesData ?? []).map((s: any) => ({
        menuItemName: s.menu_item_name,
        unitsSold: s.units_sold,
      }));

      const recipeList = await getRecipes(user.bar_id);
      const recipes: RecipeWithIngredients[] = await Promise.all(
        recipeList.map(r => getRecipeWithIngredients(r.id).then(rw => rw!))
      );

      const report = await getVarianceReport(
        user.bar_id,
        latestUpload.date_range_start,
        latestUpload.date_range_end,
        toastSales,
        recipes
      );
      setItems(report);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCsvExport() {
    if (!latestUpload) return;
    const csv = buildVarianceCsv(items, latestUpload.date_range_start, latestUpload.date_range_end);
    await shareCsv(csv, `variance-${latestUpload.date_range_start}-to-${latestUpload.date_range_end}.csv`);
  }

  async function handlePdfExport() {
    if (!latestUpload) return;
    const html = buildVarianceHtml(items, latestUpload.date_range_start, latestUpload.date_range_end);
    await printReport(html);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← Reports</Text></Pressable>
        <Text style={styles.title}>Variance Report</Text>
        {latestUpload && (
          <Text style={styles.sub}>{latestUpload.date_range_start} to {latestUpload.date_range_end}</Text>
        )}
      </View>

      {!latestUpload && (
        <View style={styles.noData}>
          <Text style={styles.noDataText}>No Toast upload found.</Text>
          <Text style={styles.noDataSub}>Go to Settings → Toast Product Mix Upload to add sales data.</Text>
          <Pressable style={styles.uploadBtn} onPress={() => router.push('/(app)/settings/toast-upload')}>
            <Text style={styles.uploadBtnText}>Go to Upload</Text>
          </Pressable>
        </View>
      )}

      {latestUpload && items.length === 0 && !loading && (
        <View style={styles.noData}>
          <Pressable style={styles.loadBtn} onPress={loadVariance}>
            <Text style={styles.loadBtnText}>Generate Variance Report</Text>
          </Pressable>
        </View>
      )}

      {loading && <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />}

      {!loading && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={i => i.bottle_id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <View style={[styles.row, item.flagged && styles.rowFlagged]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.brand}>{item.brand}</Text>
                <View style={[styles.badge, item.flagged && styles.badgeFlagged]}>
                  <Text style={[styles.badgeText, item.flagged && styles.badgeTextFlagged]}>
                    {item.flagged ? `⚠️ ${item.variance_pct}%` : `${item.variance_pct}%`}
                  </Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Theoretical</Text>
                  <Text style={styles.statValue}>{item.theoretical_ml}ml</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Actual</Text>
                  <Text style={styles.statValue}>{item.actual_ml}ml</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Diff</Text>
                  <Text style={styles.statValue}>{item.diff_ml > 0 ? '+' : ''}{item.diff_ml}ml</Text>
                </View>
              </View>
              {item.flagged && (
                <Text style={styles.flagNote}>Possible over-pouring or spillage — review</Text>
              )}
            </View>
          )}
        />
      )}

      {!loading && items.length > 0 && (
        <View style={styles.exportBar}>
          <Pressable style={[styles.exportBtn, { flex: 1 }]} onPress={handleCsvExport}>
            <Text style={styles.exportBtnText}>📥 CSV</Text>
          </Pressable>
          <Pressable style={[styles.exportBtn, styles.exportBtnSecondary, { flex: 1 }]} onPress={handlePdfExport}>
            <Text style={[styles.exportBtnText, { color: '#fff' }]}>📄 PDF</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { padding: 20, paddingTop: 60 },
  back: { color: '#888', fontSize: 14, marginBottom: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  sub: { color: '#888', fontSize: 13, marginTop: 2 },
  noData: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  noDataText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  noDataSub: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  uploadBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 12, paddingHorizontal: 24 },
  uploadBtnText: { color: '#000', fontWeight: 'bold' },
  loadBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, paddingHorizontal: 32 },
  loadBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  row: { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 14, marginBottom: 8 },
  rowFlagged: { backgroundColor: '#2a1a1a', borderWidth: 1, borderColor: '#3a2020' },
  brand: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  badge: { backgroundColor: '#1a2a1a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeFlagged: { backgroundColor: '#2a1010' },
  badgeText: { color: '#88cc88', fontSize: 11, fontWeight: 'bold' },
  badgeTextFlagged: { color: '#cc8888' },
  statsRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: '#fff', fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  flagNote: { color: '#cc8888', fontSize: 11, marginTop: 8 },
  exportBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#111', borderTopWidth: 1, borderTopColor: '#222' },
  exportBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 12, alignItems: 'center' },
  exportBtnSecondary: { backgroundColor: '#1e1e1e' },
  exportBtnText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
});
```

- [ ] **Step 4: Commit**

```bash
git add app/(app)/reports/
git commit -m "feat: consumption and variance report screens with export"
```

---

## Task 8: Final Test Pass & Push

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: all tests pass. Fix any failures before proceeding.

- [ ] **Step 2: Run on device/simulator**

```bash
npx expo start
```
Verify end-to-end:
1. Sign in as admin
2. Create a recipe (Negroni) with ingredients
3. Do a single bottle scan — confirm AI returns brand + fill %
4. Do a shelf scan — confirm multiple bottles detected
5. Check inventory list — bottles appear with fill bars
6. Tap a bottle — scan history appears, set alert threshold
7. Check Alerts screen — low-stock bottles listed
8. Upload a Toast CSV — preview appears, save upload
9. Go to Reports → Variance → confirm theoretical vs actual shown
10. Export variance as CSV and PDF

- [ ] **Step 3: Commit and push**

```bash
git add .
git commit -m "feat: complete Plan 3 — recipes, Toast upload, variance, consumption reports"
git push
```

---

## Plan 3 Complete

The app now has full functionality:
- Recipe management with tracked/untracked ingredients
- Toast POS CSV upload with automatic recipe matching
- Theoretical usage computation (sales × recipe oz per spirit)
- Variance report (theoretical vs actual, with flagging at >10%)
- Consumption report with date range selection
- CSV and PDF export for all reports
