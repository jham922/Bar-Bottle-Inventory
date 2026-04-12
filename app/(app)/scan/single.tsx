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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { imageUriToBase64, analyzeBottleImage, uploadScanImage, mlToOz, computeVolumeRemaining } from '@/lib/scan';
import { findBottleByBrand, createBottle, saveInventoryScan, checkAndTriggerAlert } from '@/lib/bottles';
import { SingleScanResult } from '@/types/scan';

type Step = 'camera' | 'analyzing' | 'new_bottle' | 'confirm' | 'saving';

interface ConfirmData {
  scanResult: SingleScanResult;
  imageUri: string;
  bottle: { id: string; total_volume_ml: number } | null;
  newBottleName: string;
  newBottleSizeMl: number;
}

export default function SingleScanScreen() {
  const router = useRouter();
  const appUser = useAppUser();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>('camera');
  const [error, setError] = useState<string | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [editedFillPct, setEditedFillPct] = useState('');
  const [newBottleName, setNewBottleName] = useState('');
  const [newBottleSizeMl, setNewBottleSizeMl] = useState('');

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera access is required to scan bottles.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function handleCapture() {
    if (!cameraRef.current || !appUser) return;
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!photo) throw new Error('Failed to capture photo');
      setStep('analyzing');
      const base64 = await imageUriToBase64(photo.uri);
      const result = await analyzeBottleImage(base64, 'single') as SingleScanResult;

      const existing = await findBottleByBrand(appUser.bar_id, result.brand);

      if (!existing && result.known_bottle === false) {
        setConfirmData({ scanResult: result, imageUri: photo.uri, bottle: null, newBottleName: result.brand, newBottleSizeMl: 750 });
        setNewBottleName(result.brand);
        setNewBottleSizeMl('750');
        setStep('new_bottle');
      } else {
        const bottle = existing ?? null;
        setConfirmData({ scanResult: result, imageUri: photo.uri, bottle: bottle ? { id: bottle.id, total_volume_ml: bottle.total_volume_ml } : null, newBottleName: '', newBottleSizeMl: 750 });
        setEditedFillPct(String(result.fill_pct));
        setStep('confirm');
      }
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
    setEditedFillPct(String(confirmData.scanResult.fill_pct));
    setStep('confirm');
  }

  async function handleSave() {
    if (!confirmData || !appUser) return;
    const fillPct = parseInt(editedFillPct, 10);
    if (isNaN(fillPct) || fillPct < 0 || fillPct > 100) {
      Alert.alert('Invalid fill %', 'Enter a number between 0 and 100.');
      return;
    }
    setStep('saving');
    try {
      let bottleId: string;
      let totalVolumeMl: number;

      if (confirmData.bottle) {
        bottleId = confirmData.bottle.id;
        totalVolumeMl = confirmData.bottle.total_volume_ml;
      } else {
        const newBottle = await createBottle(
          appUser.bar_id,
          confirmData.newBottleName,
          confirmData.scanResult.spirit_type,
          confirmData.newBottleSizeMl,
        );
        bottleId = newBottle.id;
        totalVolumeMl = newBottle.total_volume_ml;
      }

      const volumeRemainingMl = computeVolumeRemaining(fillPct, totalVolumeMl);
      const imageUrl = await uploadScanImage(confirmData.imageUri, appUser.bar_id);
      await saveInventoryScan(bottleId, fillPct, volumeRemainingMl, appUser.id, imageUrl);
      await checkAndTriggerAlert(bottleId, volumeRemainingMl);

      router.replace('/inventory');
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
      setStep('confirm');
    }
  }

  if (step === 'camera') {
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
          <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={{ width: 64 }} />
        </View>
      </View>
    );
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
    const totalMl = confirmData.bottle?.total_volume_ml ?? confirmData.newBottleSizeMl;
    const volumeMl = computeVolumeRemaining(fillPct, totalMl);
    const volumeOz = mlToOz(volumeMl);

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.form}>
        <Text style={styles.title}>Confirm Scan</Text>

        <Text style={styles.fieldLabel}>Brand</Text>
        <Text style={styles.fieldValue}>{confirmData.bottle ? confirmData.scanResult.brand : confirmData.newBottleName}</Text>

        <Text style={styles.fieldLabel}>Spirit Type</Text>
        <Text style={styles.fieldValue}>{confirmData.scanResult.spirit_type}</Text>

        <Text style={styles.fieldLabel}>Fill %</Text>
        <TextInput
          style={styles.input}
          value={editedFillPct}
          onChangeText={setEditedFillPct}
          keyboardType="numeric"
          placeholder="0–100"
          placeholderTextColor="#555"
        />

        <View style={styles.fillBarBg}>
          <View style={[styles.fillBarFg, { width: `${Math.min(fillPct, 100)}%` }]} />
        </View>

        <Text style={styles.volumeText}>{volumeMl} ml · {volumeOz} oz remaining</Text>

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
  message: { color: '#ccc', fontSize: 16, textAlign: 'center', padding: 24 },
  error: { color: '#f87171', fontSize: 14, padding: 8, textAlign: 'center' },
});
