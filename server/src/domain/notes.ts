/**
 * Admin-only notes on a user (spec 1.2, 2.10): 1–2000 characters, newlines allowed. Any admin may
 * edit or delete any note. Note bodies never go into the audit log (4.6).
 */
import type { AdminNote } from '../../../src/api/types.ts';
import { iso } from '../clock.ts';
import { many, one, run, type Db } from '../db/database.ts';
import { adminRef } from './users.ts';

export type NoteRow = { id: number; user_id: string; author_id: string | null; body: string; created_at: number; updated_at: number };

export const getNote = (db: Db, id: number): NoteRow | undefined => one<NoteRow>(db, 'SELECT * FROM notes WHERE id = ?', id);

export const notesOfUser = (db: Db, userId: string): NoteRow[] =>
  many<NoteRow>(db, 'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC, id DESC', userId);

export function toAdminNote(db: Db, n: NoteRow): AdminNote {
  return { id: n.id, body: n.body, author: adminRef(db, n.author_id), createdAt: iso(n.created_at), updatedAt: iso(n.updated_at) };
}

export function createNote(db: Db, input: { userId: string; authorId: string | null; body: string; now: number }): NoteRow {
  const id = run(
    db,
    'INSERT INTO notes (user_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    input.userId, input.authorId, input.body, input.now, input.now,
  ).lastInsertRowid;
  return getNote(db, id)!;
}

export function updateNote(db: Db, id: number, body: string, now: number): NoteRow {
  run(db, 'UPDATE notes SET body = ?, updated_at = ? WHERE id = ?', body, now, id);
  return getNote(db, id)!;
}

export const deleteNote = (db: Db, id: number): number => run(db, 'DELETE FROM notes WHERE id = ?', id).changes;
