/* ============================================================
   server/lib/serialize.js — Filas de la base → objetos de la API

   Clave de diseño: la API devuelve EXACTAMENTE las mismas claves
   en español que ya usaba js/content-data.js (titulo, cuerpo,
   respuestas, vistas, ruta, leerMas, ...). Así el frontend actual
   casi no necesita cambios: solo cambia de dónde saca los datos.
   ============================================================ */
'use strict';

/** Texto relativo en español rioplatense: "hace 2 h", "hace 3 días". */
function relativeTime(value) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hace 1 día';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'hace 1 mes';
  if (months < 12) return `hace ${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'hace 1 año' : `hace ${years} años`;
}

function thread(row) {
  return {
    id: row.id,
    titulo: row.title,
    cuerpo: row.body,
    autor: row.author_name,
    autorId: row.author_id,
    autorAvatar: row.author_avatar || '',
    categoria: row.category,
    icon: row.icon,
    likes: row.likes_count,
    vistas: row.views_count,
    respuestas: row.replies_count,
    resuelto: row.is_resolved,
    destacado: row.is_pinned,
    oculto: row.is_hidden,
    tiempo: relativeTime(row.created_at),
    createdAt: row.created_at
  };
}

function reply(row) {
  return {
    id: row.id,
    hiloId: row.thread_id,
    cuerpo: row.body,
    autor: row.author_name,
    autorId: row.author_id,
    autorAvatar: row.author_avatar || '',
    likes: row.likes_count,
    oculto: row.is_hidden,
    tiempo: relativeTime(row.created_at),
    createdAt: row.created_at
  };
}

/**
 * @param {object} row
 * @param {boolean} withBody  false para guías PRO en peticiones públicas
 */
function guide(row, withBody = true) {
  return {
    id: row.id,
    categoria: row.category,
    titulo: row.title,
    resumen: row.summary,
    leerMas: withBody ? row.body : null,
    autor: row.author,
    ruta: row.route,
    lectura: row.reading_minutes,
    vistas: row.views,
    imagen: row.image,
    tags: row.tags || [],
    icon: row.icon,
    destacado: row.is_featured,
    pro: row.is_pro,
    publicada: row.is_published,
    fecha: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null,
    tiempo: relativeTime(row.created_at),
    createdAt: row.created_at
  };
}

/** Usuario expuesto al público (nunca hash, salt ni secretos). */
function userPublic(row) {
  return {
    id: row.id,
    nombre: row.display_name,
    email: row.email,
    rol: row.role,
    estado: row.status,
    avatar: row.avatar_url || '',
    creado: row.created_at
  };
}

/**
 * Perfil público de un usuario. NUNCA incluye email ni datos internos:
 * la decisión D6 (privacidad primero) exige exponer lo mínimo.
 * @param {object} row
 * @param {{hilos?:number, respuestas?:number}} [counts]
 */
function userProfile(row, counts = {}) {
  return {
    id: row.id,
    nombre: row.display_name,
    avatar: row.avatar_url || '',
    bio: row.bio || '',
    emprendimiento: row.emprendimiento || '',
    rol: row.role,
    creado: row.created_at,
    hilos: (counts && counts.hilos) || 0,
    respuestas: (counts && counts.respuestas) || 0
  };
}

/** Usuario propio (incluye datos que solo él debe ver). */
function userSelf(row) {
  return {
    id: row.id,
    nombre: row.display_name,
    email: row.email,
    rol: row.role,
    avatar: row.avatar_url || '',
    bio: row.bio || '',
    emprendimiento: row.emprendimiento || '',
    permisos: row.permissions || {}
  };
}

module.exports = { relativeTime, thread, reply, guide, userPublic, userProfile, userSelf };
