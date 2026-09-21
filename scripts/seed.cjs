#!/usr/bin/env node
/* ============================================================
   scripts/seed.cjs — Carga el contenido inicial en la base

   Toma el contenido que hoy vive en js/content-data.js y lo
   inserta en Postgres:
     - COMUNIDAD_HILOS   → forum_threads (+ respuestas reales)
     - BLOG_POSTS        → guides
     - COMUNIDAD_CATEGORIAS se usa solo para validar categorías

   Es idempotente: usa ON CONFLICT ... DO UPDATE, así que se puede
   correr varias veces sin duplicar nada.

   Uso:
     npm run seed
     npm run seed -- --force-threads   # sobreescribe títulos/cuerpos ya editados
   ============================================================ */
'use strict';

const path = require('node:path');
const { loadEnv, title, ok, info, warn, step, die, hasFlag, requireDb, c } = require('./lib/env.cjs');
loadEnv();
requireDb();

const db = require('../server/lib/db');

/* El contenido semilla vive en js/content-data.js (CommonJS export). */
const DATA = require(path.join(__dirname, '..', 'js', 'content-data.js'));

/* ============================================================
   Respuestas semilla — conversaciones reales por hilo.
   Se insertan con autor_id NULL: son contenido histórico de la
   comunidad, no de una cuenta registrada.
   ============================================================ */
const RESPUESTAS = {
  'hilo-conservante-barra': [
    { autor: 'Vale Emulsiones', cuerpo: 'Sin agua libre no hay crecimiento microbiano, pero la barra se contamina con las manos y el agua de la ducha. Si la vas a vender, un conservante suave igual corresponde. Yo uso benzoato + sorbato al 0,5 % total y duermo tranquila.' },
    { autor: 'Fran Jabones', cuerpo: 'Ojo con el secado: 48 h está bien si la humedad ambiente es baja. En invierno acá en Rosario necesito 72 h o la barra transpira y se pone blanda en el envase.' },
    { autor: 'Lu Formulaciones', cuerpo: 'Gracias a los dos. Voy a sumar el conservante y estirar el secado. El distribuidor me estaba apurando para que compre su base.' }
  ],
  'hilo-precio-100gr': [
    { autor: 'Dani Cosmética', cuerpo: 'Regla rápida: costo de materiales × 3 como piso. Si el frasco te sale $400 y la fórmula $600, no podés vender a menos de $3000 o estás trabajando gratis.' },
    { autor: 'Mica Emprende', cuerpo: 'El problema es que en mi zona la gente no paga eso. Estoy vendiendo a $2200 y me quedan $300 de margen.' },
    { autor: 'Dani Cosmética', cuerpo: 'Entonces el problema no es el precio, es el costo o el público. Revisá mermas y comprá materia prima por mayor, o apuntá a un cliente que valore la fórmula artesanal.' }
  ],
  'hilo-emulsion-cortada': [
    { autor: 'Lu Formulaciones', cuerpo: 'Casi siempre es temperatura: si agregás la fase acuosa a 70 °C sobre la oleosa a 45 °C, se corta. Las dos fases tienen que estar dentro de 5 °C entre sí.' },
    { autor: 'Vale Emulsiones', cuerpo: 'Y revisá el porcentaje de emulsionante. Con 3 % de alcohol cetílico no alcanza para sostener un 25 % de aceites. Yo iría a 4-5 % de un emulsionante real, tipo Olivem 1000.' },
    { autor: 'Vale Emulsiones', cuerpo: 'Otra causa típica: pH. Si la fase acuosa queda muy ácida, la emulsión se desestabiliza a los pocos días, no al instante.' }
  ],
  'hilo-soda-caustica': [
    { autor: 'Nacho Taller', cuerpo: 'Son "cenizas de soda": carbonato de sodio que se forma cuando la soda cáustica toca el aire. No es peligroso, es cosmético. Se va raspando o se vaporiza la superficie.' },
    { autor: 'Fran Jabones', cuerpo: 'Bajá la traza: si batís de más, la superficie queda más porosa y absorbe más CO2. Y tapá el molde con film apenas terminás de llenarlo.' }
  ],
  'hilo-molde-silicona': [
    { autor: 'Fran Jabones', cuerpo: 'Para arrancar, un molde de silicona de 6 cavidades tipo "bubble" es lo más agradecido: desmolda sin romper y no necesita lining.' },
    { autor: 'Nacho Taller', cuerpo: 'Si el molde es muy grande y hacés poca cantidad, el melt & pour se enfría antes de llegar al fondo. Mejor dos moldes chicos que uno grande.' }
  ],
  'hilo-proveedor-argan': [
    { autor: 'Sol Botánicos', cuerpo: 'Pedí siempre el certificado de análisis (CoA) y el análisis de ácidos grasos. El argán bueno tiene 75-80 % de ácido oleico y menos de 0,5 % de acidez libre.' },
    { autor: 'Dani Cosmética', cuerpo: 'Y desconfiá del precio muy bajo: el argán se corta con girasol y no lo notás hasta que la crema se enrancia a los dos meses.' }
  ],
  'hilo-etiqueta-anmat': [
    { autor: 'Cami Emprende', cuerpo: 'No. "Antiedad" es una alegación cosmética que ANMAT considera que roza lo terapéutico. Podés decir "con efecto reafirmante" o "ayuda a mejorar la apariencia de líneas finas", siempre que sea cosmético.' },
    { autor: 'Dani Cosmética', cuerpo: 'Y acordate que la etiqueta necesita: denominación, lista de ingredientes con nomenclatura INCI, contenido neto, lote, vencimiento y datos del responsable. Si falta uno, es observable.' }
  ],
  'hilo-habilitacion-cosmeticos': [
    { autor: 'Dani Cosmética', cuerpo: 'Vender a conocidos no te exime de la responsabilidad. La habilitación municipal suele ser simple (declaración de actividad), pero el registro del establecimiento ante ANMAT es lo que más tarda.' },
    { autor: 'Cami Emprende', cuerpo: 'Empezá por la habilitación municipal del taller en tu casa y consultá si tu municipio permite actividad cosmética en zona residencial. En muchos no se puede.' }
  ]
};

