import Papa from 'papaparse';
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
  const { supabase } = await import('./supabase');
  const { data: upload, error: uploadError } = await supabase
    .from('toast_uploads')
    .insert({ bar_id: barId, uploaded_by: userId, date_range_start: dateStart, date_range_end: dateEnd })
    .select()
    .single();
  if (uploadError) throw uploadError;

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
