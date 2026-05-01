import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  console.warn('Firebase env missing. Set EXPO_PUBLIC_FIREBASE_* values.');
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance;
try {
  // RN persistence helpers are available in the RN build of @firebase/auth.
  // Use dynamic require to avoid package exports/type-resolution issues in TS.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rnAuth = require('@firebase/auth/dist/rn/index.js');
  authInstance = rnAuth.initializeAuth(app, {
    persistence: rnAuth.getReactNativePersistence(AsyncStorage),
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);