/* ============================================================
   Helpers
   ============================================================ */

function textArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((t) => typeof t === 'string' && t.trim());
}

/** Responde "¿existe la tabla?" sin reventar si la base está vacía. */
async function tableExists(name) {
  const row = await db.one(
    `SELECT 1 AS ok FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return Boolean(row);
}

/* ============================================================
   Seed de hilos + respuestas
   ============================================================ */
async function seedThreads(forceOverwrite) {
  const hilos = Array.isArray(DATA.COMUNIDAD_HILOS) ? DATA.COMUNIDAD_HILOS : [];
  if (!hilos.length) {
    warn('content-data.js no tiene COMUNIDAD_HILOS. Nada que hacer.');
    return { threads: 0, replies: 0 };
  }

  let threads = 0;
  let replies = 0;

  for (const h of hilos) {
    const respuestas = RESPUESTAS[h.id] || [];

    /* En el modo por defecto NO pisamos el cuerpo si el admin ya lo editó:
       solo insertamos si falta. Con --force-threads sobreescribimos. */
    if (forceOverwrite) {
      await db.query(
        `INSERT INTO forum_threads
           (id, title, body, author_id, author_name, category, icon,
            likes_count, views_count, replies_count, is_resolved, is_pinned, is_hidden)
         VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,0,$9,$10,false)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           category = EXCLUDED.category,
           icon = EXCLUDED.icon,
           likes_count = EXCLUDED.likes_count,
           views_count = EXCLUDED.views_count,
           is_resolved = EXCLUDED.is_resolved,
           is_pinned = EXCLUDED.is_pinned`,
        [
          h.id, h.titulo, h.cuerpo, h.autor, h.categoria, h.icon || 'chat',
          Number(h.likes) || 0, Number(h.vistas) || 0,
          Boolean(h.resuelto), Boolean(h.destacado)
        ]
      );
    } else {
      await db.query(
        `INSERT INTO forum_threads
           (id, title, body, author_id, author_name, category, icon,
            likes_count, views_count, replies_count, is_resolved, is_pinned, is_hidden)
         VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,0,$9,$10,false)
         ON CONFLICT (id) DO NOTHING`,
        [
          h.id, h.titulo, h.cuerpo, h.autor, h.categoria, h.icon || 'chat',
          Number(h.likes) || 0, Number(h.vistas) || 0,
          Boolean(h.resuelto), Boolean(h.destacado)
        ]
      );
    }
    threads++;

    /* Respuestas: id estable derivado del hilo + índice, así el seed
       es idempotente sin necesidad de una tabla auxiliar. */
    let n = 0;
    for (let i = 0; i < respuestas.length; i++) {
      const r = respuestas[i];
      const replyId = `${h.id}-r${i + 1}`;
      await db.query(
        `INSERT INTO forum_replies (id, thread_id, body, author_id, author_name, likes_count, is_hidden)
         VALUES ($1,$2,$3,NULL,$4,0,false)
         ON CONFLICT (id) DO NOTHING`,
        [replyId, h.id, r.cuerpo, r.autor]
      );
      n++;
    }
    replies += n;

    /* El contador refleja las respuestas reales que existen en la base. */
    await db.query(
      `UPDATE forum_threads
          SET replies_count = (SELECT count(*) FROM forum_replies
                                WHERE thread_id = $1 AND is_hidden = false)
        WHERE id = $1`,
      [h.id]
    );
  }

  return { threads, replies };
}

/* ============================================================
   Seed de guías
   ============================================================ */
async function seedGuides() {
  const posts = Array.isArray(DATA.BLOG_POSTS) ? DATA.BLOG_POSTS : [];
  if (!posts.length) {
    warn('content-data.js no tiene BLOG_POSTS. Nada que hacer.');
    return 0;
  }

  let count = 0;
  for (const g of posts) {
    const fecha = g.fecha ? new Date(`${g.fecha}T12:00:00Z`) : new Date();
    await db.query(
      `INSERT INTO guides
         (id, category, title, summary, body, author, route, reading_minutes,
          views, image, tags, icon, is_featured, is_pro, is_published, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12,$13,$14,true,$15)
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         body = EXCLUDED.body,
         author = EXCLUDED.author,
         route = EXCLUDED.route,
         reading_minutes = EXCLUDED.reading_minutes,
         image = EXCLUDED.image,
         tags = EXCLUDED.tags,
         icon = EXCLUDED.icon,
         is_featured = EXCLUDED.is_featured,
         is_pro = EXCLUDED.is_pro`,
      [
        g.id,
        g.categoria || 'General',
        g.titulo,
        g.resumen || '',
        g.leerMas || null,
        g.autor || "Equipo Berry's",
        g.ruta || 'Principiante',
        Number(g.lectura) || 5,
        Number(g.vistas) || 0,
        g.imagen || null,
        textArray(g.tags),
        g.icon || 'book',
        Boolean(g.destacado),
        Boolean(g.pro),
        fecha
      ]
    );
    count++;
  }
  return count;
}

/* ============================================================
   Programa principal
   ============================================================ */
async function main() {
  title("Berry's Nature — cargar contenido inicial");

  step('Verificando el esquema…');
  const hasThreads = await tableExists('forum_threads');
  const hasGuides = await tableExists('guides');
  if (!hasThreads || !hasGuides) {
    die(
      'Faltan tablas en la base.\n' +
      '  Ejecutá primero el esquema:\n' +
      '    psql "$DATABASE_URL" -f db/schema.sql\n' +
      '  o abrí el SQL Editor de Neon y pegá el contenido de db/schema.sql.'
    );
  }
  ok('Esquema encontrado.');

  const force = hasFlag('force-threads');

  step(`Insertando ${DATA.COMUNIDAD_HILOS.length} hilos y sus respuestas…`);
  const t = await seedThreads(force);
  ok(`${t.threads} hilos y ${t.replies} respuestas cargados.`);
  if (!force) {
    info('Los hilos existentes no se sobreescribieron. Usá --force-threads para pisarlos.');
  }

  step(`Insertando ${DATA.BLOG_POSTS.length} guías de la Academia…`);
  const g = await seedGuides();
  ok(`${g} guías cargadas.`);

  console.log('');
  console.log(c.bold('  Resumen'));
  console.log(`    Hilos:      ${t.threads}`);
  console.log(`    Respuestas: ${t.replies}`);
  console.log(`    Guías:      ${g}`);
  console.log('');
  info('Los contadores de vistas y likes son los históricos del contenido original.');
  info('Las respuestas se crearon con autor "semilla" (sin cuenta asociada).');
  console.log('');
}

main().catch((err) => {
  die('Falló el seed: ' + (err && err.message ? err.message : err));
});
