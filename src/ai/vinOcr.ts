/**
 * On-device VIN OCR belongs in a native frame pipeline (Vision/Core ML/ML Kit).
 * This hook preserves a single integration point for a future native module.
 */
export async function scanVinFromImage(imageUri: string): Promise<string | null> {
  const text = await scanTextFromImage(imageUri);
  if (!text) return null;
  const upper = text.toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]/g, '');
  const vinMatch = compact.match(/[A-HJ-NPR-Z0-9]{17}/);
  return vinMatch?.[0] ?? null;
}

/**
 * Reused OCR entrypoint for item/model text extraction until a dedicated
 * photo text pipeline is integrated.
 */
export async function scanTextFromImage(imageUri: string): Promise<string | null> {
  if (!imageUri) return null;
  try {
    const mod = await import('rn-mlkit-ocr');
    const MlkitOcr = mod.default;
    if (!MlkitOcr?.recognizeText) return null;
    const result = await MlkitOcr.recognizeText(imageUri, 'latin');
    const text = result?.text?.trim();
    return text && text.length > 0 ? normalizeOcrText(text) : null;
  } catch {
    return null;
  }
}

function normalizeOcrText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
