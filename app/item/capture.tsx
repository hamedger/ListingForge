import { CameraView, useCameraPermissions } from 'expo-camera';
import { copyAsync, cacheDirectory, EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useCvGuidance } from '@/src/ai/cv/useCvGuidance';
import { enhanceListingImage } from '@/src/ai/imageEnhancement';
import type { GuidanceEngineSnapshot } from '@/src/ai/guidance/types';
import { scoreListingPhoto } from '@/src/ai/photoQuality';
import type { BackgroundStyle } from '@/src/api/photoEnhance';
import { confirmAndConsumeListingCredits } from '@/src/billing/credits';
import type { ListingMode } from '@/src/domain/types';
import { useSessionStore } from '@/src/state/sessionStore';
import { useAuthStore } from '@/src/state/authStore';
import { GuidanceHud } from '@/src/ui/components/GuidanceHud';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';

type ItemCaptureStep = { id: string; title: string; hint: string };

const ELECTRONICS_STEPS: ItemCaptureStep[] = [
  { id: 'hero', title: 'Front', hint: 'Center the full device with clean framing.' },
  { id: 'back', title: 'Back / ports', hint: 'Capture back panel and all ports clearly.' },
];

const GENERAL_STEPS: ItemCaptureStep[] = [
  { id: 'hero', title: 'Full item', hint: 'Show the entire item in good lighting.' },
  { id: 'detail', title: 'Detail', hint: 'Capture material/texture details up close.' },
  { id: 'defects', title: 'Wear points', hint: 'Show any wear honestly to reduce buyer friction.' },
];

const STEP_PRIMARY_GUIDANCE: Record<string, string> = {
  hero: 'Center the full item',
  back: 'Show back panel and ports clearly',
  defects: 'Focus on wear points or accessories',
  detail: 'Capture texture/material details',
};

const ELECTRONICS_BACKGROUND_OPTIONS: ReadonlyArray<{ id: BackgroundStyle; label: string }> = [
  { id: 'auto_best', label: 'Auto best' },
  { id: 'clean_white', label: 'Clean White' },
  { id: 'soft_gradient', label: 'Soft Gradient' },
  { id: 'dark_studio', label: 'Dark Studio' },
];

const GENERAL_BACKGROUND_OPTIONS: ReadonlyArray<{ id: BackgroundStyle; label: string }> = [
  { id: 'auto_best', label: 'Auto best' },
  { id: 'neutral_lifestyle', label: 'Neutral Lifestyle' },
  { id: 'light_texture', label: 'Light Texture' },
  { id: 'blur_subtle', label: 'Soft Blur' },
];

const LOGO_POSITIONS = [
  { id: 'bottom_right', label: 'Bottom Right' },
  { id: 'bottom_left', label: 'Bottom Left' },
  { id: 'top_right', label: 'Top Right' },
  { id: 'top_left', label: 'Top Left' },
  { id: 'center', label: 'Center' },
] as const;

