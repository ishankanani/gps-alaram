/**
 * Admin notes (spec 2.10): create on a user, edit and delete by id. Any admin may edit or delete
 * any note. The audit row holds only the note id, never the body (4.6).
 */
import type { AppRoute, RequestContext } from '../../context.ts';
import { authOf } from '../../context.ts';
import { tx } from '../../db/database.ts';
import { createNote, deleteNote, getNote, toAdminNote, updateNote } from '../../domain/notes.ts';
import { getUser } from '../../domain/users.ts';
import { notFound } from '../../http/errors.ts';
import { json, noContent, type Reply } from '../../http/response.ts';
import { route } from '../../http/router.ts';
import { readNoteBody } from '../../http/validate.ts';
import { audit, Fields, ROWID_PARAM, targetUser, USER_REF_PARAM } from './common.ts';

function create(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  const v = new Fields();
  const body = readNoteBody(v, ctx.body);
  v.throwIfAny();
  const note = tx(db, () => {
    const n = createNote(db, { userId: user.id, authorId: authOf(ctx).user.id, body: body!, now: ctx.now });
    audit(ctx, { action: 'note.create', target: { type: 'note', id: n.id, userId: user.id, label: user.public_id }, details: { noteId: n.id } });
    return n;
  });
  return json(201, { note: toAdminNote(db, note) });
}

function noteTarget(ctx: RequestContext) {
  const note = getNote(ctx.app.db, Number(ctx.params.noteId));
  if (!note) throw notFound();
  const owner = getUser(ctx.app.db, note.user_id);
  return { note, target: { type: 'note' as const, id: note.id, userId: note.user_id, label: owner?.public_id ?? null } };
}

function update(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const { note, target } = noteTarget(ctx);
  const v = new Fields();
  const body = readNoteBody(v, ctx.body);
  v.throwIfAny();
  const updated = tx(db, () => {
    const n = updateNote(db, note.id, body!, ctx.now);
    audit(ctx, { action: 'note.update', target, details: { noteId: note.id } });
    return n;
  });
  return json(200, { note: toAdminNote(db, updated) });
}

function remove(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const { note, target } = noteTarget(ctx);
  tx(db, () => {
    deleteNote(db, note.id);
    audit(ctx, { action: 'note.delete', target, details: { noteId: note.id } });
  });
  return noContent();
}

export const adminNoteRoutes: AppRoute[] = [
  route({ method: 'POST', path: '/v1/admin/users/:id/notes', auth: 'admin', params: { id: USER_REF_PARAM }, handler: create }),
  route({ method: 'PATCH', path: '/v1/admin/notes/:noteId', auth: 'admin', params: { noteId: ROWID_PARAM }, handler: update }),
  route({ method: 'DELETE', path: '/v1/admin/notes/:noteId', auth: 'admin', params: { noteId: ROWID_PARAM }, handler: remove }),
];
