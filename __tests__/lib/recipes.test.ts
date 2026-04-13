import { getRecipes, createRecipe } from '@/lib/recipes';

const mockRecipe = { id: 'r1', bar_id: 'bar1', name: 'Negroni', toast_menu_item_name: 'Negroni', created_at: '2026-01-01' };
const mockIngredients = [
  { id: 'i1', recipe_id: 'r1', bottle_id: 'b1', ingredient_name: "Hendrick's Gin", quantity_oz: 1, tracked: true },
  { id: 'i2', recipe_id: 'r1', bottle_id: 'b2', ingredient_name: 'Campari', quantity_oz: 1, tracked: true },
];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockImplementation((table: string) => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: table === 'recipes' ? [mockRecipe] : mockIngredients, error: null }),
        }),
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
