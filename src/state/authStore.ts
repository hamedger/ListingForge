import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateAuthProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { buildEntitlements } from '@/src/auth/entitlements';
import { auth, db } from '@/src/auth/firebase';
import type { Entitlements, UserProfile } from '@/src/auth/types';

type AuthState = {
  loading: boolean;
  initialized: boolean;
  userId: string | null;
  email: string | null;
  profile: UserProfile | null;
  entitlements: Entitlements;
  error: string | null;
  initialize: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  register: (params: { email: string; password: string; displayName?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: {
    display_name?: string | null;
    phone?: string | null;
    auto_refill_enabled?: boolean;
    auto_refill_pack_id?: string | null;
    auto_refill_threshold?: number;
    credits_balance?: number;
  }) => Promise<void>;
};

const DEFAULT_ENTITLEMENTS: Entitlements = {
  canUseMarketPricing: false,
  canUseUnlimitedListings: false,
  canUseDealerBranding: false,
  isTrial: false,
};

let authListenerAttached = false;

function profileRef(uid: string) {
  return doc(db, 'users', uid);
}

function normalizeProfile(data: Record<string, unknown>, user: User): UserProfile {
  const trialEndsAt = typeof data.trial_ends_at === 'string' ? data.trial_ends_at : null;
  const trialActive = trialEndsAt ? new Date(trialEndsAt).getTime() > Date.now() : false;

  return {
    id: user.uid,
    email: typeof data.email === 'string' ? data.email : user.email ?? '',
    display_name:
      typeof data.display_name === 'string'
        ? data.display_name
        : user.displayName && user.displayName.length > 0
          ? user.displayName
          : null,
    phone: typeof data.phone === 'string' ? data.phone : null,
    plan: (data.plan as UserProfile['plan']) ?? 'free',
    credits_balance: typeof data.credits_balance === 'number' ? data.credits_balance : 40,
    auto_refill_enabled: Boolean(data.auto_refill_enabled),
    auto_refill_pack_id: typeof data.auto_refill_pack_id === 'string' ? data.auto_refill_pack_id : null,
    auto_refill_threshold: typeof data.auto_refill_threshold === 'number' ? data.auto_refill_threshold : 20,
    trial_ends_at: trialEndsAt,
    trial_status: trialActive ? 'active' : trialEndsAt ? 'expired' : 'none',
    created_at: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
  };
}

async function fetchOrCreateProfile(user: User): Promise<UserProfile> {
  const ref = profileRef(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return normalizeProfile(snap.data() as Record<string, unknown>, user);
  }

  const nowIso = new Date().toISOString();
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await setDoc(ref, {
    id: user.uid,
    email: user.email ?? '',
    display_name: user.displayName ?? null,
    phone: null,
    plan: 'trial',
    credits_balance: 40,
    auto_refill_enabled: false,
    auto_refill_pack_id: 'growth',
    auto_refill_threshold: 20,
    trial_ends_at: trialEndsAt,
    created_at: nowIso,
    updated_at: nowIso,
    updated_server_ts: serverTimestamp(),
  });

  return {
    id: user.uid,
    email: user.email ?? '',
    display_name: user.displayName ?? null,
    phone: null,
    plan: 'trial',
    credits_balance: 40,
    auto_refill_enabled: false,
    auto_refill_pack_id: 'growth',
    auto_refill_threshold: 20,
    trial_ends_at: trialEndsAt,
    trial_status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  loading: false,
  initialized: false,
  userId: null,
  email: null,
  profile: null,
  entitlements: DEFAULT_ENTITLEMENTS,
  error: null,

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true, error: null });

    const current = auth.currentUser;
    if (!current) {
      set({ loading: false, initialized: true, userId: null, email: null, profile: null });
    } else {
      try {
        const profile = await fetchOrCreateProfile(current);
        set({
          loading: false,
          initialized: true,
          userId: current.uid,
          email: current.email,
          profile,
          entitlements: buildEntitlements(profile),
        });
      } catch (e) {
        set({
          loading: false,
          initialized: true,
          userId: current.uid,
          email: current.email,
          error: e instanceof Error ? e.message : 'Failed to load profile',
        });
      }
    }

    if (!authListenerAttached) {
      authListenerAttached = true;
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          set({ userId: null, email: null, profile: null, entitlements: DEFAULT_ENTITLEMENTS });
          return;
        }
        try {
          const profile = await fetchOrCreateProfile(user);
          set({ userId: user.uid, email: user.email, profile, entitlements: buildEntitlements(profile) });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Profile refresh failed' });
        }
      });
    }
  },

  refreshProfile: async () => {
    const user = auth.currentUser;
    if (!user) return;
    const profile = await fetchOrCreateProfile(user);
    set({ profile, entitlements: buildEntitlements(profile), userId: user.uid, email: user.email });
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await get().refreshProfile();
      set({ loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign in failed';
      set({ loading: false, error: message });
      throw e;
    }
  },

  register: async ({ email, password, displayName }) => {
    set({ loading: true, error: null });
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName && displayName.trim()) {
        await updateAuthProfile(cred.user, { displayName: displayName.trim() });
      }
      await get().refreshProfile();
      if (displayName && displayName.trim()) {
        await get().updateProfile({ display_name: displayName.trim() });
      }
      set({ loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Registration failed';
      set({ loading: false, error: message });
      throw e;
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    try {
      await firebaseSignOut(auth);
      set({
        loading: false,
        userId: null,
        email: null,
        profile: null,
        entitlements: DEFAULT_ENTITLEMENTS,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign out failed';
      set({ loading: false, error: message });
      throw e;
    }
  },

  updateProfile: async (patch) => {
    const user = auth.currentUser;
    if (!user) throw new Error('No signed-in user');
    set({ loading: true, error: null });
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(profileRef(user.uid), {
        ...patch,
        updated_at: nowIso,
        updated_server_ts: serverTimestamp(),
      });
      await get().refreshProfile();
      set({ loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Profile update failed';
      set({ loading: false, error: message });
      throw e;
    }
  },
}));
