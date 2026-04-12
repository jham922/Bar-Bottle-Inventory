export interface SingleScanResult {
  brand: string;
  spirit_type: string;
  fill_pct: number;
  confidence: 'high' | 'medium' | 'low';
  known_bottle: boolean;
}

export interface ShelfScanResult {
  bottles: SingleScanResult[];
}

export interface PendingBottle {
  scanResult: SingleScanResult;
  imageUri: string;
}
