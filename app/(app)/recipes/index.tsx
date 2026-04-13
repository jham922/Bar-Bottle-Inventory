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
