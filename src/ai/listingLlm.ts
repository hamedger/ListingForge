import Constants from 'expo-constants';

import type { GeneratedListing, ListingMode } from '@/src/domain/types';

type LlmArgs = {
  baseListing: GeneratedListing;
  mode: ListingMode;
  platform: string;
};

function readExtra(key: string): string | undefined {
  return Constants.expoConfig?.extra?.[key] as string | undefined;
}

export async function maybeEnhanceListingWithLlm(args: LlmArgs): Promise<GeneratedListing> {
  const apiKey = process.env.EXPO_PUBLIC_LISTING_LLM_API_KEY ?? readExtra('EXPO_PUBLIC_LISTING_LLM_API_KEY');
  if (!apiKey) return args.baseListing;

  const endpoint =
    process.env.EXPO_PUBLIC_LISTING_LLM_ENDPOINT ??
    readExtra('EXPO_PUBLIC_LISTING_LLM_ENDPOINT') ??
    'https://api.openai.com/v1/chat/completions';
  const model =
    process.env.EXPO_PUBLIC_LISTING_LLM_MODEL ??
    readExtra('EXPO_PUBLIC_LISTING_LLM_MODEL') ??
    'gpt-4o-mini';

  const prompt = [
    `Rewrite this ${args.mode} marketplace listing for platform "${args.platform}".`,
    'Keep facts unchanged. Improve readability and buyer conversion.',
    'Return strict JSON with keys: title, description.',
    '',
    `Title: ${args.baseListing.title}`,
    `Description: ${args.baseListing.description}`,
  ].join('\n');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) return args.baseListing;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return args.baseListing;
    const parsed = JSON.parse(content) as { title?: string; description?: string };
    const title = parsed.title?.trim() || args.baseListing.title;
    const description = parsed.description?.trim() || args.baseListing.description;
    return {
      ...args.baseListing,
      title,
      description,
      copyReady: `${title}\n\n${args.baseListing.priceRange}\n\n${description}`,
    };
  } catch {
    return args.baseListing;
  }
}
