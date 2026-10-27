import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SessionSchema, SnapshotSchema, ResultSchema, type Session } from '../../shared/contracts';
import { z } from 'zod';
import { emptyCache, type Cache } from '../core/sync';

const key = 'pocketfleet.session.v1';
let browserSession: Session | null = null;
const CacheSchema = z.object({
  snapshot: SnapshotSchema.nullable(),
  processed: z.array(z.string().uuid()).max(200),
  outbox: z.array(z.object({ commandId: z.string().uuid(), result: ResultSchema })).max(100),
  lastMessage: z.string().max(240).nullable(),
  syncedAt: z.string().datetime().nullable(),
});
export async function readSession(): Promise<Session | null> {
  if (Platform.OS === 'web') return browserSession;
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  const parsed = SessionSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}
export async function writeSession(session: Session | null) {
  if (Platform.OS === 'web') {
    browserSession = session;
    return;
  }
  if (!session) await SecureStore.deleteItemAsync(key);
  else
    await SecureStore.setItemAsync(key, JSON.stringify(session), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
}
export async function readCache(id: string): Promise<Cache> {
  try {
    const raw = await AsyncStorage.getItem(`pocketfleet.cache.${id}`);
    const parsed = CacheSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success ? parsed.data : emptyCache();
  } catch {
    return emptyCache();
  }
}
export const writeCache = (id: string, cache: Cache) =>
  AsyncStorage.setItem(`pocketfleet.cache.${id}`, JSON.stringify(cache));
export const deleteCache = (id: string) => AsyncStorage.removeItem(`pocketfleet.cache.${id}`);
