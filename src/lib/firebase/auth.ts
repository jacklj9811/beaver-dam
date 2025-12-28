import { firebaseAuth } from './client';

export function getCurrentUserUid(): string {
  const current = firebaseAuth.currentUser;
  if (current?.uid) return current.uid;
  return 'demo';
}
