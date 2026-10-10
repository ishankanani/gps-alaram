/**
 * Devices: one row per app installation, keyed by sha256("install:" + installId) (spec 1.1, 1.2).
 * Metadata is minimal by design (4.10): platform, app and OS version, country and language.
 */
import { many, one, run, type Db } from '../db/database.ts';
import type { ClientInfo, LocaleInfo } from '../http/request.ts';
import { installIdHash } from './ids.ts';

export type DeviceRow = {
  id: number;
  install_id_hash: string;
  user_id: string;
  platform: 'android' | 'ios';
  app_version: string;
  build: number | null;
  os_version: string | null;
  country: string | null;
  language: string | null;
  created_at: number;
  last_seen_at: number;
};

export const getDevice = (db: Db, id: number): DeviceRow | undefined =>
  one<DeviceRow>(db, 'SELECT * FROM devices WHERE id = ?', id);

export const findDeviceByInstallId = (db: Db, installId: string): DeviceRow | undefined =>
  one<DeviceRow>(db, 'SELECT * FROM devices WHERE install_id_hash = ?', installIdHash(installId));

export const devicesOfUser = (db: Db, userId: string): DeviceRow[] =>
  many<DeviceRow>(db, 'SELECT * FROM devices WHERE user_id = ? ORDER BY created_at, id', userId);

/**
 * Finds or creates the device for this install and points it at `userId`, refreshing its
 * metadata. Country and language only overwrite stored values when the request carries them.
 */
export function upsertDevice(
  db: Db,
  input: { installId: string; userId: string; client: ClientInfo; locale: LocaleInfo; now: number },
): DeviceRow {
  const hash = installIdHash(input.installId);
  const { client, locale, now } = input;
  const existing = one<DeviceRow>(db, 'SELECT * FROM devices WHERE install_id_hash = ?', hash);
  if (existing) {
    run(
      db,
      `UPDATE devices SET user_id = ?, platform = ?, app_version = ?, build = ?, os_version = ?,
         country = coalesce(?, country), language = coalesce(?, language), last_seen_at = ?
       WHERE id = ?`,
      input.userId, client.platform, client.appVersion, client.build, client.osVersion,
      locale.country, locale.language, now, existing.id,
    );
    return getDevice(db, existing.id)!;
  }
  const id = run(
    db,
    `INSERT INTO devices (install_id_hash, user_id, platform, app_version, build, os_version, country, language, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    hash, input.userId, client.platform, client.appVersion, client.build, client.osVersion,
    locale.country, locale.language, now, now,
  ).lastInsertRowid;
  return getDevice(db, id)!;
}

/** Session touch (4.2): last_seen_at plus X-Client / Accept-Language metadata when present. */
export function touchDevice(db: Db, deviceId: number, input: { client: ClientInfo | null; locale: LocaleInfo; now: number }): void {
  const c = input.client;
  run(
    db,
    `UPDATE devices SET last_seen_at = ?,
       platform = coalesce(?, platform), app_version = coalesce(?, app_version),
       build = CASE WHEN ? THEN ? ELSE build END, os_version = CASE WHEN ? THEN ? ELSE os_version END,
       country = coalesce(?, country), language = coalesce(?, language)
     WHERE id = ?`,
    input.now,
    c?.platform ?? null, c?.appVersion ?? null,
    c ? 1 : 0, c?.build ?? null, c ? 1 : 0, c?.osVersion ?? null,
    input.locale.country, input.locale.language,
    deviceId,
  );
}
