# Bottle Inventory App — Plan 2: Scanning & Inventory

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full camera scanning pipeline (single bottle + shelf scan), integrate Claude Vision API via a Supabase Edge Function, build the bottle catalog, inventory list with search/filter, bottle history view, and low-stock alerts with an order list.

**Architecture:** Camera capture in Expo → image uploaded to Supabase Storage → Edge Function calls Claude Vision API → results returned to client → user confirms → saved to `inventory_scans`. RLS from Plan 1 enforces access. The Edge Function is the only place the Anthropic API key lives — never in the client.

**Tech Stack:** Expo Camera, Expo Image Picker, Supabase Edge Functions (Deno), Anthropic API (claude-opus-4-6 vision), Supabase Storage, React Native, TypeScript

**Prerequisite:** Plan 1 must be complete (auth, schema, RLS all in place).

---

## File Structure

```
app/(app)/
  scan/
    index.tsx              # Scan mode selector (single vs shelf)
    single.tsx             # Single bottle camera + confirm flow
    shelf.tsx              # Shelf scan camera + bulk review
    new-bottle.tsx         # Prompt for unknown bottle name + size
  inventory/
    index.tsx              # Inventory list (search, filter)
    [id].tsx               # Bottle detail — scan history chart
  alerts/
    index.tsx              # Low-stock alerts + order list

lib/
  scan.ts                  # Upload image, call edge function, parse result
  bottles.ts               # Bottle catalog CRUD
  inventory.ts             # Inventory queries (list, history, stats)
  alerts.ts                # Alert queries, order list

types/
  scan.ts                  # ScanResult, ShelfScanResult types

supabase/
  functions/
    analyze-bottle/
      index.ts             # Edge Function: calls Claude Vision, returns result

__tests__/
  lib/
    scan.test.ts
    bottles.test.ts
    inventory.test.ts
    alerts.test.ts
```

---

## Task 1: Supabase Edge Function — Claude Vision Integration

**Files:**
- Create: `supabase/functions/analyze-bottle/index.ts`

- [ ] **Step 1: Create the Edge Function**

```bash
npx supabase functions new analyze-bottle
```

- [ ] **Step 2: Write the function**

Replace `supabase/functions/analyze-bottle/index.ts`:
```ts
import Anthropic from 'npm:@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const SINGLE_PROMPT = `You are analyzing a photo of a single liquor bottle for bar inventory purposes.

Return ONLY a JSON object with these exact fields:
{
  "brand": "Brand name (e.g. Bulleit, Hendrick's, Ketel One)",
  "spirit_type": "Category (e.g. Bourbon, Gin, Vodka, Rum, Tequila, Scotch, Liqueur, Bitters)",
  "fill_pct": 65,
  "confidence": "high|medium|low",
  "known_bottle": true
}

fill_pct is an integer 0-100 estimating how full the bottle is based on the liquid level visible.
Set known_bottle to false if you cannot confidently identify the brand.
Return only the JSON, no other text.`;

const SHELF_PROMPT = `You are analyzing a photo of a bar shelf with multiple liquor bottles for inventory purposes.

Return ONLY a JSON array. Each element represents one bottle you can see:
[
  {
    "brand": "Brand name",
    "spirit_type": "Category",
    "fill_pct": 65,
    "confidence": "high|medium|low",
    "known_bottle": true
  }
]

fill_pct is an integer 0-100 estimating how full each bottle is.
Set known_bottle to false if you cannot confidently identify a brand.
Only include bottles you can clearly see. Return only the JSON array, no other text.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }

  const { imageBase64, mode } = await req.json() as { imageBase64: string; mode: 'single' | 'shelf' };
  const prompt = mode === 'shelf' ? SHELF_PROMPT : SINGLE_PROMPT;

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const text = (message.content[0] as { type: 'text'; text: string }).text.trim();

  try {
    const result = JSON.parse(text);
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Failed to parse AI response', raw: text }), {
      status: 422,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
```

- [ ] **Step 3: Set the Anthropic API key secret**

```bash
npx supabase secrets set ANTHROPIC_API_KEY=your-anthropic-api-key
```

Get your key from https://console.anthropic.com → API Keys.

- [ ] **Step 4: Deploy the function**

```bash
npx supabase functions deploy analyze-bottle --no-verify-jwt
```
Expected: `Deployed analyze-bottle`.

- [ ] **Step 5: Test the function manually**

```bash
curl -X POST https://your-project.supabase.co/functions/v1/analyze-bottle \
  -H "Content-Type: application/json" \
  -d '{"mode":"single","imageBase64":"<base64-encoded-jpeg>"}'
```
Expected: JSON with `ok: true` and `result` containing brand, spirit_type, fill_pct.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/
git commit -m "feat: Claude Vision edge function for bottle analysis"
```

---

## Task 2: Scan Types + Client-Side Scan Helpers

**Files:**
- Create: `types/scan.ts`
- Create: `lib/scan.ts`
- Create: `__tests__/lib/scan.test.ts`

- [ ] **Step 1: Define scan types**

Create `types/scan.ts`:
```ts
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
```

- [ ] **Step 2: Write failing tests**

Create `__tests__/lib/scan.test.ts`:
```ts
import { analyzeBottleImage } from '@/lib/scan';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('analyzeBottleImage — single mode', () => {
  it('returns parsed scan result', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        result: { brand: 'Bulleit', spirit_type: 'Bourbon', fill_pct: 55, confidence: 'high', known_bottle: true },
      }),
    });

    const result = await analyzeBottleImage('base64data==', 'single');
    expect(result.brand).toBe('Bulleit');
    expect(result.fill_pct).toBe(55);
    expect(result.known_bottle).toBe(true);
  });

  it('throws when ok is false', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: false, error: 'Failed to parse' }),
    });
    await expect(analyzeBottleImage('bad', 'single')).rejects.toThrow('Failed to parse');
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

```bash
npm test -- __tests__/lib/scan.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Implement scan helpers**

Create `lib/scan.ts`:
```ts
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { SingleScanResult, ShelfScanResult } from '@/types/scan';

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/analyze-bottle`;

export async function imageUriToBase64(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return base64;
}

export async function analyzeBottleImage(imageBase64: string, mode: 'single' | 'shelf'): Promise<SingleScanResult | SingleScanResult[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ imageBase64, mode }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'Analysis failed');
  return json.result;
}

