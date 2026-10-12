/**
 * The remote config store (backend-spec 7.3 and 7.5): built-in defaults → the cached file → a fresh
 * answer fetched with If-None-Match. Refetched on start and on foreground when older than 6 h or
 * when the country, language or app version changed, and after admin edits (refreshConfig({ force })).
 */
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { setPlanRules } from '../lib/plans';
import { configKey, defaultConfig, mergeConfig } from '../lib/remoteConfig';
import { apiConfigured, appVersion, deviceRegion, endpoints, getApiLanguage, onApiLanguageChange } from './index';
import type { Announcement, RemoteConfig } from './types';

const MAX_AGE_MS = 6 * 3_600_000;

export type ConfigState = {
  config: RemoteConfig;
  /** = configVersion of the cached answer. */
  etag: string | null;
  /** country|lang|version the cached answer was fetched for. */
  key: string | null;
  fetchedAt: number | null;
  source: 'builtin' | 'cache' | 'server';
  /** Announcement ids the user closed. */
  dismissed: string[];
};

type FileShape = { config?: unknown; etag?: unknown; key?: unknown; fetchedAt?: unknown; dismissed?: unknown };

function file() {
  return new File(Paths.document, 'stopwake-config.json');
}

function readFile(): FileShape | null {
  try {
    const f = file();
    if (!f.exists) return null;
    const parsed = JSON.parse(f.textSync()) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as FileShape) : null;
  } catch {
    return null;
  }
}

function writeFile(s: ConfigState) {
  if (s.source === 'builtin' && s.dismissed.length === 0) return;
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(
      JSON.stringify({
        config: s.source === 'builtin' ? undefined : s.config,
        etag: s.etag,
        key: s.key,
        fetchedAt: s.fetchedAt,
        dismissed: s.dismissed,
      }),
    );
  } catch {
    // The built-in defaults still work.
  }
}

function initialState(): ConfigState {
  const base = defaultConfig(deviceRegion());
  const cached = readFile();
  const dismissed = Array.isArray(cached?.dismissed) ? cached.dismissed.filter((d): d is string => typeof d === 'string').slice(-50) : [];
  if (!cached?.config) return { config: base, etag: null, key: null, fetchedAt: null, source: 'builtin', dismissed };
  return {
    config: mergeConfig(base, cached.config),
    etag: typeof cached.etag === 'string' ? cached.etag : null,
    key: typeof cached.key === 'string' ? cached.key : null,
    fetchedAt: typeof cached.fetchedAt === 'number' ? cached.fetchedAt : null,
    source: 'cache',
    dismissed,
  };
}

let state: ConfigState | null = null;
const listeners = new Set<() => void>();

function current(): ConfigState {
  if (!state) {
    state = initialState();
    setPlanRules(state.config);
  }
  return state;
}

function setState(next: ConfigState, persist = true) {
  state = next;
  setPlanRules(next.config);
  if (persist) writeFile(next);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRemoteConfig(): RemoteConfig {
  return current().config;
}

export function getConfigState(): ConfigState {
  return current();
}

/** The remote config (or the built-in defaults); re-renders when it changes. */
export function useRemoteConfig(): RemoteConfig {
  return useSyncExternalStore(subscribe, () => current().config);
}

export function useConfigState(): ConfigState {
  return useSyncExternalStore(subscribe, current);
}

let inflight: Promise<void> | null = null;

/** Fetches the config if it is stale (or always, with force). Never throws. */
export function refreshConfig(options: { force?: boolean } = {}): Promise<void> {
  if (!apiConfigured) return Promise.resolve();
  if (inflight) return inflight;
  const s = current();
  const country = deviceRegion();
  const lang = getApiLanguage();
  const version = appVersion();
  const key = configKey(country, lang, version);
  const fresh = s.fetchedAt != null && Date.now() - s.fetchedAt < MAX_AGE_MS && Date.now() >= s.fetchedAt;
  if (!options.force && fresh && s.key === key) return Promise.resolve();

  inflight = (async () => {
    try {
      const etag = s.key === key ? s.etag : null;
      const answer = await endpoints.config({ country, lang, platform: 'android', version }, etag);
      const latest = current();
      if (answer === null) {
        setState({ ...latest, fetchedAt: Date.now(), key });
      } else {
        const config = mergeConfig(latest.config, answer);
        setState({ ...latest, config, etag: config.configVersion, key, fetchedAt: Date.now(), source: 'server' });
      }
    } catch {
      // Offline or the server is down: keep what we have.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Another country's config, uncached (the admin's paywall preview). */
export async function fetchConfigFor(country: string): Promise<RemoteConfig> {
  const answer = await endpoints.config({ country, lang: getApiLanguage(), platform: 'android', version: appVersion() });
  return mergeConfig(defaultConfig(country), answer);
}

let started = false;

/** Loads the cache and starts refreshing. Called once by startPro(). */
export function startConfig() {
  current();
  if (started) return;
  started = true;
  void refreshConfig();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void refreshConfig();
  });
  onApiLanguageChange(() => void refreshConfig());
}

// ---- Announcements (the map shows them; package M) ----

/** Remembers that the user closed this announcement; a new id shows again. */
export function dismissAnnouncement(id: string) {
  const s = current();
  if (s.dismissed.includes(id)) return;
  setState({ ...s, dismissed: [...s.dismissed, id].slice(-50) });
}

/** The announcement to show, if any: dismissed ones stay hidden unless they can't be dismissed. */
export function visibleAnnouncement(s: ConfigState): Announcement | null {
  const a = s.config.announcement;
  if (!a) return null;
  if (a.dismissible && a.level !== 'critical' && s.dismissed.includes(a.id)) return null;
  return a;
}

export function useAnnouncement(): Announcement | null {
  return visibleAnnouncement(useConfigState());
}
