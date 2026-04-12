import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';
import { imageUriToBase64, analyzeBottleImage, uploadScanImage, mlToOz, computeVolumeRemaining } from '@/lib/scan';
import { findBottleByBrand, createBottle, saveInventoryScan, checkAndTriggerAlert } from '@/lib/bottles';
import { SingleScanResult } from '@/types/scan';

type Step = 'camera' | 'analyzing' | 'review' | 'unknown_queue' | 'saving';

interface DetectedBottle {
  scanResult: SingleScanResult;
  resolvedBottleId: string | null;
  resolvedTotalMl: number | null;
  isNew: boolean;
  newName: string;
  newSizeMl: string;
}

export default function ShelfScanScreen() {
  const router = useRouter();
  const appUser = useAppUser();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>('camera');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedBottle[]>([]);
  const [unknownQueue, setUnknownQueue] = useState<number[]>([]); // indices into detected
  const [currentUnknown, setCurrentUnknown] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      setImageUri(photo.uri);
      setStep('analyzing');

      const base64 = await imageUriToBase64(photo.uri);
      const results = await analyzeBottleImage(base64, 'shelf') as SingleScanResult[];

      const bottles: DetectedBottle[] = await Promise.all(
        results.map(async (r) => {
          const existing = await findBottleByBrand(appUser.bar_id, r.brand);
          return {
            scanResult: r,
            resolvedBottleId: existing?.id ?? null,
            resolvedTotalMl: existing?.total_volume_ml ?? null,
            isNew: !existing,
            newName: r.brand,
            newSizeMl: '750',
          };
        })
      );

      setDetected(bottles);
      const unknownIndices = bottles.map((b, i) => b.isNew ? i : -1).filter(i => i >= 0);
      setUnknownQueue(unknownIndices);
      setCurrentUnknown(0);
      setStep('review');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setStep('camera');
    }
  }

  function handleReviewSaveAll() {
    if (unknownQueue.length > 0) {
      setStep('unknown_queue');
    } else {
      commitSave();
    }
  }

  function handleUnknownNext() {
    const idx = unknownQueue[currentUnknown];
    const bottle = detected[idx];
    const name = bottle.newName.trim();
    const sizeMl = parseInt(bottle.newSizeMl, 10);
    if (!name || isNaN(sizeMl) || sizeMl <= 0) {
      Alert.alert('Missing info', 'Enter a bottle name and size.');
      return;
    }
    if (currentUnknown < unknownQueue.length - 1) {
      setCurrentUnknown(prev => prev + 1);
    } else {
      commitSave();
    }
  }

  function updateUnknownField(idx: number, field: 'newName' | 'newSizeMl', value: string) {
    setDetected(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  }

  async function commitSave() {
    if (!appUser || !imageUri) return;
    setStep('saving');
    try {
      const imageUrl = await uploadScanImage(imageUri, appUser.bar_id);

      for (const bottle of detected) {
        let bottleId: string;
        let totalMl: number;

        if (bottle.resolvedBottleId && bottle.resolvedTotalMl) {
          bottleId = bottle.resolvedBottleId;
          totalMl = bottle.resolvedTotalMl;
        } else {
          const sizeMl = parseInt(bottle.newSizeMl, 10) || 750;
          const created = await createBottle(appUser.bar_id, bottle.newName.trim() || bottle.scanResult.brand, bottle.scanResult.spirit_type, sizeMl);
          bottleId = created.id;
          totalMl = created.total_volume_ml;
        }

        const volumeMl = computeVolumeRemaining(bottle.scanResult.fill_pct, totalMl);
        await saveInventoryScan(bottleId, bottle.scanResult.fill_pct, volumeMl, appUser.id, imageUrl);
        await checkAndTriggerAlert(bottleId, volumeMl);
      }

      router.replace('/inventory');
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
      setStep('review');
    }
  }

  if (step === 'camera') {
    return (
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.overlay}>
            <Text style={styles.guideLabel}>Point at shelf and capture</Text>
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

  if (step === 'analyzing' || step === 'saving') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.message}>{step === 'analyzing' ? 'Analyzing shelf...' : 'Saving scans...'}</Text>
      </View>
    );
  }

  if (step === 'review') {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Detected {detected.length} bottle{detected.length !== 1 ? 's' : ''}</Text>
        <FlatList
          data={detected}
          keyExtractor={(_, i) => String(i)}
          style={{ flex: 1 }}
          renderItem={({ item }) => {
            const totalMl = item.resolvedTotalMl ?? parseInt(item.newSizeMl, 10) || 750;
            const volumeMl = computeVolumeRemaining(item.scanResult.fill_pct, totalMl);
            const low = item.scanResult.fill_pct < 25;
            return (
              <View style={styles.reviewRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewBrand}>
                    {item.isNew ? item.newName : item.scanResult.brand}
                    {item.isNew ? ' (new)' : ''}
                  </Text>
                  <Text style={styles.reviewDetail}>{item.scanResult.spirit_type}</Text>
                  <View style={styles.fillBarBg}>
                    <View style={[styles.fillBarFg, { width: `${item.scanResult.fill_pct}%` }]} />
                  </View>
                  <Text style={styles.reviewDetail}>
                    {item.scanResult.fill_pct}% · {volumeMl} ml · {mlToOz(volumeMl)} oz
                    {low ? ' ⚠️ Low' : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => { setStep('camera'); setError(null); }}>
            <Text style={styles.cancelText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleReviewSaveAll}>
            <Text style={styles.buttonText}>
              {unknownQueue.length > 0 ? `Next (${unknownQueue.length} new)` : 'Save All'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'unknown_queue') {
    const idx = unknownQueue[currentUnknown];
    const bottle = detected[idx];
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.form}>
        <Text style={styles.title}>New Bottle {currentUnknown + 1} of {unknownQueue.length}</Text>
        <Text style={styles.subtitle}>"{bottle.scanResult.brand}" isn't in the catalog yet.</Text>

        <Text style={styles.label}>Brand Name</Text>
        <TextInput
          style={styles.input}
          value={bottle.newName}
          onChangeText={(v) => updateUnknownField(idx, 'newName', v)}
          placeholder="e.g. Campari"
          placeholderTextColor="#555"
        />

        <Text style={styles.label}>Bottle Size (ml)</Text>
        <TextInput
          style={styles.input}
          value={bottle.newSizeMl}
          onChangeText={(v) => updateUnknownField(idx, 'newSizeMl', v)}
          keyboardType="numeric"
          placeholder="e.g. 750"
          placeholderTextColor="#555"
        />

        <TouchableOpacity style={styles.button} onPress={handleUnknownNext}>
          <Text style={styles.buttonText}>
            {currentUnknown < unknownQueue.length - 1 ? 'Next' : 'Save All'}
          </Text>
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
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 24 },
  guideLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
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
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '700', padding: 16 },
  reviewRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  reviewBrand: { color: '#fff', fontSize: 16, fontWeight: '500' },
  reviewDetail: { color: '#999', fontSize: 13, marginTop: 2 },
  fillBarBg: { height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden', marginTop: 4, marginBottom: 2 },
  fillBarFg: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
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
  cancelText: { color: '#666', fontSize: 14 },
  message: { color: '#ccc', fontSize: 16, textAlign: 'center', padding: 24 },
  error: { color: '#f87171', fontSize: 14, padding: 8, textAlign: 'center' },
});