export async function uploadScanImage(uri: string, barId: string): Promise<string> {
  const base64 = await imageUriToBase64(uri);
  const filename = `${barId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('scan-images')
    .upload(filename, decode(base64), { contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from('scan-images').getPublicUrl(filename);
  return data.publicUrl;
}

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function mlToOz(ml: number): number {
  return Math.round((ml / 29.5735) * 10) / 10;
}

export function computeVolumeRemaining(fillPct: number, totalVolumeMl: number): number {
  return Math.round((fillPct / 100) * totalVolumeMl);
}
```

Install expo-file-system:
```bash
npx expo install expo-file-system
```

Create the `scan-images` storage bucket in Supabase dashboard → Storage → New bucket → name: `scan-images`, public: true.

- [ ] **Step 5: Run test — verify it passes**

```bash
npm test -- __tests__/lib/scan.test.ts
```
Expected: PASS — 2 tests passing.

- [ ] **Step 6: Commit**

```bash
git add types/scan.ts lib/scan.ts __tests__/lib/scan.test.ts
git commit -m "feat: scan helpers — image analysis, upload, volume calculation"
```

---

## Task 3: Bottle Catalog Helpers

**Files:**
- Create: `lib/bottles.ts`
- Create: `__tests__/lib/bottles.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/bottles.test.ts`:
```ts
import { findBottleByBrand, createBottle, saveInventoryScan } from '@/lib/bottles';

const mockBottle = { id: 'b1', bar_id: 'bar1', brand: 'Bulleit', spirit_type: 'Bourbon', total_volume_ml: 750, bottle_image_ref: null, created_at: '2026-01-01' };
const mockScan = { id: 's1', bottle_id: 'b1', fill_pct: 55, volume_remaining_ml: 413, scan_image_url: null, scanned_by: 'u1', scanned_at: '2026-04-09' };

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'bottles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              ilike: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockBottle, error: null }),
              }),
              single: jest.fn().mockResolvedValue({ data: mockBottle, error: null }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockBottle, error: null }),
            }),
          }),
        };
      }
      return {
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockScan, error: null }),
          }),
        }),
      };
    }),
  },
}));

describe('findBottleByBrand', () => {
  it('returns bottle when brand matches', async () => {
    const bottle = await findBottleByBrand('bar1', 'Bulleit');
    expect(bottle?.brand).toBe('Bulleit');
  });
});

describe('createBottle', () => {
  it('creates and returns new bottle', async () => {
    const bottle = await createBottle('bar1', 'Bulleit', 'Bourbon', 750);
    expect(bottle.id).toBe('b1');
    expect(bottle.total_volume_ml).toBe(750);
  });
});

describe('saveInventoryScan', () => {
  it('saves scan record', async () => {
    const scan = await saveInventoryScan('b1', 55, 413, 'u1');
    expect(scan.fill_pct).toBe(55);
    expect(scan.volume_remaining_ml).toBe(413);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/bottles.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement bottle catalog helpers**

Create `lib/bottles.ts`:
```ts
import { supabase } from './supabase';
import { Bottle, InventoryScan } from '@/types/database';
import { logActivity } from './auth';

export async function findBottleByBrand(barId: string, brand: string): Promise<Bottle | null> {
  const { data } = await supabase
    .from('bottles')
    .select('*')
    .eq('bar_id', barId)
    .ilike('brand', brand)
    .single();
  return data as Bottle | null;
}

export async function createBottle(
  barId: string,
  brand: string,
  spiritType: string,
  totalVolumeMl: number,
  bottleImageRef?: string
): Promise<Bottle> {
  const { data, error } = await supabase
    .from('bottles')
    .insert({ bar_id: barId, brand, spirit_type: spiritType, total_volume_ml: totalVolumeMl, bottle_image_ref: bottleImageRef ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as Bottle;
}

export async function saveInventoryScan(
  bottleId: string,
  fillPct: number,
  volumeRemainingMl: number,
  scannedBy: string,
  scanImageUrl?: string
): Promise<InventoryScan> {
  const { data, error } = await supabase
    .from('inventory_scans')
    .insert({ bottle_id: bottleId, fill_pct: fillPct, volume_remaining_ml: volumeRemainingMl, scanned_by: scannedBy, scan_image_url: scanImageUrl ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as InventoryScan;
}

export async function checkAndTriggerAlert(bottleId: string, volumeRemainingMl: number): Promise<void> {
  // Check if there's an active threshold for this bottle
  const { data: alert } = await supabase
    .from('alerts')
    .select('*')
    .eq('bottle_id', bottleId)
    .is('resolved_at', null)
    .maybeSingle();

  if (!alert) return;

  // If volume is below threshold and not yet triggered today, mark triggered
  if (volumeRemainingMl < alert.threshold_ml) {
    await supabase.from('alerts').update({ triggered_at: new Date().toISOString() }).eq('id', alert.id);
  } else if (volumeRemainingMl >= alert.threshold_ml) {
    // Resolve if back above threshold
    await supabase.from('alerts').update({ resolved_at: new Date().toISOString() }).eq('id', alert.id);
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/bottles.test.ts
```
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/bottles.ts __tests__/lib/bottles.test.ts
git commit -m "feat: bottle catalog helpers — find, create, scan, alert trigger"
```

---

## Task 4: Single Bottle Scan Screen

**Files:**
- Create: `app/(app)/scan/index.tsx`
- Create: `app/(app)/scan/single.tsx`
- Create: `app/(app)/scan/new-bottle.tsx`

- [ ] **Step 1: Build scan mode selector**

Create `app/(app)/scan/index.tsx`:
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function ScanIndexScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Bottles</Text>
      <Pressable style={styles.card} onPress={() => router.push('/(app)/scan/single')}>
        <Text style={styles.cardIcon}>📷</Text>
        <Text style={styles.cardTitle}>Single Bottle</Text>
        <Text style={styles.cardSub}>Precise scan of one bottle — confirm before saving</Text>
      </Pressable>
      <Pressable style={[styles.card, styles.cardSecondary]} onPress={() => router.push('/(app)/scan/shelf')}>
        <Text style={styles.cardIcon}>🔍</Text>
        <Text style={styles.cardTitle}>Shelf Scan</Text>
        <Text style={styles.cardSub}>Scan a whole shelf at once — review and save all</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 24, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 14 },
  cardSecondary: { backgroundColor: '#1e1e1e' },
  cardIcon: { fontSize: 28, marginBottom: 8 },
  cardTitle: { color: '#000', fontWeight: 'bold', fontSize: 18, marginBottom: 4 },
  cardSub: { color: '#555', fontSize: 13 },
});

// Fix secondary card text color
```

Update `app/(app)/scan/index.tsx` card secondary text:
```tsx
// In the shelf scan card, override text colors:
<Pressable style={[styles.card, styles.cardSecondary]} onPress={() => router.push('/(app)/scan/shelf')}>
  <Text style={styles.cardIcon}>🔍</Text>
  <Text style={[styles.cardTitle, { color: '#fff' }]}>Shelf Scan</Text>
  <Text style={[styles.cardSub, { color: '#888' }]}>Scan a whole shelf at once — review and save all</Text>
</Pressable>
```

- [ ] **Step 2: Build single bottle scan screen**

Create `app/(app)/scan/single.tsx`:
```tsx
import { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, TextInput, Modal, ScrollView } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { imageUriToBase64, analyzeBottleImage, mlToOz, computeVolumeRemaining } from '@/lib/scan';
import { findBottleByBrand, createBottle, saveInventoryScan, checkAndTriggerAlert } from '@/lib/bottles';
import { logActivity } from '@/lib/auth';
import { SingleScanResult } from '@/types/scan';

type Step = 'camera' | 'analyzing' | 'confirm' | 'new-bottle';

export default function SingleScanScreen() {
  const user = useAppUser();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('camera');
  const [capturedUri, setCapturedUri] = useState<string>('');
  const [scanResult, setScanResult] = useState<SingleScanResult | null>(null);
  const [editedBrand, setEditedBrand] = useState('');
  const [editedSpiritType, setEditedSpiritType] = useState('');
  const [editedFillPct, setEditedFillPct] = useState('');
  const [newBottleSizeMl, setNewBottleSizeMl] = useState('750');
  const [saving, setSaving] = useState(false);

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera access needed to scan bottles.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}><Text style={styles.btnText}>Allow Camera</Text></Pressable>
      </View>
    );
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    setStep('analyzing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
      if (!photo) throw new Error('No photo captured');
      setCapturedUri(photo.uri);
      const base64 = await imageUriToBase64(photo.uri);
      const result = await analyzeBottleImage(base64, 'single') as SingleScanResult;
      setScanResult(result);
      setEditedBrand(result.brand);
      setEditedSpiritType(result.spirit_type);
      setEditedFillPct(String(result.fill_pct));
      if (!result.known_bottle) {
        setStep('new-bottle');
      } else {
        setStep('confirm');
      }
    } catch (e: any) {
      Alert.alert('Scan failed', e.message);
      setStep('camera');
    }
  }

  async function handleSave() {
    if (!user || !scanResult) return;
    setSaving(true);
    try {
      const fillPct = parseInt(editedFillPct, 10);

      // Find or create bottle in catalog
      let bottle = await findBottleByBrand(user.bar_id, editedBrand);
      if (!bottle) {
        const sizeMl = parseInt(newBottleSizeMl, 10) || 750;
        bottle = await createBottle(user.bar_id, editedBrand, editedSpiritType, sizeMl);
      }

      const volumeRemainingMl = computeVolumeRemaining(fillPct, bottle.total_volume_ml);
      await saveInventoryScan(bottle.id, fillPct, volumeRemainingMl, user.id, capturedUri);
      await checkAndTriggerAlert(bottle.id, volumeRemainingMl);
      await logActivity(user.bar_id, user.id, `Scanned ${editedBrand} (${fillPct}%)`, 'inventory_scan', bottle.id);

      Alert.alert('Saved', `${editedBrand} — ${fillPct}% (${volumeRemainingMl}ml / ${mlToOz(volumeRemainingMl)}oz)`, [
        { text: 'Scan another', onPress: () => setStep('camera') },
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error saving', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (step === 'camera') {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
          <View style={styles.overlay}>
            <View style={styles.guide} />
            <Pressable style={styles.captureBtn} onPress={takePicture}>
              <View style={styles.captureBtnInner} />
            </Pressable>
          </View>
        </CameraView>
      </View>
    );
  }

  if (step === 'analyzing') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={[styles.text, { marginTop: 16 }]}>Analyzing bottle...</Text>
      </View>
    );
  }

  if (step === 'new-bottle') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
        <Text style={styles.title}>New Bottle</Text>
        <Text style={styles.subtext}>Claude couldn't identify this bottle. Confirm the details to add it to your catalog.</Text>

        <Text style={styles.label}>Brand name</Text>
        <TextInput style={styles.input} value={editedBrand} onChangeText={setEditedBrand} placeholder="e.g. Bulleit" placeholderTextColor="#666" />

        <Text style={styles.label}>Spirit type</Text>
        <TextInput style={styles.input} value={editedSpiritType} onChangeText={setEditedSpiritType} placeholder="e.g. Bourbon" placeholderTextColor="#666" />

        <Text style={styles.label}>Bottle size (ml)</Text>
        <TextInput style={styles.input} value={newBottleSizeMl} onChangeText={setNewBottleSizeMl} keyboardType="numeric" placeholder="750" placeholderTextColor="#666" />

        <Text style={styles.label}>Fill percentage</Text>
        <TextInput style={styles.input} value={editedFillPct} onChangeText={setEditedFillPct} keyboardType="numeric" placeholder="e.g. 65" placeholderTextColor="#666" />

        <Pressable style={styles.btn} onPress={() => { setStep('confirm'); }} disabled={!editedBrand || !editedSpiritType}>
          <Text style={styles.btnText}>Continue →</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // confirm step
  const fillPct = parseInt(editedFillPct, 10) || 0;
  const estimatedMl = scanResult ? computeVolumeRemaining(fillPct, 750) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text style={styles.title}>Confirm Scan</Text>

      <View style={styles.resultCard}>
        <Text style={styles.resultBrand}>{editedBrand}</Text>
        <Text style={styles.resultType}>{editedSpiritType}</Text>

        <View style={styles.fillRow}>
          <View style={styles.fillBarBg}>
            <View style={[styles.fillBarFill, { width: `${fillPct}%` as any }]} />
          </View>
          <Text style={styles.fillPct}>{fillPct}%</Text>
        </View>
        <Text style={styles.volume}>~{estimatedMl}ml / {mlToOz(estimatedMl)}oz remaining</Text>
      </View>

      <Text style={styles.label}>Edit brand</Text>
      <TextInput style={styles.input} value={editedBrand} onChangeText={setEditedBrand} placeholderTextColor="#666" />

      <Text style={styles.label}>Edit fill %</Text>
      <TextInput style={styles.input} value={editedFillPct} onChangeText={setEditedFillPct} keyboardType="numeric" placeholderTextColor="#666" />

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        <Pressable style={[styles.btn, { flex: 1, backgroundColor: '#333' }]} onPress={() => setStep('camera')}>
          <Text style={[styles.btnText, { color: '#aaa' }]}>Retake</Text>
        </Pressable>
        <Pressable style={[styles.btn, { flex: 1 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>✓ Save</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtext: { color: '#888', fontSize: 13, marginBottom: 24, lineHeight: 20 },
  text: { color: '#fff', fontSize: 16, textAlign: 'center' },
  label: { color: '#888', fontSize: 12, marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 14, fontSize: 15 },
  btn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40 },
  guide: { position: 'absolute', top: '15%', left: '20%', right: '20%', bottom: '25%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 8 },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  resultCard: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 16, marginBottom: 20 },
  resultBrand: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  resultType: { color: '#888', fontSize: 13, marginBottom: 12 },
  fillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  fillBarBg: { flex: 1, height: 8, backgroundColor: '#333', borderRadius: 4 },
  fillBarFill: { height: '100%', backgroundColor: '#fff', opacity: 0.7, borderRadius: 4 },
  fillPct: { color: '#fff', fontWeight: 'bold', fontSize: 16, width: 40, textAlign: 'right' },
  volume: { color: '#888', fontSize: 12 },
});
```

- [ ] **Step 3: Verify single scan flow**

```bash
npx expo start
```
On a physical device (camera won't work in simulator for full test): open app → Scan → Single Bottle → take photo → confirm AI result appears → save → confirm it appears in Supabase `inventory_scans` table.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/scan/
git commit -m "feat: single bottle scan — camera, AI analysis, confirm, save"
```

---

## Task 5: Shelf Scan Screen

**Files:**
- Create: `app/(app)/scan/shelf.tsx`

- [ ] **Step 1: Build shelf scan screen**

Create `app/(app)/scan/shelf.tsx`:
```tsx
import { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, FlatList, TextInput, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { imageUriToBase64, analyzeBottleImage, mlToOz, computeVolumeRemaining } from '@/lib/scan';
import { findBottleByBrand, createBottle, saveInventoryScan, checkAndTriggerAlert } from '@/lib/bottles';
import { logActivity } from '@/lib/auth';
import { SingleScanResult } from '@/types/scan';

interface DetectedBottle extends SingleScanResult {
  editedBrand: string;
  editedFillPct: string;
  sizeMl: number;
  needsCatalogEntry: boolean;
}

type Step = 'camera' | 'analyzing' | 'review' | 'resolve-unknowns';

export default function ShelfScanScreen() {
  const user = useAppUser();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('camera');
  const [detected, setDetected] = useState<DetectedBottle[]>([]);
  const [unknownQueue, setUnknownQueue] = useState<number[]>([]);
  const [currentUnknownIdx, setCurrentUnknownIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera access needed.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}><Text style={styles.btnText}>Allow Camera</Text></Pressable>
      </View>
    );
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    setStep('analyzing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!photo) throw new Error('No photo');
      const base64 = await imageUriToBase64(photo.uri);
      const results = await analyzeBottleImage(base64, 'shelf') as SingleScanResult[];

      const bottles: DetectedBottle[] = results.map(r => ({
        ...r,
        editedBrand: r.brand,
        editedFillPct: String(r.fill_pct),
        sizeMl: 750,
        needsCatalogEntry: !r.known_bottle,
      }));
      setDetected(bottles);

      const unknownIdxs = bottles.map((b, i) => b.needsCatalogEntry ? i : -1).filter(i => i >= 0);
      setUnknownQueue(unknownIdxs);

      if (unknownIdxs.length > 0) {
        setCurrentUnknownIdx(0);
        setStep('resolve-unknowns');
      } else {
        setStep('review');
      }
    } catch (e: any) {
      Alert.alert('Scan failed', e.message);
      setStep('camera');
    }
  }

  function resolveUnknown() {
    const nextIdx = currentUnknownIdx + 1;
    if (nextIdx >= unknownQueue.length) {
      setStep('review');
    } else {
      setCurrentUnknownIdx(nextIdx);
    }
  }

  async function saveAll() {
    if (!user) return;
    setSaving(true);
    let savedCount = 0;
    try {
      for (const bottle of detected) {
        const fillPct = parseInt(bottle.editedFillPct, 10) || bottle.fill_pct;
        let catalogBottle = await findBottleByBrand(user.bar_id, bottle.editedBrand);
        if (!catalogBottle) {
          catalogBottle = await createBottle(user.bar_id, bottle.editedBrand, bottle.spirit_type, bottle.sizeMl);
        }
        const volumeMl = computeVolumeRemaining(fillPct, catalogBottle.total_volume_ml);
        await saveInventoryScan(catalogBottle.id, fillPct, volumeMl, user.id);
        await checkAndTriggerAlert(catalogBottle.id, volumeMl);
        savedCount++;
      }
      await logActivity(user.bar_id, user.id, `Shelf scan: saved ${savedCount} bottles`, 'inventory_scan');
      Alert.alert('Saved', `${savedCount} bottles saved to inventory.`, [{ text: 'Done', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (step === 'camera') {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
          <View style={styles.overlay}>
            <Text style={styles.hint}>Point at a shelf of bottles</Text>
            <Pressable style={styles.captureBtn} onPress={takePicture}>
              <View style={styles.captureBtnInner} />
            </Pressable>
          </View>
        </CameraView>
      </View>
    );
  }

  if (step === 'analyzing') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={[styles.text, { marginTop: 16 }]}>Analyzing shelf...</Text>
      </View>
    );
  }

  if (step === 'resolve-unknowns') {
    const unknownIdx = unknownQueue[currentUnknownIdx];
    const bottle = detected[unknownIdx];
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
        <Text style={styles.title}>New Bottle ({currentUnknownIdx + 1} of {unknownQueue.length})</Text>
        <Text style={styles.subtext}>Claude couldn't identify this bottle. Enter the details to add it to your catalog.</Text>

        <Text style={styles.label}>Brand name</Text>
        <TextInput style={styles.input} value={bottle.editedBrand}
          onChangeText={v => setDetected(prev => prev.map((b, i) => i === unknownIdx ? { ...b, editedBrand: v } : b))}
          placeholder="e.g. Cocchi Americano" placeholderTextColor="#666" />

        <Text style={styles.label}>Spirit type</Text>
        <TextInput style={styles.input} value={bottle.spirit_type}
          onChangeText={v => setDetected(prev => prev.map((b, i) => i === unknownIdx ? { ...b, spirit_type: v } : b))}
          placeholder="e.g. Vermouth" placeholderTextColor="#666" />

        <Text style={styles.label}>Bottle size (ml)</Text>
        <TextInput style={styles.input} value={String(bottle.sizeMl)}
          onChangeText={v => setDetected(prev => prev.map((b, i) => i === unknownIdx ? { ...b, sizeMl: parseInt(v) || 750 } : b))}
          keyboardType="numeric" placeholder="750" placeholderTextColor="#666" />

        <Pressable style={[styles.btn, { marginTop: 24 }]} onPress={resolveUnknown}>
          <Text style={styles.btnText}>{currentUnknownIdx + 1 < unknownQueue.length ? 'Next →' : 'Review All'}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // review step
  return (
    <View style={styles.container}>
      <View style={{ padding: 20, paddingTop: 60 }}>
        <Text style={styles.title}>{detected.length} Bottles Detected</Text>
      </View>
      <FlatList
        data={detected}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        renderItem={({ item, index }) => {
          const fillPct = parseInt(item.editedFillPct, 10) || item.fill_pct;
          return (
            <View style={styles.bottleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bottleRowBrand}>{item.editedBrand}</Text>
                <View style={styles.fillRow}>
                  <View style={styles.fillBarBg}>
                    <View style={[styles.fillBarFill, { width: `${fillPct}%` as any }]} />
                  </View>
                  <Text style={styles.fillPctText}>{fillPct}%</Text>
                </View>
              </View>
              <TextInput
                style={styles.pctInput}
                value={item.editedFillPct}
                onChangeText={v => setDetected(prev => prev.map((b, i) => i === index ? { ...b, editedFillPct: v } : b))}
                keyboardType="numeric"
              />
            </View>
          );
        }}
      />
      <View style={styles.saveBar}>
        <Pressable style={styles.btn} onPress={saveAll} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>✓ Save All to Inventory</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtext: { color: '#888', fontSize: 13, lineHeight: 20, marginBottom: 20 },
  text: { color: '#fff', fontSize: 16, textAlign: 'center' },
  label: { color: '#888', fontSize: 12, marginBottom: 4, marginTop: 14 },
  input: { backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 14, fontSize: 15 },
  btn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40 },
  hint: { position: 'absolute', top: 60, alignSelf: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, fontSize: 13 },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  bottleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 10, padding: 12, marginBottom: 8, gap: 12 },
  bottleRowBrand: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 6 },
  fillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fillBarBg: { flex: 1, height: 4, backgroundColor: '#333', borderRadius: 2 },
  fillBarFill: { height: '100%', backgroundColor: '#fff', opacity: 0.6, borderRadius: 2 },
  fillPctText: { color: '#888', fontSize: 12, width: 32 },
  pctInput: { backgroundColor: '#2a2a2a', color: '#fff', borderRadius: 6, padding: 8, width: 56, textAlign: 'center', fontSize: 14 },
  saveBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#111', borderTopWidth: 1, borderTopColor: '#222' },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/(app)/scan/shelf.tsx
git commit -m "feat: shelf scan — multi-bottle detection, unknown queue, bulk save"
```

---

## Task 6: Inventory List

**Files:**
- Create: `lib/inventory.ts`
- Create: `__tests__/lib/inventory.test.ts`
- Create: `app/(app)/inventory/index.tsx`
- Create: `app/(app)/inventory/[id].tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/inventory.test.ts`:
```ts
import { getInventoryList, getBottleHistory } from '@/lib/inventory';

const mockData = [
  { id: 'b1', brand: 'Bulleit', spirit_type: 'Bourbon', total_volume_ml: 750, latest_scan: { fill_pct: 55, volume_remaining_ml: 413, scanned_at: '2026-04-09' } },
];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
          ilike: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      }),
    }),
  },
}));

describe('getInventoryList', () => {
  it('returns bottles with latest scan', async () => {
    const list = await getInventoryList('bar1');
    expect(list).toHaveLength(1);
    expect(list[0].brand).toBe('Bulleit');
  });

  it('filters by spirit type', async () => {
    const list = await getInventoryList('bar1', { spiritType: 'Bourbon' });
    expect(list).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/inventory.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement inventory helpers**

Create `lib/inventory.ts`:
```ts
import { supabase } from './supabase';

export interface InventoryListItem {
  id: string;
  brand: string;
  spirit_type: string;
  total_volume_ml: number;
  fill_pct: number | null;
  volume_remaining_ml: number | null;
  scanned_at: string | null;
  alert_threshold_ml: number | null;
}

export interface BottleHistoryItem {
  fill_pct: number;
  volume_remaining_ml: number;
  scanned_at: string;
  scanned_by: string;
}

export async function getInventoryList(
  barId: string,
  filters?: { spiritType?: string; search?: string }
): Promise<InventoryListItem[]> {
  // Get all bottles with their most recent scan via a join
  let query = supabase
    .from('bottles')
    .select(`
      id, brand, spirit_type, total_volume_ml,
      inventory_scans(fill_pct, volume_remaining_ml, scanned_at)
    `)
    .eq('bar_id', barId)
    .order('brand');

  if (filters?.spiritType) {
    query = query.eq('spirit_type', filters.spiritType) as typeof query;
  }
  if (filters?.search) {
    query = query.ilike('brand', `%${filters.search}%`) as typeof query;
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as any[]).map(b => {
    const scans = (b.inventory_scans ?? []).sort((a: any, z: any) =>
      new Date(z.scanned_at).getTime() - new Date(a.scanned_at).getTime()
    );
    const latest = scans[0] ?? null;
    return {
      id: b.id,
      brand: b.brand,
      spirit_type: b.spirit_type,
      total_volume_ml: b.total_volume_ml,
      fill_pct: latest?.fill_pct ?? null,
      volume_remaining_ml: latest?.volume_remaining_ml ?? null,
      scanned_at: latest?.scanned_at ?? null,
      alert_threshold_ml: null,
    };
  });
}

export async function getBottleHistory(bottleId: string): Promise<BottleHistoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_scans')
    .select('fill_pct, volume_remaining_ml, scanned_at, scanned_by')
    .eq('bottle_id', bottleId)
    .order('scanned_at', { ascending: false });
  if (error) throw error;
  return data as BottleHistoryItem[];
}

export const SPIRIT_TYPES = ['Bourbon', 'Scotch', 'Whiskey', 'Gin', 'Vodka', 'Rum', 'Tequila', 'Mezcal', 'Liqueur', 'Bitters', 'Vermouth', 'Other'];
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/inventory.test.ts
```
Expected: PASS.

- [ ] **Step 5: Build inventory list screen**

Create `app/(app)/inventory/index.tsx`:
```tsx
import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAppUser } from '@/lib/useAppUser';
import { getInventoryList, InventoryListItem, SPIRIT_TYPES } from '@/lib/inventory';
import { mlToOz } from '@/lib/scan';

export default function InventoryScreen() {
  const user = useAppUser();
  const router = useRouter();
  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [search, setSearch] = useState('');
  const [spiritFilter, setSpiritFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.bar_id) return;
    setLoading(true);
    try {
      const data = await getInventoryList(user.bar_id, {
        search: search || undefined,
        spiritType: spiritFilter || undefined,
      });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [user, search, spiritFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isLow = (item: InventoryListItem) =>
    item.alert_threshold_ml !== null && item.volume_remaining_ml !== null && item.volume_remaining_ml < item.alert_threshold_ml;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
      </View>
      <TextInput
        style={styles.search}
        placeholder="Search brand..."
        placeholderTextColor="#666"
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        horizontal
        data={['', ...SPIRIT_TYPES]}
        keyExtractor={s => s}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.filterChip, spiritFilter === item && styles.filterChipActive]}
            onPress={() => setSpiritFilter(item)}
          >
            <Text style={[styles.filterChipText, spiritFilter === item && styles.filterChipTextActive]}>
              {item || 'All'}
            </Text>
          </Pressable>
        )}
      />
      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/(app)/inventory/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.brand}>{item.brand}{isLow(item) ? ' ⚠️' : ''}</Text>
                  <Text style={styles.volume}>
                    {item.fill_pct !== null ? `${item.fill_pct}% · ${item.volume_remaining_ml}ml` : 'No scans yet'}
                  </Text>
                </View>
                <Text style={styles.type}>{item.spirit_type} · {item.total_volume_ml}ml bottle</Text>
                <View style={styles.fillBarBg}>
                  <View style={[styles.fillBarFill, { width: `${item.fill_pct ?? 0}%` as any }]} />
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { padding: 20, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  search: { backgroundColor: '#1e1e1e', color: '#fff', margin: 16, marginTop: 0, borderRadius: 8, padding: 12, fontSize: 15 },
  filterChip: { backgroundColor: '#1e1e1e', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 },
  filterChipActive: { backgroundColor: '#fff' },
  filterChipText: { color: '#888', fontSize: 12 },
  filterChipTextActive: { color: '#000', fontWeight: 'bold' },
  row: { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 14, marginBottom: 8 },
  brand: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  volume: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  type: { color: '#666', fontSize: 11, marginBottom: 8 },
  fillBarBg: { height: 4, backgroundColor: '#333', borderRadius: 2 },
  fillBarFill: { height: '100%', backgroundColor: '#fff', opacity: 0.6, borderRadius: 2 },
});
```

- [ ] **Step 6: Build bottle history screen**

Create `app/(app)/inventory/[id].tsx`:
```tsx
import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getBottleHistory, BottleHistoryItem } from '@/lib/inventory';
import { Bottle } from '@/types/database';
import { mlToOz } from '@/lib/scan';
import { useAppUser } from '@/lib/useAppUser';

