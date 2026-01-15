'use client';

import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

type FirebaseConfigKeys =
  | 'apiKey'
  | 'authDomain'
  | 'projectId'
  | 'storageBucket'
  | 'messagingSenderId'
  | 'appId';

function getFirebaseConfig(): FirebaseOptions {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  } satisfies Record<FirebaseConfigKeys, string | undefined>;

  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key as FirebaseConfigKeys);

  if (missingKeys.length > 0) {
    const formattedKeys = missingKeys.join(', ');
    throw new Error(`缺少 Firebase 配置，请在环境变量中设置：${formattedKeys}`);
  }

  return firebaseConfig as FirebaseOptions;
}

const firebaseConfig = getFirebaseConfig();

export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const firestore = getFirestore(firebaseApp);
export const firebaseAuth = getAuth(firebaseApp);

const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && useEmulators) {
  const globalKey = '__FIREBASE_EMULATORS_CONNECTED__';
  const globalStore = globalThis as typeof globalThis & { [key: string]: boolean | undefined };

  if (!globalStore[globalKey]) {
    const firestoreHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? 'localhost';
    const firestorePort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '8080');
    const authHostPort =
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOSTPORT ??
      process.env.FIREBASE_AUTH_EMULATOR_HOST ??
      'localhost:9099';

    connectFirestoreEmulator(firestore, firestoreHost, firestorePort);
    connectAuthEmulator(firebaseAuth, `http://${authHostPort}`, {
      disableWarnings: true
    });

    globalStore[globalKey] = true;
  }
}
