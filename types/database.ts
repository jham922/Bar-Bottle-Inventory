export type Role = 'admin' | 'staff';

export interface Bar {
  id: string;
  name: string;
  created_at: string;
}

export interface AppUser {
  id: string;
  bar_id: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export interface Bottle {
  id: string;
  bar_id: string;
  brand: string;
  spirit_type: string;
  total_volume_ml: number;
  bottle_image_ref: string | null;
  created_at: string;
}

export interface InventoryScan {
  id: string;
  bottle_id: string;
  fill_pct: number;
  volume_remaining_ml: number;
  scan_image_url: string | null;
  scanned_by: string;
  scanned_at: string;
}

export interface Alert {
  id: string;
  bottle_id: string;
  threshold_ml: number;
  triggered_at: string;
  resolved_at: string | null;
}

export interface Recipe {
  id: string;
  bar_id: string;
  name: string;
  toast_menu_item_name: string | null;
  created_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  bottle_id: string | null;
  ingredient_name: string;
  quantity_oz: number;
  tracked: boolean;
}

export interface ToastUpload {
  id: string;
  bar_id: string;
  uploaded_by: string;
  date_range_start: string;
  date_range_end: string;
  uploaded_at: string;
}

export interface ToastSale {
  id: string;
  upload_id: string;
  recipe_id: string | null;
  menu_item_name: string;
  units_sold: number;
}

export interface ActivityLog {
  id: string;
  bar_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface Invite {
  id: string;
  bar_id: string;
  email: string;
  role: Role;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
}
