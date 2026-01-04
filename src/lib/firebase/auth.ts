import { signInAnonymously } from 'firebase/auth';
import { firebaseAuth } from './client';

export async function getCurrentUserUid(): Promise<string> {
  const current = firebaseAuth.currentUser;
  if (current?.uid) return current.uid;
  const credential = await signInAnonymously(firebaseAuth);
  if (credential.user?.uid) return credential.user.uid;
  throw new Error('无法获取用户身份');
}