export default function ItemCaptureScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode: ListingMode }>();
  const resolvedMode: ListingMode = mode === 'general' ? 'general' : 'electronics';

  const cameraRef = useRef<CameraView>(null);
  const captureInFlightRef = useRef(false);
  const stepEnteredAtRef = useRef<number>(Date.now());
  const lastAutoCaptureAtRef = useRef<number>(0);
  const [permission, requestPermission] = useCameraPermissions();
  const setMode = useSessionStore((s) => s.setMode);
  const itemPhotos = useSessionStore((s) => s.itemPhotos);
  const addItemPhoto = useSessionStore((s) => s.addItemPhoto);
  const addItemPhotoPair = useSessionStore((s) => s.addItemPhotoPair);
  const itemNotes = useSessionStore((s) => s.itemNotes);
  const setItemNotes = useSessionStore((s) => s.setItemNotes);
  const itemSerial = useSessionStore((s) => s.itemSerial);
  const setItemSerial = useSessionStore((s) => s.setItemSerial);
  const setListing = useSessionStore((s) => s.setListing);
  const canUseDealerBranding = useAuthStore((s) => s.entitlements.canUseDealerBranding);
  const userId = useAuthStore((s) => s.userId);
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [busy, setBusy] = useState(false);
  const [captureSource, setCaptureSource] = useState<'camera' | 'upload' | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [autoCaptureStatus, setAutoCaptureStatus] = useState('Auto-capture OFF');
  const [stepIndex, setStepIndex] = useState(0);
  const [awaitingReady, setAwaitingReady] = useState(false);
  const [pendingStepIndex, setPendingStepIndex] = useState<number | null>(null);
  const [autoTick, setAutoTick] = useState(0);
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [manualGuidance, setManualGuidance] = useState<GuidanceEngineSnapshot | null>(null);
  const [backgroundOption, setBackgroundOption] = useState<BackgroundStyle>('auto_best');
  const [backgroundDarkness, setBackgroundDarkness] = useState(0);
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [logoOpacity, setLogoOpacity] = useState(0.2);
  const [logoPosition, setLogoPosition] =
    useState<(typeof LOGO_POSITIONS)[number]['id']>('bottom_right');
  const [cameraReady, setCameraReady] = useState(false);

  const title = useMemo(
    () => (resolvedMode === 'electronics' ? 'Take photos' : 'Guided item photos'),
    [resolvedMode],
  );

  const steps = useMemo(
    () => (resolvedMode === 'electronics' ? ELECTRONICS_STEPS : GENERAL_STEPS),
    [resolvedMode],
  );
  const isCompleted = stepIndex >= steps.length;
  const isWaitingReady = awaitingReady && pendingStepIndex != null;
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)]!;
  const requiresAllSteps = resolvedMode === 'electronics';
  const completedRequired = itemPhotos.length >= steps.length;
  const canGenerate = requiresAllSteps ? completedRequired : itemPhotos.length > 0;
  const backgroundOptions = useMemo(
    () => (resolvedMode === 'electronics' ? ELECTRONICS_BACKGROUND_OPTIONS : GENERAL_BACKGROUND_OPTIONS),
    [resolvedMode],
  );

  useEffect(() => {
    setStepIndex(0);
    setQualityScore(null);
    setAwaitingReady(false);
    setPendingStepIndex(null);
    stepEnteredAtRef.current = Date.now();
  }, [resolvedMode]);

  useEffect(() => {
    if (captureSource !== 'camera') setCameraReady(false);
  }, [captureSource]);

  useEffect(() => {
    if (captureSource !== 'camera') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setCaptureSource(null);
      setAwaitingReady(false);
      setPendingStepIndex(null);
      return true;
    });
    return () => sub.remove();
  }, [captureSource]);

  const stepSignalOverrides = useMemo(() => {
    const label = STEP_PRIMARY_GUIDANCE[currentStep.id] ?? currentStep.hint;
    const baseCoverage = currentStep.id === 'detail' ? 0.68 : currentStep.id === 'defects' ? 0.42 : 0.55;
    return { coverage: baseCoverage, confidence: 0.42, labelHint: label };
  }, [currentStep.hint, currentStep.id]);
  const baseGuidance = useCvGuidance({
    mode: resolvedMode === 'general' ? 'general' : 'electronics',
    fallbackSignalOverrides: {
      coverage: stepSignalOverrides.coverage,
      confidence: stepSignalOverrides.confidence,
    },
  });
  const guidance = useMemo(() => {
    if (manualGuidance) return manualGuidance;
    if (!baseGuidance) return null;
    if (baseGuidance.frame.code === 'perfect') {
      return {
        ...baseGuidance,
        frame: { ...baseGuidance.frame, code: 'center', label: stepSignalOverrides.labelHint, confidence: 0.7 },
      } as GuidanceEngineSnapshot;
    }
    return baseGuidance;
  }, [baseGuidance, manualGuidance, stepSignalOverrides.labelHint]);

  useEffect(() => {
    stepEnteredAtRef.current = Date.now();
    setManualGuidance(null);
  }, [stepIndex]);

  const persistShot = useCallback(async (tmpUri: string) => {
    const base = cacheDirectory;
    if (!base) return tmpUri;
    const dest = `${base}lf_item_${Date.now()}.jpg`;
    await copyAsync({ from: tmpUri, to: dest });
    return dest;
  }, []);

  const processCapturedUri = useCallback(
    async (inputUri: string) => {
      const uri = await persistShot(inputUri);
      const quality = await scoreListingPhoto(uri);
      setQualityScore(quality.score);
      const qualityPass = quality.ok && quality.score >= 62;

      const saveShot = async () => {
        let enhancedUri = uri;
        try {
          const enhanced = await enhanceListingImage(uri, {
            lighting: 0.35,
            neutralBackground: false,
            mode: resolvedMode === 'general' ? 'general' : 'electronics',
            backgroundStyle: backgroundOption,
            backgroundDarkness,
            logoBase64: canUseDealerBranding ? logoBase64 : undefined,
            logoOpacity: canUseDealerBranding ? logoOpacity : undefined,
            logoPosition: canUseDealerBranding ? logoPosition : undefined,
            preferCloud: true,
          });
          enhancedUri = enhanced.uri;
        } catch {
          enhancedUri = uri;
        }
        addItemPhoto(enhancedUri);
        addItemPhotoPair({ originalUri: uri, enhancedUri });
        const next = stepIndex + 1;
        if (qualityPass) {
          setManualGuidance({
            frame: { code: 'perfect', label: 'Perfect shot achieved', confidence: 0.95 },
            motionScore: 0,
            updatedAt: Date.now(),
          });
        } else {
          setManualGuidance({
            frame: {
              code: 'hold_steady',
              label: quality.issues[0] ?? 'Retake suggested, but you can continue.',
              confidence: 0.82,
            },
            motionScore: 0,
            updatedAt: Date.now(),
          });
        }
        if (
          autoCaptureEnabled &&
          captureSource === 'camera' &&
          resolvedMode === 'electronics' &&
          next < steps.length
        ) {
          setPendingStepIndex(next);
          setAwaitingReady(true);
        } else {
          setStepIndex(next);
        }
      };

      if (!qualityPass && captureSource === 'camera' && autoCaptureEnabled) {
        // In auto mode, reject weak captures and require another shot.
        setManualGuidance({
          frame: {
            code: 'hold_steady',
            label: quality.issues[0] ?? 'Auto-capture rejected this shot. Please retake.',
            confidence: 0.9,
          },
          motionScore: 0,
          updatedAt: Date.now(),
        });
        setAutoCaptureStatus('Auto-capture rejected — retake needed');
        setMode(resolvedMode);
        return;
      }
      await saveShot();
      setMode(resolvedMode);
    },
    [
      addItemPhoto,
      addItemPhotoPair,
      autoCaptureEnabled,
      captureSource,
      persistShot,
      resolvedMode,
      backgroundOption,
      backgroundDarkness,
      setMode,
      stepIndex,
      steps.length,
    ],
  );

  const onAddPhoto = useCallback(async () => {
    if (!cameraRef.current || busy || !cameraReady || captureInFlightRef.current) return;
    captureInFlightRef.current = true;
    setBusy(true);
    setQualityScore(null);
    try {
      const cam = cameraRef.current;
      if (!cam) return;
      const photo = await cam.takePictureAsync({ quality: 0.9 });
      await processCapturedUri(photo.uri);
    } catch {
      // CameraView unmounted (nav/back) or native session not ready — ignore.
    } finally {
      captureInFlightRef.current = false;
      setBusy(false);
    }
  }, [busy, cameraReady, processCapturedUri]);

  useEffect(() => {
    if (
      !autoCaptureEnabled ||
      captureSource !== 'camera' ||
      !cameraReady ||
      busy ||
      !guidance ||
      awaitingReady ||
      isCompleted
    )
      return;

    const now = Date.now();
    const stableForMs = now - stepEnteredAtRef.current;
    const sinceLastAuto = now - lastAutoCaptureAtRef.current;
    const motionOk = guidance.motionScore < 0.12;
    const framingOk = guidance.frame.code === 'center' || guidance.frame.code === 'perfect';
    const guidanceOk = framingOk && (guidance.frame.confidence ?? 0) >= 0.6;

    if (!motionOk) {
      setAutoCaptureStatus('Hold steady…');
      return;
    }
    if (!guidanceOk) {
      setAutoCaptureStatus(guidance.frame.label || 'Adjust framing…');
      return;
    }
    if (stableForMs < 1000 || sinceLastAuto < 2400 || !guidanceOk) {
      setAutoCaptureStatus('Auto-capture armed…');
      return;
    }

    lastAutoCaptureAtRef.current = now;
    setAutoCaptureStatus('Captured automatically');
    void onAddPhoto().catch(() => {});
  }, [
    autoCaptureEnabled,
    awaitingReady,
    autoTick,
    busy,
    cameraReady,
    captureSource,
    guidance,
    isCompleted,
    onAddPhoto,
  ]);

  useEffect(() => {
    if (captureSource !== 'camera') {
      setAutoCaptureStatus('Auto-capture OFF');
      return;
    }
    if (!autoCaptureEnabled) {
      setAutoCaptureStatus('Auto-capture OFF');
      return;
    }
    setAutoCaptureStatus(awaitingReady ? 'Waiting for your readiness…' : 'Auto-capture armed…');
  }, [autoCaptureEnabled, awaitingReady, captureSource, stepIndex]);

  // Keep auto-capture checks running even when guidance text doesn't change.
  useEffect(() => {
    if (!autoCaptureEnabled || captureSource !== 'camera' || awaitingReady || isCompleted) return;
    const id = setInterval(() => setAutoTick((v) => v + 1), 300);
    return () => clearInterval(id);
  }, [autoCaptureEnabled, awaitingReady, captureSource, isCompleted]);

  useEffect(() => {
    if (captureSource !== 'camera' || !isCompleted) return;
    // End guided camera flow once required photos are done.
    setCaptureSource(null);
    setAutoCaptureEnabled(false);
    Alert.alert('Guided photos complete', 'All required photos are captured. You can now generate your listing.');
  }, [captureSource, isCompleted]);

  const onUploadPhoto = useCallback(async () => {
    if (busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload existing photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.95,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setBusy(true);
    setQualityScore(null);
    try {
      await processCapturedUri(result.assets[0].uri);
    } finally {
      setBusy(false);
    }
  }, [busy, processCapturedUri]);

  const onGenerate = async () => {
    if (itemPhotos.length === 0) return;
    const ok = await confirmAndConsumeListingCredits({
      mode: resolvedMode,
      userId,
      signedInCredits: profile?.credits_balance ?? 0,
      consumeSignedInCredits: (nextBalance) => updateProfile({ credits_balance: nextBalance }),
      onRegister: () => router.push('/register'),
      onBuyCredits: () => router.push('/profile'),
    });
    if (!ok) return;
    setMode(resolvedMode);
    setListing(null);
    router.push('/result');
  };

  if (!permission) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color="#fff" />
      </Screen>
    );
  }

  if (captureSource === 'camera' && !permission.granted) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.body}>Enable camera access to snap quick listing photos.</Text>
        <PrimaryButton label="Allow camera" onPress={requestPermission} />
        <PrimaryButton label="Upload photos instead" variant="ghost" onPress={() => setCaptureSource('upload')} />
      </Screen>
    );
  }

  if (captureSource === 'camera') {
    return (
      <Screen style={styles.fullscreenRoot}>
        <CameraView
          ref={cameraRef}
          style={styles.fullscreenCamera}
          facing="back"
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
        />
        <View pointerEvents="none" style={styles.fullscreenOverlayWrap}>
          <View style={styles.fullscreenOverlayFrame} />
        </View>
        <View style={styles.fullscreenTopBar}>
          <Pressable
            accessibilityRole="button"
            style={styles.backIconBtn}
            onPress={() => {
              setCaptureSource(null);
              setAwaitingReady(false);
              setPendingStepIndex(null);
            }}>
            <FontAwesome name="arrow-left" size={18} color="#fff" />
          </Pressable>
          <View style={styles.topStepCard}>
            <Text style={styles.topStepTitle}>
              {isCompleted
                ? 'Guided photos complete'
                : `Step ${Math.min(stepIndex + 1, steps.length)} of ${steps.length}: ${currentStep.title}`}
            </Text>
            {!isCompleted ? <Text style={styles.topStepHint}>{currentStep.hint}</Text> : null}
          </View>
        </View>
        <View pointerEvents="none" style={styles.fullscreenHudWrap}>
          <GuidanceHud snapshot={guidance} qualityScore={qualityScore} />
        </View>
        <View style={styles.fullscreenControls}>
          {isWaitingReady ? (
            <View style={styles.readyCard}>
              <Text style={styles.readyTitle}>
                Next: Step {pendingStepIndex + 1} of {steps.length}
              </Text>
              <Text style={styles.readyBody}>{steps[pendingStepIndex]?.title ?? 'Next shot'}</Text>
              <PrimaryButton
                label="I'm ready"
                onPress={() => {
                  setStepIndex(pendingStepIndex);
                  setPendingStepIndex(null);
                  setAwaitingReady(false);
                  stepEnteredAtRef.current = Date.now();
                }}
              />
            </View>
          ) : null}
          {!isCompleted && !isWaitingReady ? (
            <PrimaryButton
              label={busy ? 'Capturing…' : `Capture ${currentStep.title}`}
              loading={busy}
              disabled={!cameraReady}
              onPress={onAddPhoto}
            />
          ) : null}
          {!isCompleted && !isWaitingReady ? (
            <View style={styles.captureModeRow}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setAutoCaptureEnabled(true)}
                style={[styles.captureModeChip, autoCaptureEnabled && styles.captureModeChipActive]}>
                <Text style={[styles.captureModeText, autoCaptureEnabled && styles.captureModeTextActive]}>
                  Auto capture ON
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setAutoCaptureEnabled(false)}
                style={[styles.captureModeChip, !autoCaptureEnabled && styles.captureModeChipActive]}>
                <Text style={[styles.captureModeText, !autoCaptureEnabled && styles.captureModeTextActive]}>
                  Manual
                </Text>
              </Pressable>
            </View>
          ) : null}
          {!isCompleted && !isWaitingReady ? <Text style={styles.autoStatus}>{autoCaptureStatus}</Text> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{title}</Text>
        {isCompleted ? (
          <>
            <Text style={styles.body}>All required guided shots are complete.</Text>
            <Text style={styles.subtle}>Review and generate your listing.</Text>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Step {Math.min(stepIndex + 1, steps.length)} of {steps.length}: {currentStep.title}
            </Text>
            <Text style={styles.subtle}>{currentStep.hint}</Text>
          </>
        )}
        {isWaitingReady ? (
          <View style={styles.readyCard}>
            <Text style={styles.readyTitle}>
              Next: Step {pendingStepIndex + 1} of {steps.length}
            </Text>
            <Text style={styles.readyBody}>{steps[pendingStepIndex]?.title ?? 'Next shot'}</Text>
            <PrimaryButton
              label="I'm ready"
              onPress={() => {
                setStepIndex(pendingStepIndex);
                setPendingStepIndex(null);
                setAwaitingReady(false);
                stepEnteredAtRef.current = Date.now();
              }}
            />
          </View>
        ) : null}

        {captureSource === null ? (
          <View style={styles.sourceCard}>
            <Text style={styles.body}>Choose how to add guided photos</Text>
            <View style={styles.sourceActions}>
              <PrimaryButton label="Start camera" onPress={() => setCaptureSource('camera')} />
              <PrimaryButton label="Upload photos" variant="ghost" onPress={() => setCaptureSource('upload')} />
            </View>
          </View>
        ) : null}

        <GuidanceHud snapshot={guidance} qualityScore={qualityScore} />

        {captureSource === 'upload' && !isCompleted ? (
          <PrimaryButton
            label={busy ? 'Processing…' : `Upload ${currentStep.title}`}
            loading={busy}
            onPress={onUploadPhoto}
          />
        ) : null}
        {captureSource === 'upload' ? (
          <>
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
            {canUseDealerBranding && logoBase64 ? (
              <PrimaryButton
                label={`Logo Opacity: ${Math.round(logoOpacity * 100)}%`}
                variant="ghost"
                disabled={busy}
                onPress={() => setLogoOpacity((v) => (v >= 0.8 ? 0.1 : Math.round((v + 0.1) * 10) / 10))}
              />
            ) : null}
            {canUseDealerBranding && logoBase64 ? (
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
            <PrimaryButton
              label={`Background: ${backgroundOptions.find((o) => o.id === backgroundOption)?.label ?? 'Auto best'}`}
              variant="ghost"
              disabled={busy}
              onPress={() => {
                const idx = backgroundOptions.findIndex((o) => o.id === backgroundOption);
                const next = backgroundOptions[(idx + 1) % backgroundOptions.length];
                if (next) setBackgroundOption(next.id);
              }}
            />
            <PrimaryButton
              label={`Bg Darkness: ${backgroundDarkness > 0 ? '+' : ''}${backgroundDarkness.toFixed(1)}`}
              variant="ghost"
              disabled={busy}
              onPress={() => setBackgroundDarkness((v) => (v >= 1 ? -1 : Math.round((v + 0.2) * 10) / 10))}
            />
          </>
        ) : null}
        {captureSource !== null ? (
          <PrimaryButton
            label="Switch source"
            variant="ghost"
            disabled={busy}
            onPress={() => setCaptureSource(null)}
          />
        ) : null}

        <Text style={styles.label}>Optional notes (model, storage, defects, accessories)</Text>
        {resolvedMode === 'electronics' ? (
          <>
            <Text style={styles.label}>Optional serial/model number (improves generated specs)</Text>
            <TextInput
              value={itemSerial}
              onChangeText={setItemSerial}
              placeholder="e.g. A2890 / SN: F2L..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={styles.serialInput}
            />
          </>
        ) : null}
        <TextInput
          multiline
          value={itemNotes}
          onChangeText={setItemNotes}
          placeholder="e.g. iPhone 14 Pro 256GB unlocked, 91% battery, includes box"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.notes}
        />

        {itemPhotos.length > 0 ? (
          <View style={styles.grid}>
            {itemPhotos.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.thumb} />
            ))}
          </View>
        ) : null}

        {requiresAllSteps && !completedRequired ? (
          <Text style={styles.requirementText}>
            Complete all guided shots ({itemPhotos.length}/{steps.length}) to generate listing.
          </Text>
        ) : null}

        <PrimaryButton
          label="Generate listing"
          disabled={!canGenerate}
          onPress={onGenerate}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 12, paddingBottom: 32 },
  heading: { color: '#fff', fontSize: 22, fontWeight: '700' },
  body: { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 22 },
  subtle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: -6 },
  cameraBox: { height: 220, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  camera: { flex: 1 },
  sourceCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  sourceActions: { gap: 8 },
  overlayWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  overlayFrame: {
    width: '90%',
    height: '76%',
    borderWidth: 2,
    borderRadius: 14,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cameraHudWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
  },
  fullscreenRoot: { flex: 1, backgroundColor: '#000' },
  fullscreenCamera: { flex: 1 },
  fullscreenOverlayWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  fullscreenOverlayFrame: {
    width: '88%',
    height: '72%',
    borderWidth: 2,
    borderRadius: 18,
    borderColor: 'rgba(255,255,255,0.62)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  fullscreenTopBar: {
    position: 'absolute',
    top: 50,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  backIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  topStepCard: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  topStepTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  topStepHint: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 },
  fullscreenHudWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 130,
  },
  fullscreenControls: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 22,
    gap: 8,
  },
  captureModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  captureModeChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.34)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  captureModeChipActive: {
    backgroundColor: 'rgba(11,132,255,0.9)',
    borderColor: 'rgba(255,255,255,0.75)',
  },
  captureModeText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
  },
  captureModeTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 6 },
  notes: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 12,
    color: '#fff',
    textAlignVertical: 'top',
  },
  serialInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 10, backgroundColor: '#111' },
  requirementText: { color: '#FFCC80', fontSize: 13, lineHeight: 18 },
  autoStatus: { color: 'rgba(255,255,255,0.65)', fontSize: 12, textAlign: 'center', marginTop: 2 },
  readyCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 10,
    gap: 8,
  },
  readyTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  readyBody: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  screen: { padding: 18, gap: 12, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
