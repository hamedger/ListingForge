import { decodeVinWithNhtsa } from '@/src/api/nhtsaVin';
import { isValidVin, normalizeVin } from '@/src/domain/vin';
import { useSessionStore } from '@/src/state/sessionStore';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function VehicleVinScreen() {
  const router = useRouter();
  const setVin = useSessionStore((s) => s.setVin);
  const setMode = useSessionStore((s) => s.setMode);
  const setVehiclePhotos = useSessionStore((s) => s.setVehiclePhotos);
  const setVehicleDefectNotes = useSessionStore((s) => s.setVehicleDefectNotes);
  const [permission, requestPermission] = useCameraPermissions();

  const [vin, setVinText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const openScanner = async () => {
    if (!permission?.granted) {
      const asked = await requestPermission();
      if (!asked.granted) {
        setError('Camera permission is required to scan VIN barcodes.');
        return;
      }
    }
    setShowScanner(true);
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    const scanned = normalizeVin(data);
    if (!scanned) return;
    setVinText(scanned);
    setShowScanner(false);
    if (!isValidVin(scanned)) {
      setError('Scanned code found, but it is not a valid 17-character VIN.');
      return;
    }
    setError(null);
  };

  const onContinue = async () => {
    setError(null);
    const normalized = normalizeVin(vin);
    if (!isValidVin(normalized)) {
      setError('Enter a valid 17-character VIN (letters exclude I, O, Q).');
      return;
    }

    setLoading(true);
    try {
      const decoded = await decodeVinWithNhtsa(normalized);
      setMode('auto');
      setVin(decoded);
      setVehiclePhotos([]);
      setVehicleDefectNotes('');
      router.push('/vehicle/confirm');
    } catch {
      setError('Could not decode VIN online. Check connection and try again, or verify the VIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Decode your vehicle</Text>
        <Text style={styles.subtitle}>
          Paste a VIN from the door jamb or windshield. On-device OCR plugs into this same screen later.
        </Text>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={vin}
          onChangeText={setVinText}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="17-character VIN"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
        />
        <Pressable onPress={openScanner} style={styles.scanButton} accessibilityRole="button">
          <FontAwesome name="barcode" size={20} color="#fff" />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton label="Decode & continue" loading={loading} onPress={onContinue} />

      <Text style={styles.hint}>Uses the public NHTSA vPIC decoder (US market metadata).</Text>

      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={styles.modalRoot}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['code39', 'code128', 'qr', 'ean13', 'ean8', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={onBarcodeScanned}
          />
          <View style={styles.modalOverlay}>
            <Text style={styles.modalTitle}>Scan VIN barcode</Text>
            <Text style={styles.modalSubtitle}>Align barcode inside the frame</Text>
            <View style={styles.scanFrame} />
            <PrimaryButton label="Cancel" variant="ghost" onPress={() => setShowScanner(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 18, gap: 14 },
  header: { gap: 8, marginBottom: 8 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 22 },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 18,
    letterSpacing: 1.1,
    fontVariant: ['tabular-nums'],
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0B84FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: '#FF8A8A', fontSize: 14, lineHeight: 20 },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 18, marginTop: 8 },
  modalRoot: { flex: 1, backgroundColor: '#000' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 72,
    paddingBottom: 38,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  modalTitle: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: -28,
  },
  scanFrame: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 18,
    height: 180,
    marginHorizontal: 20,
    backgroundColor: 'transparent',
  },
});
