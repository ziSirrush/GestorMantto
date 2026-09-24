(function(){
  'use strict';

  // [Aster | 2026-09-14 | ASTER-MG | FIX COBRANZA COR MAIN PPNS V002]
  if(window.ManttoCobranzaCorEstadosCuenta) return;

  const ROUTE = 'cobranza-estados-cuenta';
  const LIST_PATH = '/api/cobranza-cor/estados-cuenta';
  const SEARCH_DELAY_MS = 350;

  const state = {
    root:null,
    records:[],
    catalogYears:[],
    catalogContractual:[],
    selectedPpns:null,
    detail:null,
    filters:{ q:'', anio:'', contractual:'' },
    listSequence:0,
    detailSequence:0,
    searchTimer:null,
    view:'list'
  };

  function currentNavigation_cor(){
    if(!window.ManttoRouter || typeof window.ManttoRouter.getCurrent !== 'function'){
      return { route:'', payload:null };
    }
    const current = window.ManttoRouter.getCurrent() || {};
    return { route:String(current.route || ''), payload:current.payload || null };
  }

  function isActive_cor(){ return currentNavigation_cor().route === ROUTE; }
  function currentPayload_cor(){ return currentNavigation_cor().payload; }

  function escapeHtml_cor(value){
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function text_cor(value, fallback='—'){
    if(value === null || value === undefined) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  function number_cor(value){
    if(value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatInteger_cor(value){
    const parsed = number_cor(value);
    return parsed === null ? '—' : new Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(parsed);
  }

  function formatPercent_cor(value){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    return new Intl.NumberFormat('es-MX',{minimumFractionDigits:0,maximumFractionDigits:2}).format(parsed * 100) + '%';
  }

  function formatAmount_cor(value){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    return new Intl.NumberFormat('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}).format(parsed);
  }

  function formatMoney_cor(value,currency){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    const code = String(currency || '').trim().toUpperCase();
    if(/^[A-Z]{3}$/.test(code) && code !== 'SIN_MONEDA'){
      try{
        return new Intl.NumberFormat('es-MX',{style:'currency',currency:code,minimumFractionDigits:2,maximumFractionDigits:2}).format(parsed);
      }catch(_error){}
    }
    return formatAmount_cor(parsed) + (code && code !== 'SIN_MONEDA' ? ' ' + code : '');
  }

  function formatDate_cor(value){
    const raw = String(value || '').trim();
    if(!raw) return '—';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : raw;
  }

  function formatDateTimeNow_cor(){
    return new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
  }

  function statusClass_cor(value){
    const status = String(value || '').trim().toUpperCase();
    if(!status) return 'is-neutral';
    if(status.includes('CORRIENTE') || status.includes('AL DIA') || status.includes('AL DÍA') || status.includes('PAGAD')) return 'is-ok';
    if(status.includes('VENC') || status.includes('NO PAG') || status.includes('ADEUD') || status.includes('ATRAS')) return 'is-danger';
    if(status.includes('PROCESO') || status.includes('ESPERA') || status.includes('REVIS')) return 'is-warn';
    return 'is-neutral';
  }

  function apiGet_cor(path,options){
    if(!window.ManttoHttp || typeof window.ManttoHttp.get !== 'function'){
      return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    }
    return window.ManttoHttp.get(path,options || {});
  }

  function ensureStyles_cor(){
    if(document.getElementById('ccor-ec-main-fuente-v001-style')) return;
    const style = document.createElement('style');
    style.id = 'ccor-ec-main-fuente-v001-style';
    style.textContent = `
      .ccor-ec-projects-table.ccor-ec-main-v001{min-width:1480px;border-collapse:separate;border-spacing:0}
      .ccor-ec-main-v001 thead th{background:#17365d;color:#fff;font-size:11px;line-height:1.15;text-transform:uppercase;letter-spacing:.02em;padding:9px 8px;white-space:nowrap;border-color:#294a73}
      .ccor-ec-main-v001 tbody td{font-size:12px;line-height:1.2;padding:8px 8px;vertical-align:middle;white-space:nowrap}
      .ccor-ec-main-v001 tbody tr{cursor:pointer}
      .ccor-ec-main-v001 tbody tr:hover td{background:rgba(23,54,93,.06)}
      .ccor-ec-main-v001 .ccor-ec-main-project,.ccor-ec-main-v001 .ccor-ec-main-client{white-space:normal;min-width:180px;max-width:300px}
      .ccor-ec-main-v001 .ccor-ec-main-initials{text-align:center;font-weight:700;min-width:72px}
      .ccor-ec-main-v001 .ccor-ec-main-count{text-align:center;font-variant-numeric:tabular-nums}
      .ccor-ec-main-v001 .ccor-ec-main-ppns{font-weight:800}
      .ccor-ec-main-v001 .ccor-ec-main-money{text-align:center;font-weight:700}
      .ccor-ec-main-v001 .ccor-ec-main-account{text-align:center}
      .ccor-ec-main-v001 .ccor-ec-main-contractual{min-width:120px}
      .ccor-ec-filters.ccor-ec-main-filters{grid-template-columns:minmax(180px,.7fr) minmax(180px,.8fr) minmax(280px,1.6fr) auto}
      .ccor-ec-project-header.ccor-ec-main-detail-header{grid-template-columns:repeat(4,minmax(140px,1fr))}
      @media(max-width:900px){
        .ccor-ec-filters.ccor-ec-main-filters{grid-template-columns:1fr}
        .ccor-ec-project-header.ccor-ec-main-detail-header{grid-template-columns:1fr 1fr}
      }
      @media(max-width:560px){.ccor-ec-project-header.ccor-ec-main-detail-header{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function buildListPath_cor(){
    const params = new URLSearchParams();
    if(state.filters.q) params.set('q',state.filters.q);
    if(state.filters.anio) params.set('anio',state.filters.anio);
    if(state.filters.contractual) params.set('contractual',state.filters.contractual);
    const query = params.toString();
    return LIST_PATH + (query ? '?' + query : '');
  }

  function errorMessage_cor(error,context){
    const status = Number(error && error.status);
    if(status === 401) return 'La sesión ya no está disponible. Vuelve a iniciar sesión.';
    if(status === 403) return 'No tienes permiso o alcance de información para consultar Cobranza COR.';
    if(status === 404 && context === 'list') return 'El endpoint de Estados de Cuenta no está disponible en este entorno.';
    if(status === 404) return 'El PPNS ya no existe en FUENTE o quedó fuera de tu alcance autorizado.';
    return text_cor(error && error.message,'No fue posible consultar Estados de Cuenta.');
  }

  function renderListShell_cor(){
    const root = state.root;
    if(!root) return;
    state.view = 'list';
    root.innerHTML = `
      <div class="ccor-ec-page ccor-ec-list-page">
        <section class="ccor-ec-card ccor-ec-hero">
          <div>
            <p class="ccor-ec-eyebrow">Cobranza · Corellian</p>
            <h1>Estados de Cuenta</h1>
            <p>Vista agrupada por PPNS a partir de FUENTE. Selecciona un registro para abrir su Estado de Cuenta.</p>
          </div>
          <div class="ccor-ec-hero-actions">
            <span id="ccor-ec-updated">Sin actualizar</span>
            <button id="ccor-ec-create-new" class="ccor-ec-btn ccor-ec-btn-primary" type="button">+ Crear nuevo</button>
            <button id="ccor-ec-refresh" class="ccor-ec-btn ccor-ec-btn-primary" type="button">Actualizar</button>
          </div>
        </section>

        <section class="ccor-ec-card ccor-ec-filters ccor-ec-main-filters" aria-label="Filtros de Estados de Cuenta">
          <label><span>Año</span><select id="ccor-ec-year"><option value="">Todos</option></select></label>
          <label><span>Contractual</span><select id="ccor-ec-contractual"><option value="">Todos</option></select></label>
          <label class="ccor-ec-search-field"><span>Buscar PPNS / Proyecto / Cliente</span><input id="ccor-ec-search" type="search" autocomplete="off" placeholder="Buscar..." /></label>
          <div class="ccor-ec-filter-total">PPNS: <b id="ccor-ec-total">0</b></div>
        </section>

        <section class="ccor-ec-card ccor-ec-projects-card">
          <div id="ccor-ec-list-status" class="ccor-ec-inline-status" aria-live="polite"></div>
          <div class="ccor-ec-table-wrap ccor-ec-projects-wrap">
            <table class="ccor-ec-table ccor-ec-projects-table ccor-ec-main-v001">
              <thead><tr>
                <th>PPNS</th>
                <th>Proyecto</th>
                <th>Cliente</th>
                <th>Supervisor</th>
                <th>Asesor</th>
                <th>Administrativo</th>
                <th>Hitos Suministro</th>
                <th>Hitos MXN</th>
                <th>Aditivas</th>
                <th>Monedas</th>
                <th>Estado de Cuenta</th>
                <th>Contractual</th>
              </tr></thead>
              <tbody id="ccor-ec-projects-body"></tbody>
            </table>
          </div>
        </section>
      </div>`;

    const contextSubtitle = document.getElementById('app-context-subtitle');
    if(contextSubtitle) contextSubtitle.textContent = 'Cobranza Corellian · Estados de Cuenta por PPNS';
    const search = document.getElementById('ccor-ec-search');
    if(search) search.value = state.filters.q;
  }

  function updateCatalogsFromRecords_cor(records){
    state.catalogYears = [...new Set((records || []).flatMap(row => Array.isArray(row && row.anios) ? row.anios : []).map(Number).filter(Number.isInteger))]
      .sort((a,b)=>b-a).map(String);
    state.catalogContractual = [...new Set((records || []).map(row => text_cor(row && row.contractual,'')).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'es'));

    const year = document.getElementById('ccor-ec-year');
    const contractual = document.getElementById('ccor-ec-contractual');
    if(year){
      year.innerHTML = '<option value="">Todos</option>' + state.catalogYears.map(v=>`<option value="${escapeHtml_cor(v)}">${escapeHtml_cor(v)}</option>`).join('');
      year.value = state.filters.anio;
    }
    if(contractual){
      contractual.innerHTML = '<option value="">Todos</option>' + state.catalogContractual.map(v=>`<option value="${escapeHtml_cor(v)}">${escapeHtml_cor(v)}</option>`).join('');
      contractual.value = state.filters.contractual;
    }
  }

  function renderListStatus_cor(message,kind){
    const node = document.getElementById('ccor-ec-list-status');
    if(!node) return;
    node.className = 'ccor-ec-inline-status' + (kind ? ' is-' + kind : '');
    node.textContent = message || '';
  }

  function renderList_cor(){
    const body = document.getElementById('ccor-ec-projects-body');
    const total = document.getElementById('ccor-ec-total');
    if(total) total.textContent = String(state.records.length);
    if(!body) return;
    if(!state.records.length){
      body.innerHTML = '<tr><td colspan="12" class="ccor-ec-table-empty">No se encontraron PPNS con los filtros seleccionados.</td></tr>';
      return;
    }

    body.innerHTML = state.records.map(row => {
      const ppns = text_cor(row.ppns,'');
      const currencies = Array.isArray(row.monedas) && row.monedas.length ? row.monedas.join('-') : '—';
      const available = row.estado_cuenta_disponible === true;
      return `
        <tr class="ccor-ec-project-row" data-ppns="${escapeHtml_cor(ppns)}" tabindex="0" role="button" aria-label="Abrir Estado de Cuenta ${escapeHtml_cor(ppns)}">
          <td class="ccor-ec-main-ppns">${escapeHtml_cor(text_cor(ppns))}</td>
          <td class="ccor-ec-main-project"><strong>${escapeHtml_cor(text_cor(row.proyecto))}</strong></td>
          <td class="ccor-ec-main-client">${escapeHtml_cor(text_cor(row.cliente))}</td>
          <td class="ccor-ec-main-initials">${escapeHtml_cor(text_cor(row.supervisor))}</td>
          <td class="ccor-ec-main-initials">${escapeHtml_cor(text_cor(row.asesor))}</td>
          <td class="ccor-ec-main-initials">${escapeHtml_cor(text_cor(row.administrativo))}</td>
          <td class="ccor-ec-main-count">${escapeHtml_cor(formatInteger_cor(row.hitos_suministro))}</td>
          <td class="ccor-ec-main-count">${escapeHtml_cor(formatInteger_cor(row.hitos_mxn))}</td>
          <td class="ccor-ec-main-count">${escapeHtml_cor(formatInteger_cor(row.aditivas))}</td>
          <td class="ccor-ec-main-money">${escapeHtml_cor(currencies)}</td>
          <td class="ccor-ec-main-account"><span class="ccor-ec-badge ${available ? 'is-ok' : 'is-neutral'}">${available ? 'Disponible' : 'No disponible'}</span></td>
          <td class="ccor-ec-main-contractual"><span class="ccor-ec-badge ${statusClass_cor(row.contractual)}">${escapeHtml_cor(text_cor(row.contractual))}</span></td>
        </tr>`;
    }).join('');
  }

    function getSummaryItems_cor(detail){
    return Array.isArray(detail && detail.resumen && detail.resumen.monedas)
      ? detail.resumen.monedas
      : [];
  }

  function getMovements_cor(detail){
    return Array.isArray(detail && detail.estado_cuenta)
      ? detail.estado_cuenta
      : [];
  }

  function isMxn_cor(currency){
    return String(currency || '').trim().toUpperCase() === 'MXN';
  }

  function isKnownForeign_cor(currency){
    const code = String(currency || '').trim().toUpperCase();
    return Boolean(code) && code !== 'MXN' && code !== 'SIN_MONEDA';
  }

  function renderSummaryMini_cor(item,sectionClass){
    if(!item){
      return '<div class="ccor-ec-summary-empty">Sin movimientos</div>';
    }

    return `
      <div class="ccor-ec-summary-line ${sectionClass || ''}">
        <div class="ccor-ec-summary-currency">
          ${escapeHtml_cor(text_cor(item.moneda))}
        </div>

        <div>
          <span>Monto inicial</span>
          <b>${escapeHtml_cor(formatMoney_cor(item.total,item.moneda))}</b>
        </div>

        <div>
          <span>Monto cobrado</span>
          <b>${escapeHtml_cor(formatMoney_cor(item.cobrado,item.moneda))}</b>
        </div>

        <div>
          <span>Monto pendiente</span>
          <b>${escapeHtml_cor(formatMoney_cor(item.pendiente,item.moneda))}</b>
        </div>

        <div>
          <span>% cobrado</span>
          <b>${escapeHtml_cor(
            formatPercent_cor(item.porcentaje_cobrado_calculado)
          )}</b>
        </div>
      </div>`;
  }

  function renderSupplySummary_cor(summaryItems){
    const foreign = summaryItems.filter(
      item => isKnownForeign_cor(item.moneda)
    );

    if(!foreign.length){
      return '<div class="ccor-ec-summary-empty">Sin movimientos de moneda extranjera.</div>';
    }

    return foreign
      .map(item => renderSummaryMini_cor(item,'is-supply'))
      .join('');
  }

  function renderInstallationSummary_cor(summaryItems){
    const mxn = summaryItems.find(
      item => isMxn_cor(item.moneda)
    );

    return mxn
      ? renderSummaryMini_cor(mxn,'is-installation')
      : '<div class="ccor-ec-summary-empty">Sin movimientos en MXN.</div>';
  }

  function renderVencido_cor(row){
    const status = text_cor(
      row && row.estatus_vencimiento,
      ''
    );

    if(status) return status;

    const days = number_cor(
      row && row.dias_vencimiento
    );

    if(days !== null && days > 0){
      return formatInteger_cor(days) + ' días';
    }

    return '—';
  }

  function renderPaymentMe_cor(row){
    if(!isKnownForeign_cor(row && row.moneda)){
      return '—';
    }

    const amount = number_cor(
      row && row.pago_contabilizado
    );

    return amount && amount > 0
      ? formatAmount_cor(amount)
      : '—';
  }

  function renderPaymentMxn_cor(row){
    if(!isMxn_cor(row && row.moneda)){
      return '—';
    }

    const amount = number_cor(
      row && row.pago_contabilizado
    );

    return amount && amount > 0
      ? formatAmount_cor(amount)
      : '—';
  }

  function renderMovementRows_cor(rows,section){
    if(!rows.length){
      return `
        <tr>
          <td colspan="12" class="ccor-ec-table-empty">
            Sin movimientos para esta sección.
          </td>
        </tr>`;
    }

    return rows.map(row => `
      <tr>
        <td>
          ${escapeHtml_cor(
            formatPercent_cor(row.porcentaje)
          )}
        </td>

        <td class="ccor-ec-condition">
          ${escapeHtml_cor(
            text_cor(row.condicion)
          )}
        </td>

        <td>
          ${escapeHtml_cor(
            text_cor(row.factura)
          )}
        </td>

        <td>
          <b>${escapeHtml_cor(
            text_cor(row.moneda)
          )}</b>
        </td>

        <td class="ccor-ec-num">
          ${escapeHtml_cor(
            formatAmount_cor(row.subtotal)
          )}
        </td>

        <td class="ccor-ec-num">
          ${escapeHtml_cor(
            formatAmount_cor(row.iva)
          )}
        </td>

        <td class="ccor-ec-num">
          <b>${escapeHtml_cor(
            formatAmount_cor(row.total)
          )}</b>
        </td>

        <td>
          ${escapeHtml_cor(
            formatDate_cor(row.fecha_pago)
          )}
        </td>

        <td class="ccor-ec-num">
          ${escapeHtml_cor(
            renderPaymentMe_cor(row)
          )}
        </td>

        <td class="ccor-ec-num">
          ${escapeHtml_cor(
            renderPaymentMxn_cor(row)
          )}
        </td>

        <td>
          ${escapeHtml_cor(
            renderVencido_cor(row)
          )}
        </td>

        <td class="ccor-ec-num is-pending">
          ${escapeHtml_cor(
            formatAmount_cor(row.pendiente_calculado)
          )}
        </td>
      </tr>
    `).join('');
  }

  function renderTotalsRows_cor(summaryItems,section){
    const selected = section === 'supply'
      ? summaryItems.filter(
          item => isKnownForeign_cor(item.moneda)
        )
      : summaryItems.filter(
          item => isMxn_cor(item.moneda)
        );

    if(!selected.length){
      return '';
    }

    return selected.map(item => `
      <tr class="ccor-ec-total-row">

        <td colspan="4">
          TOTAL ${escapeHtml_cor(
            text_cor(item.moneda)
          )}
        </td>

        <td class="ccor-ec-num">
          ${escapeHtml_cor(
            formatAmount_cor(item.subtotal)
          )}
        </td>

        <td class="ccor-ec-num">
          ${escapeHtml_cor(
            formatAmount_cor(item.iva)
          )}
        </td>

        <td class="ccor-ec-num">
          ${escapeHtml_cor(
            formatAmount_cor(item.total)
          )}
        </td>

        <td>—</td>

        <td class="ccor-ec-num">
          ${
            section === 'supply'
              ? escapeHtml_cor(
                  formatAmount_cor(item.cobrado)
                )
              : '—'
          }
        </td>

        <td class="ccor-ec-num">
          ${
            section === 'installation'
              ? escapeHtml_cor(
                  formatAmount_cor(item.cobrado)
                )
              : '—'
          }
        </td>

        <td>—</td>

        <td class="ccor-ec-num">
          ${escapeHtml_cor(
            formatAmount_cor(item.pendiente)
          )}
        </td>

      </tr>
    `).join('');
  }

  function renderAccountTable_cor(
    title,
    section,
    rows,
    summaryItems
  ){
    const sectionClass =
      section === 'supply'
        ? 'is-supply'
        : 'is-installation';

    const percentLabel =
      section === 'supply'
        ? '% ME'
        : '% MXN';

    return `
      <section class="ccor-ec-account-section ${sectionClass}">

        <div class="ccor-ec-account-title">
          ${escapeHtml_cor(title)}
        </div>

        <div class="ccor-ec-table-wrap ccor-ec-detail-table-wrap">

          <table class="ccor-ec-table ccor-ec-detail-table">

            <thead>
              <tr>
                <th>${percentLabel}</th>
                <th>Condición</th>
                <th>Factura</th>
                <th>Mon</th>
                <th>Subtotal</th>
                <th>IVA</th>
                <th>Total</th>
                <th>Fecha pago</th>
                <th>Pago M.E.</th>
                <th>Pago MXN</th>
                <th>Vencido</th>
                <th>Por cobrar</th>
              </tr>
            </thead>

            <tbody>
              ${renderMovementRows_cor(
                rows,
                section
              )}

              ${renderTotalsRows_cor(
                summaryItems,
                section
              )}
            </tbody>

          </table>

        </div>

      </section>`;
  }

  function renderUnknownCurrency_cor(rows){
    if(!rows.length){
      return '';
    }

    return `
      <section class="ccor-ec-card ccor-ec-unknown-card">

        <b>
          Movimientos sin moneda identificada:
          ${escapeHtml_cor(
            formatInteger_cor(rows.length)
          )}
        </b>

        <span>
          Estos registros no se clasifican como
          Suministro ni Instalación hasta que FUENTE
          indique la moneda.
        </span>

      </section>`;
  }

  function renderDetail_cor(){
    const root = state.root;
    const detail = state.detail;

    if(!root || !detail){
      return;
    }

    const project = detail.proyecto || {};
    const quality = detail.calidad || {};

    const movements =
      getMovements_cor(detail);

    const summaryItems =
      getSummaryItems_cor(detail);

    const supplyRows =
      movements.filter(
        row => isKnownForeign_cor(
          row && row.moneda
        )
      );

    const installationRows =
      movements.filter(
        row => isMxn_cor(
          row && row.moneda
        )
      );

    const unknownRows =
      movements.filter(
        row =>
          !isKnownForeign_cor(
            row && row.moneda
          )
          &&
          !isMxn_cor(
            row && row.moneda
          )
      );

    const years = [
      ...new Set(
        movements
          .map(
            row => number_cor(
              row && row.anio_proyecto
            )
          )
          .filter(
            value => value !== null
          )
      )
    ]
      .sort((a,b) => b-a)
      .join(' - ');

    const currencies =
      summaryItems
        .map(
          item => text_cor(
            item && item.moneda,
            ''
          )
        )
        .filter(Boolean)
        .join(' - ');

    state.view = 'detail';

    root.innerHTML = `
      <div class="ccor-ec-page ccor-ec-detail-page">

        <div class="ccor-ec-detail-toolbar">

          <span>
            Fecha de consulta:
            <b>${escapeHtml_cor(
              formatDateTimeNow_cor()
            )}</b>
          </span>

        </div>

        <section class="ccor-ec-detail-title">

          <div>

            <p class="ccor-ec-eyebrow">
              Cobranza · Corellian
            </p>

            <h1>
              Estado de Cuenta
            </h1>

          </div>

          <div class="ccor-ec-hero-actions">
            <button id="ccor-ec-edit" class="ccor-ec-btn ccor-ec-btn-primary" type="button">Editar</button>
            <span
              class="ccor-ec-badge ${statusClass_cor(project.contractual)}"
            >
              ${escapeHtml_cor(
                text_cor(project.contractual)
              )}
            </span>
          </div>

        </section>


        <section class="ccor-ec-card ccor-ec-project-header">

          <div>
            <span>Proyecto</span>
            <b>${escapeHtml_cor(
              text_cor(project.proyecto)
            )}</b>
          </div>

          <div>
            <span>PPNS</span>
            <b>${escapeHtml_cor(
              text_cor(project.ppns)
            )}</b>
          </div>

          <div>
            <span>Cliente</span>
            <b>${escapeHtml_cor(
              text_cor(project.cliente)
            )}</b>
          </div>

          <div>
            <span>Contractual</span>
            <b>${escapeHtml_cor(
              text_cor(project.contractual)
            )}</b>
          </div>

          <div>
            <span>Año</span>
            <b>${escapeHtml_cor(
              years || '—'
            )}</b>
          </div>

        </section>


        <section class="ccor-ec-summary-grid">

          <article
            class="ccor-ec-card ccor-ec-summary-card is-supply"
          >

            <div class="ccor-ec-summary-title">

              <div>
                <span class="ccor-ec-summary-icon">
                  ◎
                </span>

                <b>
                  SUMINISTRO
                </b>
              </div>

              <small>
                Moneda extranjera
              </small>

            </div>

            ${renderSupplySummary_cor(
              summaryItems
            )}

          </article>


          <article
            class="ccor-ec-card ccor-ec-summary-card is-installation"
          >

            <div class="ccor-ec-summary-title">

              <div>
                <span class="ccor-ec-summary-icon">
                  ⌁
                </span>

                <b>
                  INSTALACIÓN
                </b>
              </div>

              <small>
                Moneda nacional · MXN
              </small>

            </div>

            ${renderInstallationSummary_cor(
              summaryItems
            )}

          </article>

        </section>


        ${renderAccountTable_cor(
          'SUMINISTRO',
          'supply',
          supplyRows,
          summaryItems
        )}


        ${renderAccountTable_cor(
          'INSTALACIÓN',
          'installation',
          installationRows,
          summaryItems
        )}


        ${renderUnknownCurrency_cor(
          unknownRows
        )}


        <section class="ccor-ec-info-grid">

          <article class="ccor-ec-card ccor-ec-info-card">

            <h3>
              Información de FUENTE
            </h3>

            <dl>

              <div>
                <dt>Proyecto</dt>
                <dd>
                  ${escapeHtml_cor(
                    text_cor(project.proyecto)
                  )}
                </dd>
              </div>

              <div>
                <dt>PPNS</dt>
                <dd>
                  ${escapeHtml_cor(
                    text_cor(project.ppns)
                  )}
                </dd>
              </div>

              <div>
                <dt>Cliente</dt>
                <dd>
                  ${escapeHtml_cor(
                    text_cor(project.cliente)
                  )}
                </dd>
              </div>

              <div>
                <dt>Año</dt>
                <dd>
                  ${escapeHtml_cor(
                    years || '—'
                  )}
                </dd>
              </div>

            </dl>

          </article>


          <article class="ccor-ec-card ccor-ec-info-card">

            <h3>
              Estado de Cuenta
            </h3>

            <dl>

              <div>
                <dt>Contractual</dt>
                <dd>
                  ${escapeHtml_cor(
                    text_cor(project.contractual)
                  )}
                </dd>
              </div>

              <div>
                <dt>Monedas</dt>
                <dd>
                  ${escapeHtml_cor(
                    currencies || '—'
                  )}
                </dd>
              </div>

              <div>
                <dt>Movimientos</dt>
                <dd>
                  ${escapeHtml_cor(
                    formatInteger_cor(
                      movements.length
                    )
                  )}
                </dd>
              </div>

              <div>
                <dt>Estado</dt>
                <dd>
                  ${
                    quality.tiene_estado_cuenta
                      ? 'Disponible'
                      : 'Sin movimientos'
                  }
                </dd>
              </div>

            </dl>

          </article>


          <article class="ccor-ec-card ccor-ec-info-card">

            <h3>
              Movimientos de FUENTE
            </h3>

            <dl>

              <div>
                <dt>Total</dt>
                <dd>
                  ${escapeHtml_cor(
                    formatInteger_cor(
                      movements.length
                    )
                  )}
                </dd>
              </div>

              <div>
                <dt>Suministro</dt>
                <dd>
                  ${escapeHtml_cor(
                    formatInteger_cor(
                      supplyRows.length
                    )
                  )}
                </dd>
              </div>

              <div>
                <dt>Instalación</dt>
                <dd>
                  ${escapeHtml_cor(
                    formatInteger_cor(
                      installationRows.length
                    )
                  )}
                </dd>
              </div>

              <div>
                <dt>Sin moneda</dt>
                <dd>
                  ${escapeHtml_cor(
                    formatInteger_cor(
                      unknownRows.length
                    )
                  )}
                </dd>
              </div>

            </dl>

            <p class="ccor-ec-info-note">
              Detalle construido directamente con los
              movimientos de cobranza_fuente_cor del PPNS.
            </p>

          </article>

        </section>

      </div>`;

    const contextSubtitle =
      document.getElementById(
        'app-context-subtitle'
      );

    if(contextSubtitle){
      contextSubtitle.textContent =
        'Estado de Cuenta · ' +
        text_cor(
          project.proyecto,
          project.ppns || 'PPNS'
        );
    }

    try{
      window.scrollTo({
        top:0,
        behavior:'smooth'
      });
    }catch(_error){
      window.scrollTo(0,0);
    }
  }

  function renderDetailLoading_cor(){
    if(!state.root) return;
    state.view='detail';
    state.root.innerHTML='<div class="ccor-ec-page"><section class="ccor-ec-card ccor-ec-loading-card"><span class="ccor-ec-spinner" aria-hidden="true"></span><div><b>Cargando Estado de Cuenta...</b><small>Consultando FUENTE por PPNS.</small></div></section></div>';
  }

  function renderDetailError_cor(message){
    if(!state.root) return;
    state.root.innerHTML=`<div class="ccor-ec-page"><section class="ccor-ec-card ccor-ec-error-card"><div><h2>No fue posible abrir el Estado de Cuenta</h2><p>${escapeHtml_cor(message)}</p></div></section></div>`;
  }

  async function loadDetail_cor(ppns,options){
    const normalized = String(ppns || '').trim();
    if(!normalized) return;
    state.selectedPpns = normalized;
    state.detail = null;
    renderDetailLoading_cor();
    const sequence = ++state.detailSequence;
    try{
      const payload = await apiGet_cor(LIST_PATH + '/' + encodeURIComponent(normalized),{force:Boolean(options && options.force),cacheTtlMs:0});
      if(sequence !== state.detailSequence || !isActive_cor()) return;
      state.detail = payload || null;
      renderDetail_cor();
    }catch(error){
      if(sequence !== state.detailSequence || !isActive_cor()) return;
      renderDetailError_cor(errorMessage_cor(error,'detail'));
    }
  }

  async function loadList_cor(options){
    const sequence = ++state.listSequence;
    if(state.view !== 'list') renderListShell_cor();
    renderListStatus_cor('Cargando PPNS...','loading');
    try{
      const payload = await apiGet_cor(buildListPath_cor(),{force:Boolean(options && options.force),cacheTtlMs:0});
      if(sequence !== state.listSequence || !isActive_cor()) return;
      state.records = Array.isArray(payload && payload.data) ? payload.data : [];
      state.selectedPpns = null;
      state.detail = null;
      updateCatalogsFromRecords_cor(state.records);
      renderList_cor();
      renderListStatus_cor(state.records.length ? '' : 'No hay PPNS para los filtros actuales.',state.records.length ? '' : 'empty');
      const updated = document.getElementById('ccor-ec-updated');
      if(updated) updated.textContent = 'Actualizado ' + formatDateTimeNow_cor();
    }catch(error){
      if(sequence !== state.listSequence || !isActive_cor()) return;
      state.records=[];
      renderList_cor();
      renderListStatus_cor(errorMessage_cor(error,'list'),'error');
    }
  }

  function openDetailRoute_cor(ppns){
    const normalized = String(ppns || '').trim();
    if(!normalized) return;
    if(window.ManttoRouter && typeof window.ManttoRouter.go === 'function'){
      window.ManttoRouter.go(ROUTE,{ppns:normalized},{navigationType:'open'});
      return;
    }
    loadDetail_cor(normalized,{force:true});
  }

  function openForm_cor(mode,ppns){
    const normalizedMode = String(mode || '').trim().toLowerCase() === 'edit' ? 'edit' : 'create';
    const normalizedPpns = String(ppns || '').trim();
    if(normalizedMode === 'edit' && !normalizedPpns) return false;

    const payload = normalizedMode === 'edit'
      ? {mode:'edit',ppns:normalizedPpns}
      : {mode:'create'};

    if(window.ManttoRouter && typeof window.ManttoRouter.go === 'function'){
      window.ManttoRouter.go(ROUTE,payload,{navigationType:'open'});
      return true;
    }

    if(window.ManttoCobranzaCorEstadoCuentaForm && typeof window.ManttoCobranzaCorEstadoCuentaForm.init === 'function'){
      window.ManttoCobranzaCorEstadoCuentaForm.init(payload);
      return true;
    }
    return false;
  }

  function applyFilterAndReload_cor(){ state.view='list'; loadList_cor({force:true}); }

  function bindEvents_cor(){
    const root = state.root;
    if(!root || root.dataset.ccorEstadosCuentaBound === '1') return;
    root.dataset.ccorEstadosCuentaBound='1';

    root.addEventListener('click',event=>{
      if(event.target.closest('#ccor-ec-create-new')){ openForm_cor('create'); return; }
      if(event.target.closest('#ccor-ec-edit')){
        const ppns = state.detail && state.detail.proyecto ? state.detail.proyecto.ppns : state.selectedPpns;
        openForm_cor('edit',ppns);
        return;
      }
      if(event.target.closest('#ccor-ec-refresh')){ loadList_cor({force:true}); return; }
      const row=event.target.closest('[data-ppns]');
      if(row) openDetailRoute_cor(row.dataset.ppns);
    });

    root.addEventListener('keydown',event=>{
      if(event.key !== 'Enter' && event.key !== ' ') return;
      const row=event.target.closest('[data-ppns]');
      if(!row) return;
      event.preventDefault();
      openDetailRoute_cor(row.dataset.ppns);
    });

    root.addEventListener('change',event=>{
      if(event.target.id === 'ccor-ec-year'){
        state.filters.anio=String(event.target.value || '');
        applyFilterAndReload_cor();
      }else if(event.target.id === 'ccor-ec-contractual'){
        state.filters.contractual=String(event.target.value || '');
        applyFilterAndReload_cor();
      }
    });

    root.addEventListener('input',event=>{
      if(event.target.id !== 'ccor-ec-search') return;
      state.filters.q=String(event.target.value || '').trim();
      if(state.searchTimer) window.clearTimeout(state.searchTimer);
      state.searchTimer=window.setTimeout(()=>{ state.searchTimer=null; applyFilterAndReload_cor(); },SEARCH_DELAY_MS);
    });
  }

  async function init_cor(){
    if(!isActive_cor()) return false;
    const root=document.getElementById('view-placeholder');
    if(!root) return false;
    state.root=root;
    ensureStyles_cor();
    bindEvents_cor();
    const payload=currentPayload_cor();
    const requestedMode=String(payload && payload.mode || '').trim().toLowerCase();
    const requestedPpns=String(payload && payload.ppns || '').trim();

    if(requestedMode === 'create' || requestedMode === 'edit'){
      state.view='form';
      if(window.ManttoCobranzaCorEstadoCuentaForm && typeof window.ManttoCobranzaCorEstadoCuentaForm.init === 'function'){
        await window.ManttoCobranzaCorEstadoCuentaForm.init({mode:requestedMode,ppns:requestedPpns});
        return true;
      }
      root.innerHTML='<div class="ccor-ec-page"><section class="ccor-ec-card ccor-ec-error-card"><div><h2>No fue posible abrir el formulario</h2><p>El recurso de Crear/Editar Estado de Cuenta no está disponible.</p></div></section></div>';
      return false;
    }

    if(requestedPpns){
      state.view='detail';
      await loadDetail_cor(requestedPpns,{force:true});
      return true;
    }
    state.view='list';
    renderListShell_cor();
    renderList_cor();
    await loadList_cor({force:true});
    return true;
  }

  function refresh_cor(){
    if(!isActive_cor()) return Promise.resolve(false);
    const payload=currentPayload_cor();
    const requestedMode=String(payload && payload.mode || '').trim().toLowerCase();
    const requestedPpns=String(payload && payload.ppns || '').trim();
    if(requestedMode === 'create' || requestedMode === 'edit'){
      if(window.ManttoCobranzaCorEstadoCuentaForm && typeof window.ManttoCobranzaCorEstadoCuentaForm.init === 'function'){
        return Promise.resolve(window.ManttoCobranzaCorEstadoCuentaForm.init({mode:requestedMode,ppns:requestedPpns}));
      }
      return Promise.resolve(false);
    }
    return requestedPpns ? loadDetail_cor(requestedPpns,{force:true}) : loadList_cor({force:true});
  }

  window.ManttoCobranzaCorEstadosCuenta=Object.freeze({init:init_cor,refresh:refresh_cor});
})();
