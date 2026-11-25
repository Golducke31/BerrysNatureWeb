/* Checkout del Ebook Berry's Nature */
(() => {
  /* El layout SSR declara <base href="/">, así que un href="#comprar"
     se resuelve contra la raíz y te lleva a la home. Interceptamos el
     CTA y hacemos scroll al bloque de compra de ESTA página. */
  document.querySelectorAll('a[href="#comprar"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const destino = document.getElementById('comprar');
      if (!destino) return;
      event.preventDefault();
      destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + '#comprar');
    });
  });

  const form = document.querySelector('[data-ebook-checkout]');
  const feedback = document.querySelector('[data-ebook-feedback]');
  const button = form && form.querySelector('button[type="submit"]');
  if (!form) return;
  if (window.BerrysAPI && window.BerrysAPI.event) window.BerrysAPI.event('ebook_visto', { slug: form.slug ? form.slug.value.trim() : 'ebook-berrys-nature' });
  const setFeedback = (text, error = false) => { if (feedback) { feedback.textContent = text; feedback.classList.toggle('is-error', error); } };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = { nombre: form.nombre.value.trim(), email: form.email.value.trim(), slug: form.slug ? form.slug.value.trim() : 'ebook-berrys-nature' };
    if (button) { button.disabled = true; button.textContent = 'Preparando pago…'; }
    setFeedback('Te estamos llevando a Mercado Pago…');
    try {
      const response = await fetch('/api/ebook/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.init_point) throw new Error(result.message || 'No pudimos iniciar el pago.');
      window.location.assign(result.init_point);
    } catch (error) {
      setFeedback(error.message || 'No pudimos iniciar el pago. Probá de nuevo.', true);
      if (button) { button.disabled = false; button.textContent = 'Ir a pagar'; }
    }
  });
})();
