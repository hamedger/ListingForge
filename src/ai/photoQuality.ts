import { Image } from 'react-native';

export interface PhotoQualityResult {
  score: number; // 0-100
  issues: string[];
  ok: boolean;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Lightweight, cross-platform quality gate suitable for mid-range phones.
 * Native blur/glare models can replace this without changing the capture flow.
 */
export async function scoreListingPhoto(uri: string): Promise<PhotoQualityResult> {
  const issues: string[] = [];

  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ width: w, height: h }),
      (e) => reject(e),
    );
  });

  const minSide = Math.min(width, height);
  if (minSide < 900) issues.push('Resolution looks low — move closer or retake.');
  if (minSide < 720) issues.push('Photo is quite small — retake recommended.');

  const ar = width / height;
  if (ar < 0.55 || ar > 2.2) issues.push('Unusual framing — keep the vehicle centered.');

  const resolutionScore = clamp((minSide - 640) / 8, 0, 70);
  const framingScore = ar >= 0.65 && ar <= 1.9 ? 30 : 18;

  const score = Math.round(clamp(resolutionScore + framingScore, 0, 100));
  const ok = issues.length === 0 || (minSide >= 900 && issues.length <= 1);

  return { score, issues, ok };
}
