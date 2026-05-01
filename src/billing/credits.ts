import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

import type { ListingMode } from '@/src/domain/types';

const GUEST_CREDITS_KEY = 'listforge.guest_credits.v1';
const GUEST_STARTING_CREDITS = 5;

export const MODE_CREDIT_COST: Record<ListingMode, number> = {
  auto: 1.5,
  electronics: 1.0,
  general: 0.8,
};

export function estimateFreeListingsLeft(credits: number) {
  return Math.max(0, Math.floor(credits));
}

type ConfirmChoice = 'confirm' | 'cancel';

function roundCredits(value: number) {
  return Number(value.toFixed(2));
}

export async function getGuestCredits() {
  const raw = await AsyncStorage.getItem(GUEST_CREDITS_KEY);
  if (!raw) {
    await AsyncStorage.setItem(GUEST_CREDITS_KEY, String(GUEST_STARTING_CREDITS));
    return GUEST_STARTING_CREDITS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    await AsyncStorage.setItem(GUEST_CREDITS_KEY, String(GUEST_STARTING_CREDITS));
    return GUEST_STARTING_CREDITS;
  }
  return roundCredits(parsed);
}

export async function setGuestCredits(value: number) {
  await AsyncStorage.setItem(GUEST_CREDITS_KEY, String(roundCredits(Math.max(0, value))));
}

function confirmCreditModal(params: { available: number; cost: number; mode: ListingMode }) {
  const { available, cost, mode } = params;
  return new Promise<ConfirmChoice>((resolve) => {
    Alert.alert(
      'Use credits for this listing?',
      `You have ${available.toFixed(1)} credits available.\nThis ${mode.toUpperCase()} listing will use ${cost.toFixed(1)} credits.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'OK', onPress: () => resolve('confirm') },
      ],
    );
  });
}

function outOfCreditsModal(params: {
  isGuest: boolean;
  onRegister: () => void;
  onBuy: () => void;
}) {
  const { isGuest, onRegister, onBuy } = params;
  Alert.alert(
    'Out of credits',
    isGuest
      ? 'Your 5 free credits are used. Register to continue and buy credits.'
      : 'You do not have enough credits for this listing.',
    isGuest
      ? [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Register', onPress: onRegister },
        ]
      : [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy credits', onPress: onBuy },
        ],
  );
}

export async function confirmAndConsumeListingCredits(params: {
  mode: ListingMode;
  userId: string | null;
  signedInCredits: number;
  consumeSignedInCredits: (nextBalance: number) => Promise<void>;
  onRegister: () => void;
  onBuyCredits: () => void;
}) {
  const { mode, userId, signedInCredits, consumeSignedInCredits, onRegister, onBuyCredits } = params;
  const cost = MODE_CREDIT_COST[mode];
  const isGuest = !userId;
  const available = isGuest ? await getGuestCredits() : roundCredits(signedInCredits);

  if (available < cost) {
    outOfCreditsModal({ isGuest, onRegister, onBuy: onBuyCredits });
    return false;
  }

  const choice = await confirmCreditModal({ available, cost, mode });
  if (choice !== 'confirm') return false;

  const nextBalance = roundCredits(available - cost);
  if (isGuest) {
    await setGuestCredits(nextBalance);
  } else {
    await consumeSignedInCredits(nextBalance);
  }
  return true;
}
