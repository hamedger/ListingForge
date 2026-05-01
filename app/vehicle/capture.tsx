import { CameraView, useCameraPermissions } from 'expo-camera';
import { copyAsync, cacheDirectory, EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCvGuidance } from '@/src/ai/cv/useCvGuidance';
import { enhanceListingImage } from '@/src/ai/imageEnhancement';
import type { GuidanceEngineSnapshot } from '@/src/ai/guidance/types';
import { scoreListingPhoto } from '@/src/ai/photoQuality';
import type { CapturedStepPhoto } from '@/src/domain/types';
import { VEHICLE_CAPTURE_STEPS } from '@/src/domain/vehicleSteps';
import { useSessionStore } from '@/src/state/sessionStore';
import { useAuthStore } from '@/src/state/authStore';
import { GuidanceHud } from '@/src/ui/components/GuidanceHud';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { SilhouetteOverlay } from '@/src/ui/components/SilhouetteOverlay';
import { analyzeVehicleDefectsViaBackend, type BackgroundStyle } from '@/src/api/photoEnhance';

const BACKGROUND_OPTIONS = [
  { id: 'auto_best', label: 'Auto best' },
  { id: 'studio_white', label: 'Studio White' },
  { id: 'studio_gray', label: 'Studio Gray' },
  { id: 'showroom', label: 'Showroom' },
] as const;

const LOGO_POSITIONS = [
  { id: 'bottom_right', label: 'Bottom Right' },
  { id: 'bottom_left', label: 'Bottom Left' },
  { id: 'top_right', label: 'Top Right' },
  { id: 'top_left', label: 'Top Left' },
  { id: 'center', label: 'Center' },
] as const;

function isExteriorStep(stepId: string) {
  return stepId === 'front_3_4' || stepId === 'side' || stepId === 'rear_3_4';
}

export default function VehicleGuidedCaptureScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const captureInFlightRef = useRef(false);
  const stepEnteredAtRef = useRef<number>(Date.now());
  const lastAutoCaptureAtRef = useRef<number>(0);
  const [permission, requestPermission] = useCameraPermissions();
  const upsertVehiclePhoto = useSessionStore((s) => s.upsertVehiclePhoto);
  const setVehiclePhotos = useSessionStore((s) => s.setVehiclePhotos);
  const setVehicleDefectNotes = useSessionStore((s) => s.setVehicleDefectNotes);
  const canUseDealerBranding = useAuthStore((s) => s.entitlements.canUseDealerBranding);

  const [stepIndex, setStepIndex] = useState(0);
  const step = VEHICLE_CAPTURE_STEPS[stepIndex]!;
  const [busy, setBusy] = useState(false);
  const [captureSource, setCaptureSource] = useState<'camera' | 'upload' | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [autoCaptureStatus, setAutoCaptureStatus] = useState('Auto-capture OFF');
  const [manualGuidance, setManualGuidance] = useState<GuidanceEngineSnapshot | null>(null);
  const [lastQuality, setLastQuality] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [backgroundOption, setBackgroundOption] = useState<BackgroundStyle>('auto_best');
  const [backgroundDarkness, setBackgroundDarkness] = useState(0);
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [logoOpacity, setLogoOpacity] = useState(0.2);
  const [logoPosition, setLogoPosition] =
    useState<(typeof LOGO_POSITIONS)[number]['id']>('bottom_right');
  const [cameraReady, setCameraReady] = useState(false);

  const stepSignalOverrides = useMemo(() => {
    if (step.id === 'odometer') {
      return { glare: 0.72, coverage: 0.52 };
    }
    if (step.id === 'dashboard') {
      return { coverage: 0.48 };
    }
    return { coverage: 0.55 };
  }, [step.id]);
  const baseGuidance = useCvGuidance({ mode: 'auto', fallbackSignalOverrides: stepSignalOverrides });
  const guidance = manualGuidance ?? baseGuidance;
  const effectiveBackgroundStyle: BackgroundStyle = isExteriorStep(step.id) ? backgroundOption : 'original';

  useEffect(() => {
    setLastQuality(null);
    setManualGuidance(null);
    stepEnteredAtRef.current = Date.now();
  }, [stepIndex]);

  useEffect(() => {
    if (captureSource !== 'camera') setCameraReady(false);
  }, [captureSource]);

  const persistShot = useCallback(async (tmpUri: string, fileName: string) => {
    const base = cacheDirectory;
    if (!base) return tmpUri;
    const dest = `${base}${fileName}`;
    await copyAsync({ from: tmpUri, to: dest });
    return dest;
  }, []);

  const processCapturedUriForStep = useCallback(
    async (inputUri: string, stepId: string, currentStepIndex: number) => {
      const persisted = await persistShot(inputUri, `lf_${stepId}_${Date.now()}.jpg`);
      const quality = await scoreListingPhoto(persisted);
      setLastQuality(quality.score);
      const backgroundStyle: BackgroundStyle = isExteriorStep(stepId) ? backgroundOption : 'original';
      const darkness = isExteriorStep(stepId) ? backgroundDarkness : 0;

      const saveShot = async () => {
        const enhanced = await enhanceListingImage(persisted, {
          lighting: 0.35,
          neutralBackground: false,
          mode: 'auto',
          stepId,
          backgroundStyle,
          backgroundDarkness: darkness,
          logoBase64: canUseDealerBranding ? logoBase64 : undefined,
          logoOpacity: canUseDealerBranding ? logoOpacity : undefined,
          logoPosition: canUseDealerBranding ? logoPosition : undefined,
          preferCloud: true,
        });
        upsertVehiclePhoto({
          stepId,
          originalUri: persisted,
          enhancedUri: enhanced.uri,
          backgroundRemoved: enhanced.backgroundRemoved,
          backgroundStyleApplied: enhanced.backgroundStyleApplied,
          enhancementProvider: enhanced.provider,
        });
        if (isExteriorStep(stepId)) {
          try {
            const imageBase64 = await readAsStringAsync(persisted, { encoding: EncodingType.Base64 });
            const analyzed = await analyzeVehicleDefectsViaBackend({ imageBase64, stepId });
            if (analyzed.summary && analyzed.confidence >= 0.42) {
              const existing = useSessionStore.getState().vehicleDefectNotes;
              const stepLabel = stepId.replace(/_/g, ' ');
              const entry = `${stepLabel}: ${analyzed.summary}`;
              const merged = existing ? `${existing}\n${entry}` : entry;
              const unique = Array.from(new Set(merged.split('\n').map((s) => s.trim()).filter(Boolean)));
              setVehicleDefectNotes(unique.join('\n'));
            }
          } catch {
            // Defect analysis is best-effort; do not block capture flow.
          }
        }

        setManualGuidance({
          frame: { code: 'perfect', label: 'Perfect shot achieved', confidence: 0.95 },
          motionScore: guidance?.motionScore ?? 0,
          updatedAt: Date.now(),
        });

        const next = currentStepIndex + 1;
        if (next >= VEHICLE_CAPTURE_STEPS.length) {
          const raw = useSessionStore.getState().vehiclePhotos;
          const ordered = VEHICLE_CAPTURE_STEPS.map((s) => raw.find((p) => p.stepId === s.id)).filter(
            Boolean,
          ) as CapturedStepPhoto[];
          setVehiclePhotos(ordered);
          router.push('/vehicle/condition');
        } else {
          setStepIndex(next);
        }
      };

      if (!quality.ok && quality.score < 62) {
        setBusy(false);
        Alert.alert(
          'Retake recommended',
          quality.issues.join('\n') || 'Try a brighter, sharper frame.',
          [
            { text: 'Retake', style: 'cancel' },
            { text: 'Use anyway', onPress: () => void saveShot() },
          ],
        );
        return;
      }

      await saveShot();
    },
    [
      backgroundOption,
      backgroundDarkness,
      guidance?.motionScore,
      persistShot,
      router,
      setVehiclePhotos,
      setVehicleDefectNotes,
      upsertVehiclePhoto,
    ],
  );

  const processCapturedUri = useCallback(
    async (inputUri: string) => processCapturedUriForStep(inputUri, step.id, stepIndex),
    [processCapturedUriForStep, step.id, stepIndex],
  );

  const onShutter = useCallback(async () => {
    if (!cameraRef.current || busy || !cameraReady || captureInFlightRef.current) return;
    captureInFlightRef.current = true;
    setBusy(true);
    setLastQuality(null);
    try {
      const cam = cameraRef.current;
      if (!cam) return;
      const photo = await cam.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      await processCapturedUri(photo.uri);
    } catch {
      // CameraView unmounted or session invalid — ignore.
    } finally {
      captureInFlightRef.current = false;
      setBusy(false);
    }
  }, [busy, cameraReady, processCapturedUri]);

  useEffect(() => {
    if (!autoCaptureEnabled || captureSource !== 'camera' || !cameraReady || busy || !guidance) return;

    const now = Date.now();
    const stableForMs = now - stepEnteredAtRef.current;
    const sinceLastAuto = now - lastAutoCaptureAtRef.current;
    const motionOk = guidance.motionScore < 0.12;
    const guidanceOk = guidance.frame.code !== 'hold_steady';

    if (!motionOk) {
      setAutoCaptureStatus('Hold steady…');
      return;
    }

    if (stableForMs < 1200 || sinceLastAuto < 2600 || !guidanceOk) {
      setAutoCaptureStatus('Auto-capture armed…');
      return;
    }

    lastAutoCaptureAtRef.current = now;
    setAutoCaptureStatus('Captured automatically');
    void onShutter().catch(() => {});
  }, [autoCaptureEnabled, busy, cameraReady, captureSource, guidance, onShutter]);

  useEffect(() => {
    if (captureSource !== 'camera') {
      setAutoCaptureStatus('Auto-capture OFF');
      return;
    }
    if (!autoCaptureEnabled) {
      setAutoCaptureStatus('Auto-capture OFF');
      return;
    }
    setAutoCaptureStatus('Auto-capture armed…');
  }, [autoCaptureEnabled, captureSource, stepIndex]);

  const onUploadPhoto = useCallback(async () => {
    if (busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload vehicle photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.95,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setBusy(true);
    setLastQuality(null);
    try {
      await processCapturedUri(result.assets[0].uri);
    } finally {
      setBusy(false);
    }
  }, [busy, processCapturedUri]);

  const onUploadBatch = useCallback(async () => {
    if (busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload vehicle photos.');
      return;
    }
    const remainingSteps = VEHICLE_CAPTURE_STEPS.slice(stepIndex);
    if (remainingSteps.length === 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remainingSteps.length,
      quality: 0.95,
      orderedSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    setBusy(true);
    setLastQuality(null);
    let processed = 0;
    let failed = 0;
    const queue = result.assets.slice(0, remainingSteps.length);
    try {
      for (let i = 0; i < queue.length; i += 1) {
        const asset = queue[i];
        const targetStep = remainingSteps[i];
        if (!asset?.uri || !targetStep) continue;
        setBatchProgress(`Processing ${i + 1}/${queue.length}: ${targetStep.title}`);
        try {
          await processCapturedUriForStep(asset.uri, targetStep.id, stepIndex + i);
          processed += 1;
        } catch {
          failed += 1;
        }
      }
      const finalMessage =
        failed === 0
          ? `Uploaded ${processed} guided shot(s).`
          : `Uploaded ${processed} shot(s), ${failed} failed. You can retry failed steps.`;
      Alert.alert('Batch upload complete', finalMessage);
    } finally {
      setBatchProgress(null);
      setBusy(false);
    }
  }, [busy, processCapturedUriForStep, stepIndex]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (captureSource === 'camera' && !permission.granted) {
    return (
      <View style={styles.permission}>
        <Text style={styles.permissionTitle}>Camera access</Text>
        <Text style={styles.permissionBody}>ListForge needs the camera for guided vehicle photos.</Text>
        <PrimaryButton label="Continue" onPress={requestPermission} />
        <PrimaryButton
          label="Upload photos instead"
          variant="ghost"
          onPress={() => setCaptureSource('upload')}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {captureSource === 'camera' ? (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
        />
      ) : (
        <View style={styles.cameraFallback} />
      )}

      {captureSource === 'camera' ? <SilhouetteOverlay step={step.id} /> : null}

      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepMeta}>
          Step {stepIndex + 1} of {VEHICLE_CAPTURE_STEPS.length}
        </Text>
        <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
      </View>

      <View style={styles.bottom}>
        <GuidanceHud snapshot={guidance} qualityScore={lastQuality} />
        <View style={styles.shutterRow}>
          {captureSource === null ? (
            <View style={styles.sourceActions}>
              <PrimaryButton label="Start camera" onPress={() => setCaptureSource('camera')} />
              <PrimaryButton label="Upload photos" variant="ghost" onPress={() => setCaptureSource('upload')} />
            </View>
          ) : null}
          {captureSource === 'camera' ? (
            <PrimaryButton
              label={busy ? 'Saving…' : 'Capture'}
              loading={busy}
              disabled={!cameraReady}
              onPress={onShutter}
            />
          ) : null}
          {captureSource === 'camera' ? (
            <PrimaryButton
              label={autoCaptureEnabled ? 'Auto-capture: ON' : 'Auto-capture: OFF'}
              variant="ghost"
              disabled={busy}
              onPress={() => setAutoCaptureEnabled((v) => !v)}
            />
          ) : null}
          {captureSource === 'camera' ? (
            <PrimaryButton
              label={`Background: ${
                BACKGROUND_OPTIONS.find((o) => o.id === effectiveBackgroundStyle)?.label ?? 'Original'
              }`}
              variant="ghost"
              disabled={busy}
              onPress={() => {
                if (!isExteriorStep(step.id)) {
                  Alert.alert('Background fixed', 'Interior and odometer shots keep original background.');
                  return;
                }
                const idx = BACKGROUND_OPTIONS.findIndex((o) => o.id === backgroundOption);
                const next = BACKGROUND_OPTIONS[(idx + 1) % BACKGROUND_OPTIONS.length];
                if (next) setBackgroundOption(next.id);
              }}
            />
          ) : null}
          {captureSource === 'camera' && isExteriorStep(step.id) ? (
            <PrimaryButton
              label={`Bg Darkness: ${backgroundDarkness > 0 ? '+' : ''}${backgroundDarkness.toFixed(1)}`}
              variant="ghost"
              disabled={busy}
              onPress={() => setBackgroundDarkness((v) => (v >= 1 ? -1 : Math.round((v + 0.2) * 10) / 10))}
            />
          ) : null}
          {captureSource === 'camera' && isExteriorStep(step.id) ? (
            <PrimaryButton
              label={`Dealer logo: ${logoBase64 ? 'On' : 'Off'}${canUseDealerBranding ? '' : ' (Pro)'}`}
              variant="ghost"
              disabled={busy}
              onPress={async () => {
                if (!canUseDealerBranding) {
                  Alert.alert('Pro feature', 'Dealer logo branding is available for paid plans.');
                  return;
                }
                if (logoBase64) {
                  setLogoBase64(undefined);
                  return;
                }
                const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!perm.granted) {
                  Alert.alert('Permission needed', 'Allow photo library access to pick your logo.');
                  return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ['images'],
                  allowsMultipleSelection: false,
                  quality: 1,
                });
                const uri = result.canceled ? undefined : result.assets[0]?.uri;
                if (!uri) return;
                const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
                setLogoBase64(b64);
              }}
            />
          ) : null}
          {captureSource === 'camera' && isExteriorStep(step.id) && canUseDealerBranding && logoBase64 ? (
            <PrimaryButton
              label={`Logo Opacity: ${Math.round(logoOpacity * 100)}%`}
              variant="ghost"
              disabled={busy}
              onPress={() => setLogoOpacity((v) => (v >= 0.8 ? 0.1 : Math.round((v + 0.1) * 10) / 10))}
            />
          ) : null}
          {captureSource === 'camera' && isExteriorStep(step.id) && canUseDealerBranding && logoBase64 ? (
            <PrimaryButton
              label={`Logo Position: ${
                LOGO_POSITIONS.find((p) => p.id === logoPosition)?.label ?? 'Bottom Right'
              }`}
              variant="ghost"
              disabled={busy}
              onPress={() => {
                const idx = LOGO_POSITIONS.findIndex((p) => p.id === logoPosition);
                const next = LOGO_POSITIONS[(idx + 1) % LOGO_POSITIONS.length];
                if (next) setLogoPosition(next.id);
              }}
            />
          ) : null}
          {captureSource === 'camera' ? <Text style={styles.autoStatus}>{autoCaptureStatus}</Text> : null}
          {captureSource === 'upload' ? (
            <View style={styles.sourceActions}>
              <PrimaryButton
                label={busy ? 'Processing…' : `Upload ${step.title}`}
                loading={busy}
                onPress={onUploadPhoto}
              />
              <PrimaryButton
                label={busy ? 'Processing batch…' : 'Batch upload remaining steps'}
                variant="ghost"
                loading={busy}
                onPress={onUploadBatch}
              />
            </View>
          ) : null}
          {batchProgress ? <Text style={styles.autoStatus}>{batchProgress}</Text> : null}
          {captureSource !== null ? (
            <PrimaryButton
              label="Switch source"
              variant="ghost"
              disabled={busy}
              onPress={() => setCaptureSource(null)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camera: { ...StyleSheet.absoluteFillObject },
  cameraFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b0f14' },
  top: {
    paddingTop: 54,
    paddingHorizontal: 16,
    gap: 6,
  },
  back: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4 },
  backLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600' },
  stepTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  stepMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  stepSubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, maxWidth: 360 },
  bottom: { flex: 1, justifyContent: 'flex-end', paddingBottom: 22, gap: 12 },
  shutterRow: { paddingHorizontal: 16 },
  sourceActions: { gap: 8 },
  autoStatus: { color: 'rgba(255,255,255,0.65)', fontSize: 12, textAlign: 'center', marginTop: 2 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  permission: {
    flex: 1,
    backgroundColor: '#050608',
    padding: 20,
    gap: 14,
    justifyContent: 'center',
  },
  permissionTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  permissionBody: { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 22 },
});
