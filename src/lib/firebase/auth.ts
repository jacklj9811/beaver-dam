import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User
} from 'firebase/auth';
import { firebaseAuth } from './client';

export function listenAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function signInAsGuest(): Promise<User> {
  const credential = await signInAnonymously(firebaseAuth);
  if (credential.user?.uid) return credential.user;
  throw new Error('无法获取匿名身份');
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  if (credential.user?.uid) return credential.user;
  throw new Error('登录失败，请重试');
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  if (credential.user?.uid) return credential.user;
  throw new Error('注册失败，请重试');
}

export async function signOutCurrentUser() {
  await signOut(firebaseAuth);
}
