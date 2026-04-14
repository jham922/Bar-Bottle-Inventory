import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { SingleScanResult } from '@/types/scan';

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/analyze-bottle`;

export function getMediaTypeFromUri(uri: string): string {
  if (uri.startsWith('data:')) {
    const match = uri.match(/^data:([^;]+);/);
    return match?.[1] ?? 'image/jpeg';
  }
  return 'image/jpeg';
}

export async function imageUriToBase64(uri: string): Promise<string> {
  // On web, expo-camera returns a data URI (data:image/jpeg;base64,...)
  if (uri.startsWith('data:')) {
    return uri.split(',')[1];
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return base64;
}

export type ScanCalibration = { ai: number; corrected: number };

export async function getRecentCalibrations(barId: string): Promise<ScanCalibration[]> {
  const { data } = await supabase
    .from('scan_calibrations')
    .select('ai_fill_pct, corrected_fill_pct')
    .eq('bar_id', barId)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []).map(r => ({ ai: r.ai_fill_pct, corrected: r.corrected_fill_pct }));
}

export async function saveScanCalibration(barId: string, aiFillPct: number, correctedFillPct: number): Promise<void> {
  if (aiFillPct === correctedFillPct) return;
  await supabase.from('scan_calibrations').insert({ bar_id: barId, ai_fill_pct: aiFillPct, corrected_fill_pct: correctedFillPct });
}

export async function analyzeBottleImage(
  imageBase64: string,
  mode: 'single' | 'shelf',
  mediaType = 'image/jpeg',
  calibrations: ScanCalibration[] = [],
): Promise<SingleScanResult | SingleScanResult[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ imageBase64, mode, mediaType, calibrations }),
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
