/* js/calculator.js — Berry's Calculator: Herramienta de formulación cosmética */

(function () {
  'use strict';

  let calcMode = 'grams-to-percent'; // 'grams-to-percent' | 'percent-to-grams'
  let ingredientCount = 0;

  /* =====================
     INIT
  ===================== */
  function init() {
    const toggleEl = document.getElementById('calcModeToggle');
    const addBtn = document.getElementById('addIngredientBtn');
    const totalQty = document.getElementById('totalQuantity');
    const contactForm = document.getElementById('contactForm');

    if (!toggleEl || !addBtn) return;

    toggleEl.addEventListener('click', toggleMode);
    toggleEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMode(); }
    });

    addBtn.addEventListener('click', addIngredientRow);
    if (totalQty) totalQty.addEventListener('input', recalculate);

    // Contact form
    if (contactForm) {
      contactForm.addEventListener('submit', handleContactSubmit);
    }

    // Start with 2 default rows
    addIngredientRow();
    addIngredientRow();
  }

  /* =====================
     TOGGLE MODE
  ===================== */
  function toggleMode() {
    calcMode = calcMode === 'grams-to-percent' ? 'percent-to-grams' : 'grams-to-percent';
    const isPercentMode = calcMode === 'percent-to-grams';

    const toggle = document.getElementById('calcModeToggle');
    const totalUnit = document.getElementById('totalUnit');
    const colHeader = document.getElementById('ingredientColHeader');
    const totalUnitLabel = document.getElementById('calcTotalUnit');

    if (toggle) {
      toggle.classList.toggle('toggled', isPercentMode);
      toggle.setAttribute('aria-checked', String(isPercentMode));
    }
    if (totalUnit) totalUnit.textContent = isPercentMode ? '%' : 'gramos';
    if (colHeader) colHeader.textContent = isPercentMode ? 'Porcentaje (%)' : 'Gramos (g)';
    if (totalUnitLabel) totalUnitLabel.textContent = isPercentMode ? 'g' : '%';

    document.querySelectorAll('.ingredient-value-input').forEach(input => {
      input.placeholder = isPercentMode ? 'Ej. 15.0' : 'Ej. 15';
    });

    recalculate();
  }

  /* =====================
     ADD INGREDIENT ROW
  ===================== */
  function addIngredientRow() {
    const list = document.getElementById('ingredientsList');
    if (!list) return;

    ingredientCount++;
    const rowId = `ing-row-${ingredientCount}`;
    const isPercentMode = calcMode === 'percent-to-grams';

    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.id = rowId;
    row.innerHTML = `
      <input 
        type="text" 
        class="ingredient-name-input calc-input" 
        placeholder="Nombre del ingrediente"
        aria-label="Nombre del ingrediente ${ingredientCount}">
      <input 
        type="number" 
        class="ingredient-value-input calc-input" 
        min="0" step="0.01" 
        placeholder="${isPercentMode ? 'Ej. 15.0' : 'Ej. 15'}"
        aria-label="${isPercentMode ? 'Porcentaje' : 'Gramos'} del ingrediente ${ingredientCount}">
      <button 
        class="remove-ingredient-btn" 
        aria-label="Eliminar ingrediente ${ingredientCount}"
        data-row-id="${rowId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    row.querySelector('.ingredient-value-input').addEventListener('input', recalculate);
    row.querySelector('.remove-ingredient-btn').addEventListener('click', () => {
      row.classList.add('removing');
      setTimeout(() => { row.remove(); recalculate(); }, 260);
    });

    list.appendChild(row);
    requestAnimationFrame(() => row.classList.add('row-visible'));
    recalculate();
    return row;
  }

  /* =====================
     RECALCULATE
  ===================== */
  function recalculate() {
    const isPercentMode = calcMode === 'percent-to-grams';
    const totalQtyInput = document.getElementById('totalQuantity');
    const totalQty = parseFloat(totalQtyInput?.value) || 0;

    let accumulated = 0;
    document.querySelectorAll('.ingredient-value-input').forEach(input => {
      accumulated += parseFloat(input.value) || 0;
    });

    const totalValueEl = document.getElementById('calcTotalValue');
    const progressBar = document.getElementById('calcProgressBar');
    const totalStatus = document.getElementById('totalStatus');

    if (totalValueEl) totalValueEl.textContent = accumulated.toFixed(2);

    // Progress: for grams-to-percent → max is 100%; for percent-to-grams → max is totalQty grams
    const maxVal = isPercentMode ? totalQty : 100;
    const pct = maxVal > 0 ? Math.min((accumulated / maxVal) * 100, 100) : 0;

    if (progressBar) {
      progressBar.style.width = `${pct}%`;
      progressBar.classList.remove('progress-ok', 'progress-over', 'progress-under');
      if (maxVal > 0) {
        if (Math.abs(accumulated - maxVal) < 0.005) progressBar.classList.add('progress-ok');
        else if (accumulated > maxVal) progressBar.classList.add('progress-over');
        else progressBar.classList.add('progress-under');
      }
    }

    if (totalStatus) {
      if (maxVal <= 0) {
        totalStatus.textContent = '';
        totalStatus.className = 'total-status';
      } else if (Math.abs(accumulated - maxVal) < 0.005) {
        totalStatus.innerHTML = iconSvg('check') + ' Perfecto';
        totalStatus.className = 'total-status status-ok';
      } else if (accumulated > maxVal) {
        totalStatus.textContent = `+${(accumulated - maxVal).toFixed(2)} exceso`;
        totalStatus.className = 'total-status status-over';
      } else {
        totalStatus.textContent = `${(maxVal - accumulated).toFixed(2)} restante`;
        totalStatus.className = 'total-status status-under';
      }
    }
  }

  /* =====================
     CONTACT FORM
  ===================== */
  function showContactSuccess(btn) {
    if (!btn) return;
    btn.innerHTML = iconSvg('check') + ' Mensaje enviado';
    btn.style.background = '#5E9E57';
    btn.disabled = true;
    if (window.toast) window.toast('¡Gracias! Te responderemos pronto.', 'check');
    setTimeout(() => {
      btn.textContent = 'Enviar mensaje';
      btn.style.background = '';
      btn.disabled = false;
      document.getElementById('contactForm')?.reset();
    }, 3500);
  }

  function handleContactSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('contactSubmitBtn');
    const name = document.getElementById('contactName')?.value?.trim();
    const email = document.getElementById('contactEmail')?.value?.trim();
    const message = document.getElementById('contactMessage')?.value?.trim();

    if (!name || !email || !message) {
      if (window.toast) window.toast('Completá nombre, email y mensaje.', 'warning');
      return;
    }

    // Endpoint configurable:
    //   window.BERRYS_CONTACT_ENDPOINT = 'https://formspree.io/f/xxxxxx'
    //   window.BERRYS_CONTACT_METHOD   = 'POST' (default)
    // Sin endpoint configurado, la confirmación es 100% local (prototipo).
    const endpoint = window.BERRYS_CONTACT_ENDPOINT;
    const payload = {
      name, email, message,
      _subject: 'Nuevo contacto desde Berry\'s Nature',
      _source: 'web-prototipo'
    };

    if (!endpoint) {
      showContactSuccess(btn);
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    fetch(endpoint, {
      method: window.BERRYS_CONTACT_METHOD || 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); })
      .then(() => showContactSuccess(btn))
      .catch(() => {
        // Degradación: nunca dejamos al usuario sin confirmación.
        if (window.toast) window.toast('No pudimos enviar ahora; lo intentaremos de nuevo.', 'warning');
        showContactSuccess(btn);
      });
  }

  /* =====================
     API PÚBLICA
     Permite precargar una fórmula desde las tarjetas de recetas
     (js/community.js). Ej:
       BerrysCalculator.loadFormula({ name, total, ingredients:[{name,value}] })
     Los valores se cargan como PORCENTAJES, así que nos aseguramos
     de estar en el modo que muestra columnas de %.
     ===================== */
  function clearRows() {
    const list = document.getElementById('ingredientsList');
    if (!list) return;
    list.querySelectorAll('.ingredient-row').forEach(row => row.remove());
  }

  window.BerrysCalculator = {
    // Lectura del estado actual (lo usa el desbloqueo PRO para guardar/exportar)
    getFormula() {
      const isPercentMode = calcMode === 'percent-to-grams';
      const nameEl = document.getElementById('formulaName');
      const totalEl = document.getElementById('totalQuantity');
      const ingredients = [];
      document.querySelectorAll('.ingredient-row').forEach((row) => {
        const n = row.querySelector('.ingredient-name-input')?.value?.trim() || '';
        const v = parseFloat(row.querySelector('.ingredient-value-input')?.value) || 0;
        ingredients.push({ name: n, value: v });
      });
      return {
        name: nameEl?.value?.trim() || '',
        total: parseFloat(totalEl?.value) || 0,
        mode: isPercentMode ? 'percent' : 'grams',
        ingredients
      };
    },

    loadFormula(payload) {
      if (!payload) return;
      const { name, total, ingredients = [] } = payload;

      // Columnas en % ⇒ modo 'percent-to-grams'
      if (calcMode !== 'percent-to-grams') toggleMode();

      const nameInput = document.getElementById('formulaName');
      if (nameInput && name) nameInput.value = name;

      const totalInput = document.getElementById('totalQuantity');
      if (totalInput) totalInput.value = total != null ? total : 100;

      clearRows();
      ingredients.forEach(ing => {
        const row = addIngredientRow();
        if (!row) return;
        const nameEl = row.querySelector('.ingredient-name-input');
        const valueEl = row.querySelector('.ingredient-value-input');
        if (nameEl) nameEl.value = ing.name || '';
        if (valueEl) valueEl.value = ing.value != null ? ing.value : '';
      });

      recalculate();
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
