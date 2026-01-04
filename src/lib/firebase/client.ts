import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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
