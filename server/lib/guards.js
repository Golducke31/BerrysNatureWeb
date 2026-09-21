/* ============================================================
   server/lib/guards.js — Guardias de sesión y permisos
   ============================================================ */
'use strict';

const auth = require('./auth');
const { fail } = require('./http');

/** Exige sesión válida. Devuelve {session,user} o responde 401 y null. */
async function requireUser(req, res, scope = 'public') {
  const current = await auth.getSession(req, scope);
  if (!current) {
    fail(res, 401, 'unauthenticated', 'Necesitás iniciar sesión.');
    return null;
  }
  return current;
}

/** Exige un rol mínimo ('moderator' | 'admin'). */
async function requireRole(req, res, role, scope = 'public') {
  const current = await requireUser(req, res, scope);
  if (!current) return null;
  if (!auth.isAtLeast(current.user, role)) {
    fail(res, 403, 'forbidden', 'No tenés permisos para esta acción.');
    return null;
  }
  return current;
}

/** ¿Es el autor del contenido, o tiene rango de moderador? */
function isOwnerOrMod(user, ownerId) {
  if (!user) return false;
  if (auth.isAtLeast(user, 'moderator')) return true;
  return Boolean(ownerId) && String(ownerId) === String(user.id);
}

module.exports = { requireUser, requireRole, isOwnerOrMod };
