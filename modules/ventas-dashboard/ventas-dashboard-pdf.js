(function () {
  'use strict';

  const COLORS = Object.freeze({
    navy: [13, 46, 110],
    blue: [47, 103, 199],
    blueSoft: [239, 246, 255],
    slate: [51, 65, 85],
    muted: [100, 116, 139],
    line: [203, 213, 225],
    white: [255, 255, 255],
    greenSoft: [236, 253, 245],
    amberSoft: [255, 251, 235],
    redSoft: [254, 242, 242]
  });

  const MARGIN = 18;
  const FOOTER_Y = 14;

  function clean(value, fallback) {
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text || (fallback === undefined ? '—' : fallback);
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatDate(value) {
    if (!value) return 'SIN FECHA';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    const text = String(value).trim();
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (match) return `${String(match[1]).padStart(2, '0')}/${String(match[2]).padStart(2, '0')}/${match[3]}`;
    return text || 'SIN FECHA';
  }

  function fileSafe(value) {
    return String(value || 'reporte')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'reporte';
  }

  function ensureLibraries() {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF no está disponible.');
    const test = new window.jspdf.jsPDF();
    if (typeof test.autoTable !== 'function') throw new Error('jsPDF AutoTable no está disponible.');
  }

  function createDoc() {
    return new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  }

  function pageHeight(doc) { return doc.internal.pageSize.getHeight(); }
  function pageWidth(doc) { return doc.internal.pageSize.getWidth(); }

  function ensureSpace(doc, y, required) {
    if (y + required <= pageHeight(doc) - 34) return y;
    doc.addPage();
    return 28;
  }

  function sectionTitle(doc, y, index, title) {
    y = ensureSpace(doc, y, 28);
    doc.setFillColor.apply(doc, COLORS.navy);
    doc.roundedRect(MARGIN, y - 13, pageWidth(doc) - (MARGIN * 2), 21, 4, 4, 'F');
    doc.setTextColor.apply(doc, COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`${index}. ${title}`, MARGIN + 8, y + 1);
    return y + 17;
  }

  function addTable(doc, y, headers, rows, options) {
    const opts = options || {};
    if (!Array.isArray(rows) || rows.length === 0) return y;
    doc.autoTable({
      startY: y,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: opts.fontSize || 7,
        cellPadding: opts.cellPadding || 2.4,
        valign: 'middle',
        overflow: 'linebreak',
        lineColor: COLORS.line,
        lineWidth: 0.35,
        textColor: COLORS.slate,
        minCellHeight: 13
      },
      headStyles: {
        fillColor: opts.headColor || COLORS.blue,
        textColor: COLORS.white,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        minCellHeight: 17
      },
      alternateRowStyles: { fillColor: opts.altColor || COLORS.blueSoft },
      columnStyles: opts.columnStyles || {},
      margin: { left: MARGIN, right: MARGIN, bottom: 30 },
      rowPageBreak: 'avoid',
      showHead: 'everyPage'
    });
    return doc.lastAutoTable.finalY + 10;
  }

  function addNoData(doc, y) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor.apply(doc, COLORS.muted);
    doc.text('Sin datos para esta sección.', MARGIN + 4, y);
    return y + 14;
  }

  function header(doc, advisor, creator) {
    const width = pageWidth(doc);
    doc.setTextColor.apply(doc, COLORS.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Dashboard Ventas', MARGIN, 27);
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, COLORS.slate);
    doc.text(`Asesor: ${clean(advisor?.nombre)}`, MARGIN, 44);
    doc.text(`Fecha de creación: ${formatDate(new Date())}`, width - MARGIN, 44, { align: 'right' });
    doc.setDrawColor.apply(doc, COLORS.line);
    doc.line(MARGIN, 51, width - MARGIN, 51);
    return 67;
  }

  function kpis(doc, y, report) {
    const k = report?.kpis || {};
    const items = [
      ['Vendidos', number(k.vendidos?.cotizaciones)],
      ['Equipos vendidos', number(k.vendidos?.equipos)],
      ['Perdidos', number(k.perdidos?.cotizaciones)],
      ['Cotizaciones activas', number(k.cotizaciones_activas)],
      ['Proyectos activos', number(k.proyectos_activos)]
    ];
    const width = pageWidth(doc) - (MARGIN * 2);
    const gap = 7;
    const cardW = (width - gap * (items.length - 1)) / items.length;
    items.forEach(function (item, index) {
      const x = MARGIN + index * (cardW + gap);
      doc.setFillColor.apply(doc, index === 1 ? COLORS.greenSoft : (index === 2 ? COLORS.redSoft : COLORS.blueSoft));
      doc.setDrawColor.apply(doc, COLORS.line);
      doc.roundedRect(x, y, cardW, 45, 5, 5, 'FD');
      doc.setTextColor.apply(doc, COLORS.navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(String(item[1]), x + 8, y + 19);
      doc.setFontSize(7.2);
      doc.setTextColor.apply(doc, COLORS.slate);
      doc.text(item[0], x + 8, y + 35, { maxWidth: cardW - 16 });
    });
    return y + 58;
  }

  function sold(doc, y, groups) {
    y = sectionTitle(doc, y, 1, 'Vendidos');
    if (!Array.isArray(groups) || groups.length === 0) return addNoData(doc, y);
    groups.forEach(function (group) {
      y = ensureSpace(doc, y, 42);
      doc.setTextColor.apply(doc, COLORS.navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(clean(group.anio, 'Sin año'), MARGIN, y);
      y += 6;
      const rows = (group.registros || []).map(function (row) {
        return [clean(row.proyecto), clean(row.estatus), clean(row.cliente), number(row.numero_equipos), clean(row.ciudad), row.dias_vendido === null || row.dias_vendido === undefined ? '—' : number(row.dias_vendido)];
      });
      rows.push([{ content: 'TOTAL EQUIPOS', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: COLORS.blueSoft } }, { content: number(group.total_equipos), styles: { fontStyle: 'bold', halign: 'center', fillColor: COLORS.blueSoft } }, '', '']);
      y = addTable(doc, y, ['PROYECTO', 'ESTATUS', 'CLIENTE', 'NO. EQUIPOS', 'CIUDAD', 'DÍAS VENDIDO'], rows, {
        columnStyles: { 0: { cellWidth: 145 }, 1: { cellWidth: 66 }, 2: { cellWidth: 145 }, 3: { cellWidth: 58, halign: 'center' }, 4: { cellWidth: 82 }, 5: { cellWidth: 66, halign: 'center' } }
      });
    });
    return y;
  }

  function lost(doc, y, groups) {
    y = sectionTitle(doc, y, 2, 'Perdidos');
    if (!Array.isArray(groups) || groups.length === 0) return addNoData(doc, y);
    groups.forEach(function (group) {
      y = ensureSpace(doc, y, 42);
      doc.setTextColor.apply(doc, COLORS.navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`AÑO ${clean(group.anio, 'Sin año')}`, MARGIN, y);
      y += 6;
      y = addTable(doc, y, ['PROYECTO', 'PERDIDO CONTRA', 'RAZÓN PERDIDO', 'CLIENTE', 'NO. EQUIPOS'], (group.registros || []).map(function (row) {
        return [clean(row.proyecto), clean(row.perdido_contra), clean(row.razon_perdido), clean(row.cliente), number(row.numero_equipos)];
      }), {
        columnStyles: { 0: { cellWidth: 155 }, 1: { cellWidth: 130 }, 2: { cellWidth: 175 }, 3: { cellWidth: 175 }, 4: { cellWidth: 70, halign: 'center' } }
      });
    });
    return y;
  }

  function activeQuotes(doc, y, rows) {
    y = sectionTitle(doc, y, 3, 'Cotizaciones activas');
    if (!rows?.length) return addNoData(doc, y);
    return addTable(doc, y, ['PROYECTO', 'ESTATUS', 'CLIENTE', 'NO. EQUIPOS', 'CIUDAD', 'COMENTARIOS'], rows.map(function (row) {
      return [clean(row.proyecto), clean(row.estatus), clean(row.cliente), number(row.numero_equipos), clean(row.ciudad), clean(row.comentarios, 'Sin comentarios recientes')];
    }), {
      fontSize: 6.8,
      columnStyles: { 0: { cellWidth: 118 }, 1: { cellWidth: 82 }, 2: { cellWidth: 115 }, 3: { cellWidth: 52, halign: 'center' }, 4: { cellWidth: 72 }, 5: { cellWidth: 270 } }
    });
  }

  function prospecting(doc, y, rows) {
    y = sectionTitle(doc, y, 4, 'Prospección');
    if (!rows?.length) return addNoData(doc, y);
    return addTable(doc, y, ['EMPRESA', 'PROYECTO', 'CONTACTO', 'CIUDAD', 'ESTADO'], rows.map(function (row) {
      return [clean(row.empresa), clean(row.proyecto), clean(row.contacto), clean(row.ciudad), clean(row.estado || row.estatus)];
    }), { columnStyles: { 0: { cellWidth: 180 }, 1: { cellWidth: 180 }, 2: { cellWidth: 145 }, 3: { cellWidth: 95 }, 4: { cellWidth: 125 } } });
  }

  function networks(doc, y, rows) {
    y = sectionTitle(doc, y, 5, 'Redes');
    if (!rows?.length) return addNoData(doc, y);
    return addTable(doc, y, ['NOMBRE', 'CIUDAD', 'CONTACTO VÍA'], rows.map(function (row) {
      return [clean(row.nombre_contacto), clean(row.ciudad), clean(row.contacto_via)];
    }), { columnStyles: { 0: { cellWidth: 310 }, 1: { cellWidth: 190 }, 2: { cellWidth: 225 } } });
  }

  function progressValue(row) {
    const explicit = row.porcentaje_general ?? row.avance_general;
    if (explicit !== undefined && explicit !== null && explicit !== '') return clean(explicit);
    return '—';
  }

  function projects(doc, y, rows) {
    y = sectionTitle(doc, y, 6, 'Proyectos activos');
    if (!rows?.length) return addNoData(doc, y);
    return addTable(doc, y, ['PROYECTO', 'SUPERVISOR', 'CLIENTE', 'ESTADO', '% GENERAL', 'MATERIAL'], rows.map(function (row) {
      return [clean(row.proyecto), clean(row.supervisor), clean(row.cliente), clean(row.estatus || row.estado), progressValue(row), clean(row.material)];
    }), {
      fontSize: 6.7,
      columnStyles: { 0: { cellWidth: 126 }, 1: { cellWidth: 90 }, 2: { cellWidth: 122 }, 3: { cellWidth: 82 }, 4: { cellWidth: 63, halign: 'center' }, 5: { cellWidth: 242 } }
    });
  }

  function logistics(doc, y, rows) {
    y = sectionTitle(doc, y, 7, 'Logística');
    if (!rows?.length) return addNoData(doc, y);
    return addTable(doc, y, ['PROYECTO', 'SUP', 'ESTATUS', 'EXW', 'ETA', 'ETD', 'OBRA REAL - ESTIMADA', 'PAGO CLIENTE'], rows.map(function (row) {
      return [clean(row.proyecto), clean(row.supervisor), clean(row.estatus), formatDate(row.fecha_exw), formatDate(row.eta), formatDate(row.etd), formatDate(row.obra_real_estimada), clean(row.pago_cliente, 'SIN FECHA')];
    }), {
      fontSize: 6.5,
      cellPadding: 2.2,
      columnStyles: { 0: { cellWidth: 104 }, 1: { cellWidth: 58 }, 2: { cellWidth: 172 }, 3: { cellWidth: 64 }, 4: { cellWidth: 64 }, 5: { cellWidth: 64 }, 6: { cellWidth: 103 }, 7: { cellWidth: 92 } }
    });
  }

  function clients(doc, y, rows) {
    y = sectionTitle(doc, y, 8, 'Clientes');
    if (!rows?.length) return addNoData(doc, y);
    return addTable(doc, y, ['EMPRESA', 'CIUDAD', 'ESTATUS CLIENTE', 'PROYECTO VENDIDO', 'COTIZACIONES EN SISTEMA', 'CONTRATOS ACTIVOS'], rows.map(function (row) {
      return [clean(row.empresa), clean(row.ciudad), clean(row.estatus_cliente), clean(row.proyecto_vendido), number(row.cotizaciones_sistema), number(row.contratos_activos)];
    }), {
      fontSize: 6.7,
      columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 92 }, 2: { cellWidth: 105 }, 3: { cellWidth: 215 }, 4: { cellWidth: 88, halign: 'center' }, 5: { cellWidth: 75, halign: 'center' } }
    });
  }

  function tasks(doc, y, rows) {
    if (!rows?.length) return y;
    y = sectionTitle(doc, y, 9, 'Tareas colaborativas entre asesor y usuario generador');
    return addTable(doc, y, ['PENDIENTE', 'PRIORIDAD', 'ESTATUS', 'PROYECTO', 'ÁREA', 'FECHA LÍMITE', 'RESPONSABLES'], rows.map(function (row) {
      return [clean(row.pendiente), clean(row.prioridad), clean(row.estatus), clean(row.proyecto), clean(row.area), formatDate(row.due_date), clean(row.responsables)];
    }), {
      fontSize: 6.7,
      columnStyles: { 0: { cellWidth: 215 }, 1: { cellWidth: 62 }, 2: { cellWidth: 75 }, 3: { cellWidth: 110 }, 4: { cellWidth: 78 }, 5: { cellWidth: 78 }, 6: { cellWidth: 107 } }
    });
  }

  function addGeneralFooters(doc, creator) {
    const total = doc.getNumberOfPages();
    const date = formatDate(new Date());
    const creatorInitials = clean(creator?.iniciales, 'USUARIO');
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page);
      doc.setDrawColor.apply(doc, COLORS.line);
      doc.line(MARGIN, pageHeight(doc) - 24, pageWidth(doc) - MARGIN, pageHeight(doc) - 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, COLORS.muted);
      doc.text(`General | ${date} | Generado por: ${creatorInitials}`, MARGIN, pageHeight(doc) - FOOTER_Y);
      doc.text(`Página ${page} de ${total}`, pageWidth(doc) - MARGIN, pageHeight(doc) - FOOTER_Y, { align: 'right' });
    }
  }

  function renderAdvisorReport(doc, report, creator) {
    const advisor = report.asesor || {};
    let y = header(doc, advisor, creator);
    y = kpis(doc, y, report);
    y = sold(doc, y, report.vendidos);
    y = lost(doc, y, report.perdidos);
    y = activeQuotes(doc, y, report.cotizaciones_activas);
    y = prospecting(doc, y, report.prospeccion);
    y = networks(doc, y, report.redes);
    y = projects(doc, y, report.proyectos_activos);
    y = logistics(doc, y, report.logistica);
    y = clients(doc, y, report.clientes);
    tasks(doc, y, report.tareas_colaborativas);
  }

  function addFooters(doc, advisor, creator) {
    const total = doc.getNumberOfPages();
    const date = formatDate(new Date());
    const advisorInitials = clean(advisor?.iniciales, 'ASESOR');
    const creatorInitials = clean(creator?.iniciales, 'USUARIO');
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page);
      doc.setDrawColor.apply(doc, COLORS.line);
      doc.line(MARGIN, pageHeight(doc) - 24, pageWidth(doc) - MARGIN, pageHeight(doc) - 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, COLORS.muted);
      doc.text(`${advisorInitials} | ${date} | Generado por: ${creatorInitials}`, MARGIN, pageHeight(doc) - FOOTER_Y);
      doc.text(`Página ${page} de ${total}`, pageWidth(doc) - MARGIN, pageHeight(doc) - FOOTER_Y, { align: 'right' });
    }
  }

  function generateIndividual(payload) {
    ensureLibraries();
    const report = Array.isArray(payload?.asesores) ? payload.asesores[0] : null;
    if (!report) throw new Error('No se recibieron datos del asesor para generar el PDF.');
    const creator = payload.generado_por || {};
    const advisor = report.asesor || {};
    const doc = createDoc();
    renderAdvisorReport(doc, report, creator);
    addFooters(doc, advisor, creator);
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    doc.save(`Dashboard_Ventas_${fileSafe(advisor.iniciales || advisor.nombre)}_${dateStamp}.pdf`);
    return true;
  }

  function generateGeneral(payload) {
    ensureLibraries();
    const reports = Array.isArray(payload?.asesores) ? payload.asesores : [];
    if (reports.length === 0) throw new Error('No se recibieron asesores para generar el PDF general.');
    const creator = payload.generado_por || {};
    const doc = createDoc();
    reports.forEach(function (report, index) {
      if (index > 0) doc.addPage();
      renderAdvisorReport(doc, report, creator);
    });
    addGeneralFooters(doc, creator);
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    doc.save(`Dashboard_Ventas_General_${dateStamp}.pdf`);
    return true;
  }

  window.VentasDashboardPdf_cor = Object.freeze({ generateIndividual, generateGeneral });
})();