export default function BottleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAppUser();
  const router = useRouter();
  const [bottle, setBottle] = useState<Bottle | null>(null);
  const [history, setHistory] = useState<BottleHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    async function load() {
      const [bottleRes, historyData] = await Promise.all([
        supabase.from('bottles').select('*').eq('id', id).single(),
        getBottleHistory(id),
      ]);
      setBottle(bottleRes.data as Bottle);
      setHistory(historyData);

      // Load existing threshold
      const alertRes = await supabase.from('alerts').select('threshold_ml').eq('bottle_id', id).is('resolved_at', null).maybeSingle();
      if (alertRes.data) setThreshold(String(alertRes.data.threshold_ml));
      setLoading(false);
    }
    if (id) load();
  }, [id]);

  async function saveThreshold() {
    if (!id || !user) return;
    setSavingThreshold(true);
    const ml = parseInt(threshold, 10);
    if (isNaN(ml) || ml <= 0) { Alert.alert('Invalid', 'Enter a positive number in ml.'); setSavingThreshold(false); return; }

    // Upsert alert threshold: delete existing unresolved, insert new
    await supabase.from('alerts').update({ resolved_at: new Date().toISOString() }).eq('bottle_id', id).is('resolved_at', null);
    await supabase.from('alerts').insert({ bottle_id: id, threshold_ml: ml });
    Alert.alert('Saved', `Alert set: notify when below ${ml}ml.`);
    setSavingThreshold(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#fff" />;
  if (!bottle) return <View style={styles.container}><Text style={styles.text}>Bottle not found.</Text></View>;

  const latest = history[0];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
        <Text style={styles.title}>{bottle.brand}</Text>
        <Text style={styles.sub}>{bottle.spirit_type} · {bottle.total_volume_ml}ml bottle</Text>
        {latest && (
          <Text style={styles.latest}>
            Current: {latest.fill_pct}% · {latest.volume_remaining_ml}ml ({mlToOz(latest.volume_remaining_ml)}oz)
          </Text>
        )}
      </View>

      {user?.role === 'admin' && (
        <View style={styles.alertSection}>
          <Text style={styles.sectionTitle}>Low-Stock Alert</Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={threshold}
              onChangeText={setThreshold}
              placeholder="Alert threshold in ml (e.g. 200)"
              placeholderTextColor="#666"
              keyboardType="numeric"
            />
            <Pressable style={styles.btn} onPress={saveThreshold} disabled={savingThreshold}>
              <Text style={styles.btnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle2}>Scan History</Text>
      <FlatList
        data={history}
        keyExtractor={h => h.scanned_at}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={styles.historyRow}>
            <View>
              <Text style={styles.historyDate}>{new Date(item.scanned_at).toLocaleDateString()} {new Date(item.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.historyPct}>{item.fill_pct}%</Text>
              <Text style={styles.historyMl}>{item.volume_remaining_ml}ml</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  back: { color: '#888', fontSize: 14, marginBottom: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  sub: { color: '#888', fontSize: 13, marginTop: 2 },
  latest: { color: '#fff', fontSize: 15, marginTop: 8, fontWeight: '600' },
  text: { color: '#fff', padding: 20 },
  alertSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  sectionTitle: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sectionTitle2: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, padding: 16, paddingBottom: 8 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 12, fontSize: 14 },
  btn: { backgroundColor: '#fff', borderRadius: 8, padding: 12, paddingHorizontal: 16 },
  btnText: { color: '#000', fontWeight: 'bold' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  historyDate: { color: '#ccc', fontSize: 13 },
  historyPct: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  historyMl: { color: '#888', fontSize: 12 },
});
```

- [ ] **Step 7: Run full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/(app)/inventory/ lib/inventory.ts __tests__/lib/inventory.test.ts
git commit -m "feat: inventory list with search/filter and bottle history"
```

---

## Task 7: Low-Stock Alerts & Order List

**Files:**
- Create: `lib/alerts.ts`
- Create: `__tests__/lib/alerts.test.ts`
- Create: `app/(app)/alerts/index.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/alerts.test.ts`:
```ts
import { getActiveAlerts, computeActualUsage } from '@/lib/alerts';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        is: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [
              { id: 'a1', bottle_id: 'b1', threshold_ml: 200, triggered_at: '2026-04-08', resolved_at: null, bottles: { brand: 'Campari', spirit_type: 'Liqueur', total_volume_ml: 750 }, latest_scan: { fill_pct: 20, volume_remaining_ml: 150 } },
            ],
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe('getActiveAlerts', () => {
  it('returns alerts with bottle info', async () => {
    const alerts = await getActiveAlerts('bar1');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].bottles.brand).toBe('Campari');
  });
});

describe('computeActualUsage', () => {
  it('sums consumption across scan pairs', () => {
    const scans = [
      { volume_remaining_ml: 600, scanned_at: '2026-04-01' },
      { volume_remaining_ml: 350, scanned_at: '2026-04-03' },
      { volume_remaining_ml: 750, scanned_at: '2026-04-04' }, // bottle replaced
      { volume_remaining_ml: 500, scanned_at: '2026-04-07' },
    ];
    // Segment 1: 600→350 = 250ml used
    // Bottle replaced (volume went UP 350→750), new segment starts
    // Segment 2: 750→500 = 250ml used
    // Total = 500ml
    expect(computeActualUsage(scans)).toBe(500);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- __tests__/lib/alerts.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement alerts helpers**

Create `lib/alerts.ts`:
```ts
import { supabase } from './supabase';

export interface ActiveAlert {
  id: string;
  bottle_id: string;
  threshold_ml: number;
  triggered_at: string;
  resolved_at: null;
  bottles: { brand: string; spirit_type: string; total_volume_ml: number };
  fill_pct: number | null;
  volume_remaining_ml: number | null;
}

export async function getActiveAlerts(barId: string): Promise<ActiveAlert[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select(`
      id, bottle_id, threshold_ml, triggered_at, resolved_at,
      bottles!inner(brand, spirit_type, total_volume_ml, bar_id)
    `)
    .is('resolved_at', null)
    .eq('bottles.bar_id', barId)
    .order('triggered_at', { ascending: false });
  if (error) throw error;

  // Attach latest scan volumes
  const result: ActiveAlert[] = [];
  for (const alert of (data as any[])) {
    const { data: scanData } = await supabase
      .from('inventory_scans')
      .select('fill_pct, volume_remaining_ml')
      .eq('bottle_id', alert.bottle_id)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    result.push({
      ...alert,
      fill_pct: scanData?.fill_pct ?? null,
      volume_remaining_ml: scanData?.volume_remaining_ml ?? null,
    });
  }
  return result;
}

export interface ScanPoint { volume_remaining_ml: number; scanned_at: string; }

export function computeActualUsage(scans: ScanPoint[]): number {
  // scans sorted oldest-first for this function
  const sorted = [...scans].sort((a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime());
  let totalUsed = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i - 1].volume_remaining_ml - sorted[i].volume_remaining_ml;
    if (diff > 0) {
      // Consumption — volume went down
      totalUsed += diff;
    }
    // If diff < 0, volume went up (bottle replaced) — start fresh, don't subtract
  }
  return totalUsed;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- __tests__/lib/alerts.test.ts
```
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Build alerts screen**

Create `app/(app)/alerts/index.tsx`:
```tsx
import { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppUser } from '@/lib/useAppUser';
import { getActiveAlerts, ActiveAlert } from '@/lib/alerts';
import { mlToOz } from '@/lib/scan';

export default function AlertsScreen() {
  const user = useAppUser();
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [orderList, setOrderList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!user?.bar_id) return;
    setLoading(true);
    getActiveAlerts(user.bar_id).then(setAlerts).finally(() => setLoading(false));
  }, [user]));

  function addToOrder(brand: string) {
    if (!orderList.includes(brand)) {
      setOrderList(prev => [...prev, brand]);
    }
  }

  async function exportOrderList() {
    const text = `Order List — ${new Date().toLocaleDateString()}\n\n${orderList.map((b, i) => `${i + 1}. ${b}`).join('\n')}`;
    await Share.share({ message: text, title: 'Order List' });
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#fff" />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Low Stock</Text>
        <Text style={styles.sub}>{alerts.length} items need attention</Text>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={a => a.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const inOrder = orderList.includes(item.bottles.brand);
          const daysSince = Math.floor((Date.now() - new Date(item.triggered_at).getTime()) / 86400000);
          return (
            <View style={styles.alertCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.brand}>{item.bottles.brand}</Text>
                <Text style={styles.volume}>
                  {item.fill_pct}% · {item.volume_remaining_ml}ml
                </Text>
              </View>
              <Text style={styles.detail}>
                Threshold: {item.threshold_ml}ml · Below for {daysSince === 0 ? 'less than a day' : `${daysSince}d`}
              </Text>
              <Pressable
                style={[styles.orderBtn, inOrder && styles.orderBtnAdded]}
                onPress={() => addToOrder(item.bottles.brand)}
                disabled={inOrder}
              >
                <Text style={styles.orderBtnText}>{inOrder ? '✓ On Order List' : '+ Add to Order List'}</Text>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No low-stock items. All good!</Text>}
      />

      {orderList.length > 0 && (
        <View style={styles.orderBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderBarTitle}>Order List ({orderList.length} items)</Text>
            <Text style={styles.orderBarItems} numberOfLines={1}>{orderList.join(', ')}</Text>
          </View>
          <Pressable style={styles.exportBtn} onPress={exportOrderList}>
            <Text style={styles.exportBtnText}>Export</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { padding: 20, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  sub: { color: '#888', fontSize: 13, marginTop: 2 },
  alertCard: { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 14, marginBottom: 8 },
  brand: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  volume: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  detail: { color: '#888', fontSize: 12, marginBottom: 10 },
  orderBtn: { backgroundColor: '#2a2a2a', borderRadius: 6, padding: 8, alignItems: 'center' },
  orderBtnAdded: { backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: '#2a4a2a' },
  orderBtnText: { color: '#ddd', fontSize: 12, fontWeight: '600' },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  orderBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1e1e1e', borderTopWidth: 1, borderTopColor: '#333', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  orderBarTitle: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  orderBarItems: { color: '#888', fontSize: 11, marginTop: 2 },
  exportBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 10, paddingHorizontal: 16 },
  exportBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
});
```

Add the alerts tab to `app/(app)/_layout.tsx`:

In the Tabs component, add after the inventory tab:
```tsx
<Tabs.Screen name="alerts/index" options={{ title: 'Alerts' }} />
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit and push**

```bash
git add app/(app)/alerts/ lib/alerts.ts __tests__/lib/alerts.test.ts app/(app)/_layout.tsx
git commit -m "feat: low-stock alerts and order list with export"
git push
```

---

## Plan 2 Complete

After Task 7, the app has:
- Claude Vision AI scanning — single bottle and shelf modes
- Bottle catalog that builds as you scan
- Inventory list with search and spirit-type filter
- Bottle detail with scan history
- Per-bottle low-stock alerts with configurable thresholds
- Order list with export/share

**Next:** Plan 3 covers recipes, Toast CSV upload, theoretical usage calculation, variance report, and consumption report with export.
