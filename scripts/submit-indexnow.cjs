#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://berrysnature.com.ar';
const SITE_URL = new URL(SITE);
const details = require('../content/glossary-details.json');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const routeArgs = args.filter((arg) => arg !== '--dry-run');

function loadKey() {
  const files = fs.readdirSync(ROOT).filter((name) => /^[a-f0-9]{32}\.txt$/i.test(name));
  if (files.length !== 1) {
    throw new Error(`Se esperaba exactamente un archivo público de clave IndexNow en la raíz; se encontraron ${files.length}.`);
  }
  const file = files[0];
  const key = file.slice(0, -4);
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8').trim();
  if (content !== key) throw new Error(`${file} no contiene la misma clave que su nombre.`);
  return { file, key };
}

function getUrls() {
  const values = routeArgs.length
    ? routeArgs
    : details.map((item) => `/glosario/${item.slug}`);
  const unique = new Set();

  for (const value of values) {
    let url;
    try { url = new URL(value, SITE); } catch (error) {
      throw new Error(`URL inválida: ${value}`);
    }
    if (url.protocol !== 'https:' || url.origin !== SITE_URL.origin || url.username || url.password || url.search || url.hash) {
      throw new Error(`Usá una URL canónica HTTPS de ${SITE_URL.host}, sin credenciales, parámetros ni fragmentos: ${value}`);
    }
    unique.add(url.href);
  }

  if (!unique.size) throw new Error('No hay URLs para enviar.');
  if (unique.size > 10000) throw new Error('IndexNow admite hasta 10.000 URLs por envío.');
  return [...unique];
}

async function main() {
  const { file, key } = loadKey();
  const urlList = getUrls();
  const keyLocation = `${SITE}/${file}`;

  if (dryRun) {
    const copied = fs.existsSync(path.join(ROOT, 'dist', file));
    console.log(`Simulación: ${urlList.length} URL(s) listas para IndexNow.`);
    console.log(`Clave local: ${file}; copiada a dist/: ${copied ? 'sí' : 'no'}.`);
    console.log('No se hizo ninguna solicitud externa.');
    for (const url of urlList) console.log(url);
    return;
  }

  const keyResponse = await fetch(keyLocation, { redirect: 'follow' });
  if (!keyResponse.ok) {
    throw new Error(`La clave aún no está publicada en ${keyLocation} (HTTP ${keyResponse.status}). Hacé deploy antes del envío.`);
  }
  const remoteKey = (await keyResponse.text()).trim();
  if (remoteKey !== key) throw new Error('La clave pública del sitio no coincide con la clave local.');

  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: SITE_URL.host,
      key,
      keyLocation,
      urlList
    })
  });
  const responseText = (await response.text()).trim();
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow respondió HTTP ${response.status}${responseText ? `: ${responseText}` : ''}.`);
  }
  console.log(`IndexNow recibió ${urlList.length} URL(s) de ${SITE} (HTTP ${response.status}).`);
  if (response.status === 202) console.log('La validación de la clave quedó pendiente.');
  console.log('La recepción no garantiza rastreo, indexación ni posicionamiento.');
}

main().catch((error) => {
  console.error(`IndexNow: ${error.message}`);
  process.exitCode = 1;
});
