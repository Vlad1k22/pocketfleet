import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { SyncEngine, ApiError, emptyCache, type Cache } from '../core/sync';
import { demoSession, makeDemoApi, makeDemoSnapshot } from './demo';
import { collectInventory } from './inventory';
import { deviceApi, enroll, request } from './api';
import { readCache, readSession, writeCache, writeSession, deleteCache } from './storage';
import { validateServerUrl, type Command, type Session } from '../../shared/contracts';

type State = {
  cache: Cache;
  session: Session | null;
  ready: boolean;
  busy: boolean;
  offline: boolean;
  error: string | null;
  paused: boolean;
  sync: () => Promise<void>;
  connect: (url: string, name: string, code: string) => Promise<void>;
  disconnect: () => Promise<void>;
  queueDemo: (type: Command['type']) => void;
  setOffline: (value: boolean) => void;
};
const FleetContext = createContext<State | null>(null);
export const useFleet = () => {
  const context = useContext(FleetContext);
  if (!context) throw new Error('FleetProvider is missing.');
  return context;
};

export function FleetProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [cache, setCache] = useState<Cache>({ ...emptyCache(), snapshot: makeDemoSnapshot() });
  const cacheRef = useRef(cache);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const offlineRef = useRef(false),
    controller = useRef<AbortController | null>(null);
  const generation = useRef(0),
    busyRef = useRef(false);
  const demo = useRef<ReturnType<typeof makeDemoApi> | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const getDemo = useCallback(() => {
    if (!demo.current) demo.current = makeDemoApi(makeDemoSnapshot(), () => offlineRef.current);
    return demo.current;
  }, []);
  const update = useCallback((value: Cache) => {
    cacheRef.current = value;
    setCache(value);
  }, []);
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const stored = await readSession();
        const saved = stored ? await readCache(stored.deviceId) : null;
        if (!disposed && stored) {
          update(saved!);
          setSession(stored);
        }
      } catch {
        if (!disposed) setError('Could not read the saved session. Check device storage.');
      } finally {
        if (!disposed) setReady(true);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [update]);
  useEffect(() => {
    engineRef.current = null;
  }, [session]);
  const sync = useCallback(async () => {
    if (busyRef.current || !ready) return;
    const version = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!engineRef.current)
        engineRef.current = new SyncEngine({
          session: session ?? demoSession,
          api: session ? deviceApi : getDemo().api,
          load: () => cacheRef.current,
          inventory: session ? collectInventory : async () => makeDemoSnapshot().device.inventory,
          save: async (value) => {
            if (version !== generation.current) throw new Error('Session changed.');
            if (session) await writeCache(session.deviceId, value);
            if (version !== generation.current) throw new Error('Session changed.');
            update(value);
          },
        });
      await engineRef.current.sync(abort.signal);
      if (version === generation.current && session) setOffline(false);
    } catch (problem) {
      if (!abort.signal.aborted && version === generation.current) {
        setError(
          problem instanceof ApiError && problem.status === 401
            ? 'Session revoked. Disconnect and enroll again.'
            : problem instanceof Error
              ? problem.message
              : 'Sync failed.',
        );
        if (!(problem instanceof ApiError)) setOffline(true);
      }
    } finally {
      if (controller.current === abort) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [ready, session, update, getDemo]);
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (AppState.currentState === 'active') await sync();
      if (!disposed)
        timer = setTimeout(
          () => void tick(),
          (cacheRef.current.snapshot?.policy.syncIntervalSeconds ?? 30) * 1000,
        );
    };
    void tick();
    const subscription = AppState.addEventListener('change', (state) => {
      const background = state !== 'active';
      setPaused(background);
      if (background) controller.current?.abort();
      else void sync();
    });
    return () => {
      disposed = true;
      controller.current?.abort();
      clearTimeout(timer);
      subscription.remove();
    };
  }, [ready, sync]);
  const connect = async (input: string, name: string, code: string) => {
    if (busyRef.current) throw new Error('Wait for the current sync to finish.');
    if (session) throw new Error('Disconnect the current session first.');
    const url = validateServerUrl(input);
    const enrolled = await enroll(
      url,
      name.trim(),
      code.trim().toUpperCase(),
      await collectInventory(),
    );
    const next = { url, ...enrolled.session };
    const nextCache = { ...emptyCache(), snapshot: enrolled.snapshot };
    try {
      await writeCache(next.deviceId, nextCache);
      await writeSession(next);
    } catch (problem) {
      await request(next, '/v1/device', undefined, undefined, 'DELETE').catch(() => undefined);
      throw problem;
    }
    controller.current?.abort();
    generation.current++;
    offlineRef.current = false;
    setOffline(false);
    setError(null);
    update(nextCache);
    setSession(next);
  };
  const disconnect = async () => {
    if (!session || busyRef.current) return;
    try {
      await request(session, '/v1/device', undefined, undefined, 'DELETE');
    } catch (problem) {
      if (!(problem instanceof ApiError) || problem.status !== 401) throw problem;
    }
    controller.current?.abort();
    generation.current++;
    await writeSession(null);
    await deleteCache(session.deviceId);
    demo.current = makeDemoApi(makeDemoSnapshot(), () => offlineRef.current);
    offlineRef.current = false;
    setOffline(false);
    setError(null);
    update({ ...emptyCache(), snapshot: makeDemoSnapshot() });
    setSession(null);
  };
  const queueDemo = (type: Command['type']) => {
    if (!session && !busyRef.current)
      update({ ...cacheRef.current, snapshot: getDemo().queue(type) });
  };
  const toggleOffline = (value: boolean) => {
    offlineRef.current = value;
    setOffline(value);
    if (!value) void sync();
  };
  return (
    <FleetContext.Provider
      value={{
        cache,
        session,
        ready,
        busy,
        offline,
        error,
        paused,
        sync,
        connect,
        disconnect,
        queueDemo,
        setOffline: toggleOffline,
      }}
    >
      {children}
    </FleetContext.Provider>
  );
}
