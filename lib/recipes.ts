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
