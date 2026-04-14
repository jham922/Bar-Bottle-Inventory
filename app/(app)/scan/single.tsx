import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { analyzeBottleImage, uploadScanImage, mlToOz, computeVolumeRemaining, getRecentCalibrations, saveScanCalibration } from '@/lib/scan';
import { findBottleByBrand, createBottle, saveInventoryScan, checkAndTriggerAlert } from '@/lib/bottles';
import { supabase } from '@/lib/supabase';
import { SingleScanResult } from '@/types/scan';

type Step = 'camera' | 'analyzing' | 'new_bottle' | 'confirm' | 'saving';

interface ConfirmData {
  scanResult: SingleScanResult;
  imageUri: string;
  bottle: { id: string; total_volume_ml: number } | null;
  newBottleName: string;
  newBottleSizeMl: number;
}

const isWeb = Platform.OS === 'web';

export default function SingleScanScreen() {
  const router = useRouter();
  const appUser = useAppUser();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>('camera');
  const [error, setError] = useState<string | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [editedFillPct, setEditedFillPct] = useState('');
  const [aiFillPct, setAiFillPct] = useState(0);
  const [editedBrand, setEditedBrand] = useState('');
  const [editedSpiritType, setEditedSpiritType] = useState('');
  const [editedBottleSizeMl, setEditedBottleSizeMl] = useState('');
  const [newBottleName, setNewBottleName] = useState('');
  const [newBottleSizeMl, setNewBottleSizeMl] = useState('');

  async function processCapture(base64: string, mediaType: string, imageUri: string) {
    if (!appUser) return;
    setStep('analyzing');
    setError(null);
    try {
      const calibrations = await getRecentCalibrations(appUser.bar_id);
      const result = await analyzeBottleImage(base64, 'single', mediaType, calibrations) as SingleScanResult;
      const existing = await findBottleByBrand(appUser.bar_id, result.brand);

      const bottle = existing ?? null;
      setConfirmData({
        scanResult: result,
        imageUri,
        bottle: bottle ? { id: bottle.id, total_volume_ml: bottle.total_volume_ml } : null,
        newBottleName: result.brand,
        newBottleSizeMl: 750,
      });
      setAiFillPct(result.fill_pct);
      setEditedBrand(result.brand);
      setEditedSpiritType(result.spirit_type);
      setEditedFillPct(String(result.fill_pct));
      setEditedBottleSizeMl(String(existing?.total_volume_ml ?? 750));
      setStep('confirm');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setStep('camera');
    }
  }

  // Resize image to max 1600px and compress to JPEG 0.85 before sending to Claude
  function compressImage(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        try {
          const MAX = 1600;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
            else { width = Math.round((width * MAX) / height); height = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
          const result = canvas.toDataURL('image/jpeg', 0.85);
          resolve(result.length > 100 ? result : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Web: use native file input (opens iPhone camera)
  function handleWebCapture() {
    if (!appUser) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      document.body.removeChild(input);
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const rawDataUrl = reader.result as string;
        const compressed = await compressImage(rawDataUrl);
        const base64 = compressed.split(',')[1];
        await processCapture(base64, 'image/jpeg', compressed);
      };
      reader.readAsDataURL(file);
    };
    document.body.appendChild(input);
    input.click();
  }

  // Native: use CameraView
  async function handleNativeCapture() {
    if (!cameraRef.current || !appUser) return;
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      if (!photo) throw new Error('Failed to capture photo');
      const mediaType = photo.uri.startsWith('data:')
        ? (photo.uri.match(/^data:([^;]+);/)?.[1] ?? 'image/jpeg')
        : 'image/jpeg';
      const base64 = photo.uri.startsWith('data:') ? photo.uri.split(',')[1] : photo.uri;
      await processCapture(base64, mediaType, photo.uri);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setStep('camera');
    }
  }

  async function handleNewBottleNext() {
    if (!confirmData) return;
    const name = newBottleName.trim();
    const sizeMl = parseInt(newBottleSizeMl, 10);
    if (!name || isNaN(sizeMl) || sizeMl <= 0) {
      Alert.alert('Missing info', 'Enter a bottle name and size.');
      return;
    }
    setConfirmData({ ...confirmData, newBottleName: name, newBottleSizeMl: sizeMl });
    setEditedBrand(name);
    setEditedSpiritType(confirmData.scanResult.spirit_type);
    setEditedFillPct(String(confirmData.scanResult.fill_pct));
    setEditedBottleSizeMl(String(sizeMl));
    setStep('confirm');
  }

  async function handleSave() {
    if (!confirmData || !appUser) return;
    const fillPct = parseInt(editedFillPct, 10);
    const sizeMl = parseInt(editedBottleSizeMl, 10);
    if (isNaN(fillPct) || fillPct < 0 || fillPct > 100) {
      Alert.alert('Invalid fill %', 'Enter a number between 0 and 100.');
      return;
    }
    if (isNaN(sizeMl) || sizeMl <= 0) {
      Alert.alert('Invalid bottle size', 'Enter a valid size in ml.');
      return;
    }
    setStep('saving');
    try {
      let bottleId: string;
      let totalVolumeMl: number;

      if (confirmData.bottle) {
        bottleId = confirmData.bottle.id;
        totalVolumeMl = sizeMl;
        const brandName = editedBrand.trim();
        const spiritType = editedSpiritType.trim();
        await supabase
          .from('bottles')
          .update({
            brand: brandName || undefined,
            spirit_type: spiritType || undefined,
            total_volume_ml: sizeMl,
          })
          .eq('id', bottleId);
      } else {
        const brandName = editedBrand.trim() || confirmData.scanResult.brand || 'Unknown';
        const spiritType = editedSpiritType.trim() || confirmData.scanResult.spirit_type || 'Other';
        const newBottle = await createBottle(appUser.bar_id, brandName, spiritType, sizeMl);
        bottleId = newBottle.id;
        totalVolumeMl = newBottle.total_volume_ml;
      }

      const volumeRemainingMl = computeVolumeRemaining(fillPct, totalVolumeMl);
      const imageUrl = await uploadScanImage(confirmData.imageUri, appUser.bar_id);
      await saveInventoryScan(bottleId, fillPct, volumeRemainingMl, appUser.id, imageUrl);
      await checkAndTriggerAlert(bottleId, volumeRemainingMl);
      await saveScanCalibration(appUser.bar_id, aiFillPct, fillPct);

      router.replace('/inventory');
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
      setStep('confirm');
    }
  }

  if (step === 'analyzing') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.message}>Analyzing bottle...</Text>
      </View>
    );
  }

  if (step === 'saving') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.message}>Saving scan...</Text>
      </View>
    );
  }

  if (step === 'camera') {
    // Web: simple button that triggers native file/camera picker
    if (isWeb) {
      return (
        <View style={[styles.container, styles.centered]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.webBack}>
            <Text style={styles.webBackText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.webTitle}>Single Bottle Scan</Text>
          <Text style={styles.webHint}>Point your camera at a bottle label so it's clearly visible.</Text>
          <TouchableOpacity style={styles.webCaptureBtn} onPress={handleWebCapture}>
            <Text style={styles.webCaptureBtnText}>📷  Take Photo</Text>
          </TouchableOpacity>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      );
    }

    // Native: full camera view with live preview
    if (!permission) return <View style={styles.container} />;
    if (!permission.granted) {
      return (
        <View style={[styles.container, styles.centered]}>
          <Text style={styles.message}>Camera access is required to scan bottles.</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.overlay}>
            <View style={styles.guide} />
            <Text style={styles.guideLabel}>Center the bottle</Text>
          </View>
        </CameraView>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureButton} onPress={handleNativeCapture}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={{ width: 64 }} />
        </View>
      </View>
    );
  }

  if (step === 'new_bottle' && confirmData) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.form}>
        <Text style={styles.title}>New Bottle</Text>
        <Text style={styles.subtitle}>"{confirmData.scanResult.brand}" isn't in the catalog yet. Enter the details to add it.</Text>

        <Text style={styles.label}>Brand Name</Text>
        <TextInput
          style={styles.input}
          value={newBottleName}
          onChangeText={setNewBottleName}
          placeholder="e.g. Campari"
          placeholderTextColor="#555"
        />

        <Text style={styles.label}>Bottle Size (ml)</Text>
        <TextInput
          style={styles.input}
          value={newBottleSizeMl}
          onChangeText={setNewBottleSizeMl}
          keyboardType="numeric"
          placeholder="e.g. 750"
          placeholderTextColor="#555"
        />

        <TouchableOpacity style={styles.button} onPress={handleNewBottleNext}>
          <Text style={styles.buttonText}>Next</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setStep('camera'); setError(null); }}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (step === 'confirm' && confirmData) {
    const fillPct = parseInt(editedFillPct, 10) || 0;
    const totalMl = parseInt(editedBottleSizeMl, 10) || confirmData.bottle?.total_volume_ml || confirmData.newBottleSizeMl;
    const volumeMl = computeVolumeRemaining(fillPct, totalMl);
    const volumeOz = mlToOz(volumeMl);

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Confirm Scan</Text>

        <Text style={styles.fillPctDisplay}>{fillPct}%</Text>
        <Text style={styles.fieldLabel}>Fill % — type to correct (0–100)</Text>
        <TextInput
          style={[styles.input, styles.fillPctInput]}
          value={editedFillPct}
          onChangeText={setEditedFillPct}
          placeholder="e.g. 70"
          placeholderTextColor="#555"
          keyboardType="decimal-pad"
          maxLength={3}
        />

        <View style={styles.fillBarBg}>
          <View style={[styles.fillBarFg, { width: `${Math.min(Math.max(fillPct, 0), 100)}%` as any }]} />
        </View>
        <Text style={styles.volumeText}>{volumeMl} ml · {volumeOz} oz remaining</Text>

        <Text style={styles.fieldLabel}>Brand (edit if wrong)</Text>
        <TextInput
          style={styles.input}
          value={editedBrand}
          onChangeText={setEditedBrand}
          placeholder="Enter brand name"
          placeholderTextColor="#555"
        />

        <Text style={styles.fieldLabel}>Spirit Type (edit if wrong)</Text>
        <TextInput
          style={styles.input}
          value={editedSpiritType}
          onChangeText={setEditedSpiritType}
          placeholder="e.g. Whiskey, Gin, Rum…"
          placeholderTextColor="#555"
        />

        <Text style={styles.fieldLabel}>Bottle Size ml (edit if wrong)</Text>
        <TextInput
          style={styles.input}
          value={editedBottleSizeMl}
          onChangeText={setEditedBottleSizeMl}
          keyboardType="numeric"
          placeholder="e.g. 750"
          placeholderTextColor="#555"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Save Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setStep('camera'); setError(null); }}>
          <Text style={styles.cancelText}>Retake</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  centered: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  guide: {
    width: 220,
    height: 380,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 12,
  },
  guideLabel: { color: 'rgba(255,255,255,0.8)', marginTop: 12, fontSize: 14 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingVertical: 24,
    backgroundColor: '#000',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  backButton: { width: 64 },
  backButtonText: { color: '#fff', fontSize: 16 },
  webBack: { position: 'absolute', top: 60, left: 24 },
  webBackText: { color: '#888', fontSize: 15 },
  webTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  webHint: { color: '#666', fontSize: 13, textAlign: 'center', paddingHorizontal: 40, marginBottom: 32 },
  webCaptureBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 40,
  },
  webCaptureBtnText: { color: '#111', fontWeight: '700', fontSize: 18 },
  form: { padding: 24, gap: 12 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#999', fontSize: 14, marginBottom: 8 },
  label: { color: '#ccc', fontSize: 14 },
  input: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#fff',
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#111', fontWeight: '700', fontSize: 16 },
  cancelText: { color: '#666', textAlign: 'center', fontSize: 14, marginTop: 8 },
  fieldLabel: { color: '#666', fontSize: 12, marginTop: 8 },
  fieldValue: { color: '#fff', fontSize: 16, fontWeight: '500' },
  fillBarBg: { height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  fillBarFg: { height: '100%', backgroundColor: '#fff', borderRadius: 4 },
  volumeText: { color: '#aaa', fontSize: 14, marginTop: 4 },
  fillPctDisplay: { color: '#fff', fontSize: 48, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  fillPctInput: { textAlign: 'center', fontSize: 20, fontWeight: '600' },
  pctChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  pctChip: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    minWidth: 56,
    alignItems: 'center',
  },
  pctChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  pctChipText: { color: '#aaa', fontSize: 15 },
  pctChipTextActive: { color: '#111', fontWeight: '700' },
  message: { color: '#ccc', fontSize: 16, textAlign: 'center', padding: 24 },
  error: { color: '#f87171', fontSize: 14, padding: 8, textAlign: 'center' },
});
