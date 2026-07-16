(function(){
  'use strict';

  function safeText(value){
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  function fileSafe(value){
    return String(value || 'reporte')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'reporte';
  }

  function currentDateStamp(){
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function longDate(){
    return new Date().toLocaleDateString('es-MX', {
      weekday:'long', year:'numeric', month:'long', day:'numeric'
    });
  }

  function resolveValue(row, column){
    const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
    return safeText(value);
  }

  function exportCsv(config){
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const columns = Array.isArray(config.columns) ? config.columns : [];
    const keys = columns.length ? columns.map(function(column){ return column.key; }) : Object.keys(rows[0] || {});
    const headers = columns.length ? columns.map(function(column){ return column.label; }) : keys;
    const csvRows = [headers].concat(rows.map(function(row){
      return columns.length
        ? columns.map(function(column){ return resolveValue(row, column); })
        : keys.map(function(key){ return safeText(row[key]); });
    }));
    const csv = csvRows.map(function(row){
      return row.map(function(value){ return '"' + String(value).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileSafe(config.fileName || config.title) + '_' + currentDateStamp() + '.csv';
    document.body.appendChild(link);
    link.click();
    const url = link.href;
    link.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function ensureLibrary(config){
    if(!window.jspdf || !window.jspdf.jsPDF){
      if(config && Array.isArray(config.rows)) exportCsv(config);
      throw new Error('jsPDF no está disponible. Se generó CSV cuando fue posible.');
    }
  }

  function createDocument(config){
    return new window.jspdf.jsPDF({
      orientation: config.orientation || 'landscape',
      unit: 'pt',
      format: config.format || 'letter'
    });
  }

  function ensureAutoTable(doc){
    if(typeof doc.autoTable !== 'function') throw new Error('jsPDF AutoTable no está disponible.');
  }

  function addPageNumbers(doc, footerText){
    const count = doc.getNumberOfPages();
    for(let page = 1; page <= count; page += 1){
      doc.setPage(page);
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(safeText(footerText || 'Mantto Gestor'), 36, height - 18);
      doc.text('Página ' + page + ' de ' + count, width - 36, height - 18, { align:'right' });
    }
  }

  function drawHeader(doc, config){
    const marginX = Number(config.marginX || 36);
    const titleColor = config.titleColor || [30, 64, 175];
    let y = Number(config.startY || 38);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Number(config.titleSize || 16));
    doc.setTextColor.apply(doc, titleColor);
    doc.text(safeText(config.title || 'Reporte'), marginX, y);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(Number(config.subtitleSize || 8));

    if(config.showDate !== false){
      y += 16;
      doc.text('Fecha: ' + (config.dateText || longDate()), marginX, y);
    }

    const lines = Array.isArray(config.lines) ? config.lines : [];
    lines.forEach(function(line){
      y += 12;
      doc.text(safeText(line), marginX, y);
    });

    const metadata = Array.isArray(config.metadata) ? config.metadata : [];
    metadata.forEach(function(item){
      y += 12;
      doc.setFont('helvetica', 'bold');
      doc.text(safeText(item.label) + ':', marginX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(safeText(item.value), marginX + Number(item.valueOffset || 88), y);
    });

    return y;
  }

  function drawTable(doc, config){
    ensureAutoTable(doc);
    const columns = Array.isArray(config.columns) ? config.columns : [];
    const rows = Array.isArray(config.rows) ? config.rows : [];
    doc.autoTable({
      startY: Number(config.startY || 90),
      head: [columns.map(function(column){ return safeText(column.label); })],
      body: rows.map(function(row){ return columns.map(function(column){ return resolveValue(row, column); }); }),
      styles: Object.assign({ fontSize:7, cellPadding:3, valign:'middle', overflow:'linebreak' }, config.styles || {}),
      headStyles: Object.assign({ fillColor:[153, 27, 27], textColor:[255,255,255], fontStyle:'bold' }, config.headStyles || {}),
      alternateRowStyles: Object.assign({ fillColor:[254, 242, 242] }, config.alternateRowStyles || {}),
      columnStyles: config.columnStyles || {},
      margin: Object.assign({ left:36, right:36, bottom:32 }, config.margin || {}),
      didDrawPage: config.didDrawPage
    });
  }

  function exportTable(config){
    try{
      if(!config || !Array.isArray(config.rows) || !config.rows.length) throw new Error('No hay datos para exportar.');
      if(!Array.isArray(config.columns) || !config.columns.length) throw new Error('No se definieron columnas para el PDF.');
      ensureLibrary(config);
      const doc = createDocument(config);
      const y = drawHeader(doc, config);
      drawTable(doc, Object.assign({}, config, { startY:y + 16 }));
      addPageNumbers(doc, config.footerText);
      doc.save(fileSafe(config.fileName || config.title) + (config.appendDate === false ? '' : '_' + currentDateStamp()) + '.pdf');
      return true;
    }catch(error){
      alert(error.message);
      return false;
    }
  }

  function exportReport(config){
    try{
      if(!config || !Array.isArray(config.sections) || !config.sections.length) throw new Error('No se definieron secciones para el PDF.');
      ensureLibrary(config);
      const doc = createDocument(config);
      ensureAutoTable(doc);

      config.sections.forEach(function(section, index){
        if(index > 0) doc.addPage();
        const y = drawHeader(doc, {
          title:section.title || config.title,
          titleColor:section.titleColor || config.titleColor,
          titleSize:section.titleSize || config.titleSize,
          dateText:section.dateText || config.dateText,
          showDate:section.showDate !== undefined ? section.showDate : config.showDate,
          lines:section.lines || [],
          subtitleSize:section.subtitleSize || config.subtitleSize,
          metadata:section.metadata || [],
          marginX:section.marginX || config.marginX
        });

        if(section.summary && Array.isArray(section.summary)){
          let sy = y + 15;
          section.summary.forEach(function(item){
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(31, 41, 55);
            doc.text(safeText(item.label) + ':', 36, sy);
            doc.setFont('helvetica', 'normal');
            doc.text(safeText(item.value), 124, sy);
            sy += 14;
          });
          drawTable(doc, Object.assign({}, section, { startY:sy + 6 }));
        }else{
          drawTable(doc, Object.assign({}, section, { startY:y + 16 }));
        }
      });

      addPageNumbers(doc, config.footerText);
      doc.save(fileSafe(config.fileName || config.title) + (config.appendDate === false ? '' : '_' + currentDateStamp()) + '.pdf');
      return true;
    }catch(error){
      alert(error.message);
      return false;
    }
  }

  window.ManttoPdf_gnral = Object.freeze({
    exportTable: exportTable,
    exportReport: exportReport,
    exportCsv: exportCsv,
    currentDateStamp: currentDateStamp
  });
})();
