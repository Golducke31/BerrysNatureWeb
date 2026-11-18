'use strict';
const db = require('../lib/db');
const V = require('../lib/validate');
const audit = require('../lib/audit');
const csrf = require('../lib/csrf');
const guards = require('../lib/guards');
const { json, fail, notFound, getClientIp } = require('../lib/http');

const ARRAY_FIELDS = ['topics', 'benefits', 'faq'];
const TEXT_FIELDS = ['title', 'description', 'seo_title', 'seo_description', 'excerpt', 'long_description', 'audience', 'level', 'author', 'publisher', 'language', 'drive_url', 'cover_image'];

function arrayVal(value, field) {
  if (value === undefined || value === null || value === '') return [];
  let parsed = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch (e) { throw new Error(`${field} debe ser JSON válido`); } }
  if (!Array.isArray(parsed)) throw new Error(`${field} debe ser una lista`);
  if (parsed.length > 30) throw new Error(`${field} tiene demasiados elementos`);
  return parsed.map((item) => {
    if (typeof item === 'string') return item.trim().slice(0, 300);
    if (item && typeof item === 'object') return { q: String(item.q || '').trim().slice(0, 300), a: String(item.a || '').trim().slice(0, 1200) };
    return String(item || '').slice(0, 300);
  }).filter((item) => typeof item === 'string' ? item : item.q && item.a);
}
function row(r) {
  return {
    id: r.id, slug: r.slug, title: r.title, description: r.description, price: Number(r.price), drive_url: r.drive_url,
    cover_image: r.cover_image, active: Boolean(r.active), created_at: r.created_at, updated_at: r.updated_at,
    seo_title: r.seo_title || '', seo_description: r.seo_description || '', excerpt: r.excerpt || '', long_description: r.long_description || '',
    audience: r.audience || '', level: r.level || '', topics: r.topics || [], benefits: r.benefits || [], faq: r.faq || [],
    author: r.author || "Berry's Nature", publisher: r.publisher || "Berry's Nature", language: r.language || 'es-AR',
    page_count: r.page_count == null ? null : Number(r.page_count), published_at: r.published_at
  };
}
async function metrics(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin'); if (!current) return;
  const [totals, byDay, recent, byEbook, engagement] = await Promise.all([
    db.one(`SELECT count(*)::int AS orders, count(*) FILTER (WHERE status='approved')::int AS approved, count(*) FILTER (WHERE status='pending')::int AS pending, count(*) FILTER (WHERE status='approved' AND email_sent_at IS NULL)::int AS undelivered, coalesce(sum(amount) FILTER (WHERE status='approved'),0)::bigint AS revenue FROM ebook_orders`),
    db.query(`SELECT to_char(d.day,'YYYY-MM-DD') AS day, coalesce(count(o.id) FILTER (WHERE o.status='approved'),0)::int AS orders, coalesce(sum(o.amount) FILTER (WHERE o.status='approved'),0)::bigint AS revenue FROM generate_series((now()-interval '29 days')::date, now()::date, interval '1 day') d(day) LEFT JOIN ebook_orders o ON o.created_at::date=d.day GROUP BY d.day ORDER BY d.day`),
    db.query(`SELECT o.id, o.email, o.amount, o.status, o.email_sent_at, o.created_at, e.title FROM ebook_orders o LEFT JOIN ebooks e ON e.id=o.ebook_id ORDER BY o.created_at DESC LIMIT 20`),
    db.query(`SELECT e.id, e.title, e.slug, count(o.id) FILTER (WHERE o.status='approved')::int AS approved, coalesce(sum(o.amount) FILTER (WHERE o.status='approved'),0)::bigint AS revenue FROM ebooks e LEFT JOIN ebook_orders o ON o.ebook_id=e.id GROUP BY e.id ORDER BY revenue DESC, e.title`),
    db.query(`SELECT metadata->>'slug' AS slug, event_name, count(*)::int AS n FROM events WHERE event_name IN ('ebook_visto','ebook_checkout_iniciado') AND created_at > now() - interval '30 days' GROUP BY metadata->>'slug', event_name`)
  ]);
  const engagementBySlug = {};
  engagement.forEach((item) => { const key = item.slug || ''; engagementBySlug[key] = engagementBySlug[key] || {}; engagementBySlug[key][item.event_name] = Number(item.n) || 0; });
  json(res, 200, { totals: { orders: Number(totals.orders), approved: Number(totals.approved), pending: Number(totals.pending), undelivered: Number(totals.undelivered), revenue: Number(totals.revenue) }, byDay, recent, byEbook: byEbook.map((item) => ({ ...item, views: engagementBySlug[item.slug]?.ebook_visto || 0, checkouts: engagementBySlug[item.slug]?.ebook_checkout_iniciado || 0 })) });
}
async function list(req, res) { const current = await guards.requireRole(req,res,'admin','admin'); if (!current) return; json(res,200,{items:(await db.query('SELECT * FROM ebooks ORDER BY active DESC, created_at DESC')).map(row)}); }
function buildPayload(body, isUpdate, old) {
  const p = {};
  if (!isUpdate || body.title !== undefined) p.title = V.str(body.title, { min: 2, max: 180, field: 'título' });
  if (!isUpdate || body.slug !== undefined) p.slug = V.slug(body.slug || body.title, 80);
  if (!isUpdate || body.description !== undefined) p.description = V.str(body.description, { max: 4000, required: false });
  if (!isUpdate || body.price !== undefined) p.price = V.int(body.price, { min: 0, max: 99999999 });
  for (const key of ['drive_url', 'cover_image']) if (!isUpdate || body[key] !== undefined) p[key] = V.clean(body[key]).slice(0, key === 'drive_url' ? 1000 : 500);
  if (!isUpdate || body.active !== undefined) p.active = V.bool(body.active, isUpdate ? old.active : true);
  for (const key of TEXT_FIELDS.slice(2, 11)) if (body[key] !== undefined || !isUpdate) p[key] = V.clean(body[key]).slice(0, key === 'long_description' ? 12000 : 1000);
  for (const key of ARRAY_FIELDS) if (body[key] !== undefined || !isUpdate) p[key] = JSON.stringify(arrayVal(body[key], key));
  if (body.page_count !== undefined || !isUpdate) p.page_count = body.page_count === '' || body.page_count == null ? null : V.int(body.page_count, { min: 1, max: 10000 });
  if (body.published_at !== undefined || !isUpdate) p.published_at = body.published_at ? new Date(body.published_at) : null;
  return p;
}
async function create(req,res,body) { const current=await guards.requireRole(req,res,'admin','admin'); if(!current)return; if(!csrf.assertValid(req,res,current.session,body))return; try { const p=buildPayload(body,false,{}); const keys=Object.keys(p), vals=keys.map(k=>p[k]); const r=await db.one(`INSERT INTO ebooks (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,vals); await audit.log({actor:current.user,action:'admin.ebook.create',entityType:'ebook',entityId:r.id,payload:{title:p.title,slug:p.slug},ip:getClientIp(req)}); json(res,201,{ebook:row(r)}); } catch(e) { console.error('[ebook-admin] create',e.message); return fail(res,400,'invalid_input',e.message || 'No se pudo crear el ebook.'); } }
async function update(req,res,{id},body) { const current=await guards.requireRole(req,res,'admin','admin'); if(!current)return; if(!csrf.assertValid(req,res,current.session,body))return; const old=await db.one('SELECT * FROM ebooks WHERE id=$1',[id]); if(!old)return notFound(res); try { const p=buildPayload(body,true,old), keys=Object.keys(p); if(!keys.length)return fail(res,400,'invalid_input','No enviaste cambios.'); const vals=keys.map(k=>p[k]); vals.push(id); const r=await db.one(`UPDATE ebooks SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')}, updated_at=now() WHERE id=$${vals.length} RETURNING *`,vals); await audit.log({actor:current.user,action:'admin.ebook.update',entityType:'ebook',entityId:id,payload:p,ip:getClientIp(req)}); json(res,200,{ebook:row(r)}); } catch(e) { console.error('[ebook-admin] update',e.message); return fail(res,400,'invalid_input',e.message || 'No se pudo guardar el ebook.'); } }
module.exports={metrics,list,create,update};
