'use strict';

const DEFAULT_SITE = 'https://berrysnature.com.ar';

function siteUrl() {
  const value = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return /^https:\/\//i.test(value) && !/localhost|127\.0\.0\.1/i.test(value) ? value : DEFAULT_SITE;
}

function organization(url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${url}/#organization`,
    name: "Berry's Nature",
    url: `${url}/`,
    logo: { '@type': 'ImageObject', url: `${url}/assets/logo-512.webp`, width: 512, height: 512 },
    areaServed: { '@type': 'Country', name: 'Argentina' },
    knowsAbout: ['cosmética natural', 'jabonería artesanal', 'formulación cosmética', 'ingredientes botánicos']
  };
}

function website(url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}/#website`,
    name: "Berry's Nature",
    url: `${url}/`,
    inLanguage: 'es-AR',
    publisher: { '@id': `${url}/#organization` }
  };
}

function webpage({ url, title, description, image }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: { '@id': `${siteUrl()}/#website` },
    about: { '@id': `${siteUrl()}/#organization` },
    inLanguage: 'es-AR'
  };
  if (image) data.primaryImageOfPage = { '@type': 'ImageObject', url: image };
  return data;
}

function globalBlocks(options = {}) {
  const url = siteUrl();
  return [organization(url), website(url), webpage({ ...options, url: options.url || url })];
}

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function script(block, marker) {
  return `  <script type="application/ld+json" data-schema-global="${marker || 'true'}">\n  ${jsonLd(block)}\n  </script>`;
}

function meta(html, pattern, fallback = '') {
  const match = html.match(pattern);
  return match ? match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : fallback;
}

/** Inyecta identidad y WebPage en los HTML estáticos. Es idempotente. */
function injectGlobal(html) {
  if (html.includes('data-schema-global="organization"')) return html;
  const url = meta(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i, siteUrl());
  const title = meta(html, /<title[^>]*>([^<]+)<\/title>/i, "Berry's Nature");
  const description = meta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i, 'Cosmética natural, jabonería artesanal y aprendizaje consciente.');
  const image = meta(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i, '');
  const existingOrg = /"@type"\s*:\s*"Organization"/.test(html);
  const existingWebsite = /"@type"\s*:\s*"WebSite"/.test(html);
  const blocks = [];
  if (!existingOrg) blocks.push(script(organization(siteUrl()), 'organization'));
  if (!existingWebsite) blocks.push(script(website(siteUrl()), 'website'));
  if (!/"@type"\s*:\s*"WebPage"/.test(html)) blocks.push(script(webpage({ url, title, description, image }), 'webpage'));
  if (!blocks.length) return html;
  return html.replace(/<\/head>/i, `${blocks.join('\n')}\n</head>`);
}

module.exports = { siteUrl, organization, website, webpage, globalBlocks, injectGlobal };
