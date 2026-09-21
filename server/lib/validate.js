/* ============================================================
   server/lib/validate.js — Validación y coerción de payloads

   Sin dependencias externas. Cada helper lanza ValidationError
   con un mensaje en español, listo para devolver al cliente.
   ============================================================ */
'use strict';

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.code = 'invalid_input';
    this.field = field;
  }
}

function fail(message, field) {
  throw new ValidationError(message, field);
}

/** Quita caracteres de control y normaliza espacios. */
function clean(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

/** String obligatorio/opcional con largo controlado. */
function str(value, { min = 0, max = 5000, required = true, field = 'campo' } = {}) {
  const v = clean(value);
  if (!v) {
    if (required) fail(`El campo "${field}" es obligatorio.`, field);
    return '';
  }
  if (v.length < min) fail(`El campo "${field}" es demasiado corto.`, field);
  if (v.length > max) fail(`El campo "${field}" supera el máximo de ${max} caracteres.`, field);
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function email(value) {
  const v = clean(value).toLowerCase();
  if (!v) fail('El email es obligatorio.', 'email');
  if (v.length > 254 || !EMAIL_RE.test(v)) fail('El email no es válido.', 'email');
  return v;
}

/** Contraseña: mínimo 10 caracteres. */
function password(value, { min = 10, max = 200 } = {}) {
  const v = String(value == null ? '' : value);
  if (!v) fail('La contraseña es obligatoria.', 'password');
  if (v.length < min) fail(`La contraseña debe tener al menos ${min} caracteres.`, 'password');
  if (v.length > max) fail('La contraseña es demasiado larga.', 'password');
  return v;
}

function int(value, { min = 0, max = Number.MAX_SAFE_INTEGER, def = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (def !== null) return def;
    fail('Se esperaba un número.', 'numero');
  }
  const n = Number(value);
  if (!Number.isFinite(n)) fail('Se esperaba un número válido.', 'numero');
  const i = Math.trunc(n);
  if (i < min || i > max) fail(`El número debe estar entre ${min} y ${max}.`, 'numero');
  return i;
}

function bool(value, def = false) {
  if (value === undefined || value === null || value === '') return def;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  if (['1', 'true', 'si', 'sí', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return def;
}

function oneOf(value, allowed, field = 'campo') {
  const v = clean(value);
  if (!allowed.includes(v)) {
    fail(`El campo "${field}" debe ser uno de: ${allowed.join(', ')}.`, field);
  }
  return v;
}

/** Convierte un texto en id tipo slug: "Hola Mundo!" → "hola-mundo" */
function slug(value, max = 48) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // saca acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'item';
}

/** Genera un id único legible: prefijo-slug-xxxx */
function makeId(prefix, title) {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${slug(title, 40)}-${rand}`;
}

/** Sanitiza un array de tags. */
function tags(value, max = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map(t => clean(t).toLowerCase().slice(0, 24))
    .filter(Boolean)
    .slice(0, max);
}

module.exports = {
  ValidationError, fail, clean, str, email, password, int, bool, oneOf, slug, makeId, tags
};
