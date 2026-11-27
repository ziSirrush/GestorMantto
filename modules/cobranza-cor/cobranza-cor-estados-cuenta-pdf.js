(function(){
  'use strict';
  // BLT NOW - Estado de Cuenta - PDF nativo V004 (QA en GitHub Pages).
  // Read only the currently rendered, scoped project detail. Never recalculate money.
  if(window.ManttoCobranzaCorEstadoCuentaPdf) return;

  const ROUTE='cobranza-estados-cuenta';
  // Bandera de liberacion: activa durante QA autorizado en GitHub Pages.
  const PDF_EXPORT_ENABLED_COR=true;
  const BUTTON_ID='ccor-ec-pdf-export';
  const DETAIL_SELECTOR='#view-placeholder .ccor-ec-detail-page';
  const MARGIN=32;
  const BOTTOM_MARGIN=42;
  const BLUE=[11,112,189];
  const ORANGE=[227,107,10];
  const GREEN=[125,155,41];
  const TEXT=[23,58,95];
  const MUTED=[102,121,141];
  let busy=false;

  function clean(value){
    return String(value===null||value===undefined?'':value).replace(/\s+/g,' ').trim();
  }
  function textOf(node){return clean(node&&node.textContent);}
  function fileSafe(value){
    return clean(value||'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'proyecto';
  }
  function currentRoute(){
    const router=window.ManttoRouter;
    return router&&typeof router.getCurrent==='function'
      ? clean((router.getCurrent()||{}).route) : '';
  }
  function detailView(){
    return currentRoute()===ROUTE?document.querySelector(DETAIL_SELECTOR):null;
  }
  function extractProject(view){
    const out={};
    view.querySelectorAll('.ccor-ec-project-header > div').forEach(el=>{
      const label=textOf(el.querySelector('span')).toLowerCase();
      if(label) out[label]=textOf(el.querySelector('b'))||'--';
    });
    return out;
  }
  function extractSummary(view,selector){
    const root=view.querySelector(selector);
    if(!root) return [];
    return Array.from(root.querySelectorAll('.ccor-ec-summary-line')).map(line=>{
      const parts=Array.from(line.children).map(el=>textOf(el.querySelector('b'))||textOf(el));
      return {
        moneda:parts[0]||'--',
        total:parts[1]||'--',
        cobrado:parts[2]||'--',
        pendiente:parts[3]||'--',
        porcentaje:parts[4]||'--'
      };
    });
  }
  function extractTable(view,selector){
    const table=view.querySelector(selector);
    if(!table) return {headers:[],rows:[]};
    const headers=Array.from(table.querySelectorAll('thead th')).map(textOf);
    const rows=Array.from(table.querySelectorAll('tbody tr')).map(tr=>{
      const cells=Array.from(tr.querySelectorAll('td')).map(td=>({
        value:textOf(td),
        span:Math.max(1,Number(td.colSpan)||1),
        pending:td.classList.contains('is-pending'),
        applied:td.classList.contains('is-applied')
      }));
      return {cells,total:tr.classList.contains('ccor-ec-total-row')};
    }).filter(row=>row.cells.length && !(
      row.cells.length===1 && /sin movimientos|sin aditivas/i.test(row.cells[0].value)
    ));
    return {headers,rows};
  }
  function extractView(view){
    const aditivas=extractTable(view,'.ccor-ec-account-section.is-aditivas table');
    return {
      proyecto:extractProject(view),
      suministro:extractSummary(view,'.ccor-ec-summary-card.is-supply'),
      instalacion:extractSummary(view,'.ccor-ec-summary-card.is-installation'),
      tablas:{
        suministro:extractTable(view,'.ccor-ec-account-section.is-supply table'),
        instalacion:extractTable(view,'.ccor-ec-account-section.is-installation table'),
        aditivas:aditivas.rows.length?aditivas:null
      },
      advertencia:textOf(view.querySelector('.ccor-ec-unknown-card'))
    };
  }
  function ensurePdf(){
    if(!window.jspdf||typeof window.jspdf.jsPDF!=='function')
      throw new Error('jsPDF no esta disponible. Revisa la conexion del navegador.');
  }
  function imageLoad(url){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>{
        try{
          const canvas=document.createElement('canvas');
          canvas.width=img.naturalWidth;
          canvas.height=img.naturalHeight;
          const ctx=canvas.getContext('2d');
          if(!ctx) throw new Error('Canvas no disponible');
          ctx.drawImage(img,0,0);
          resolve({data:canvas.toDataURL('image/png'),width:img.naturalWidth,height:img.naturalHeight});
        }catch(error){reject(error);}
      };
      img.onerror=()=>reject(new Error('No se pudo cargar el logotipo BLT NOW.'));
      img.src=url;
    });
  }
  function wrap(doc,str,width){
    return doc.splitTextToSize(clean(str)||'--',Math.max(10,width));
  }
  function projectLayout(doc,project,width){
    const pairs=[
      ['Proyecto',project.proyecto],['PPNS',project.ppns],['Cliente',project.cliente],
      ['Contractual',project.contractual],['A\u00f1o',project['a\u00f1o']||project.ano]
    ];
    doc.setFont('helvetica','bold');doc.setFontSize(8);
    const rows=pairs.map(([label,value])=>{
      const lines=wrap(doc,value||'--',width-119);
      return {label,lines,height:Math.max(20,lines.length*10+8)};
    });
    return {rows,height:Math.max(135,23+rows.reduce((sum,row)=>sum+row.height,0))};
  }
  function drawProjectTable(doc,project,x,y,width,height,layout){
    doc.setDrawColor(211,222,233);doc.setLineWidth(.55);
    doc.setFillColor(255,255,255);doc.roundedRect(x,y,width,height,7,7,'FD');
    doc.setFillColor(236,243,250);doc.rect(x+.5,y+.5,width-1,23,'F');
    doc.setTextColor(...TEXT);doc.setFont('helvetica','bold');doc.setFontSize(9);
    doc.text('DATOS GENERALES DEL PROYECTO',x+11,y+15);
    let yy=y+23;
    for(const row of layout.rows){
      doc.setDrawColor(230,236,242);doc.line(x,yy+row.height,x+width,yy+row.height);
      doc.setFont('helvetica','bold');doc.setFontSize(7.8);doc.setTextColor(...MUTED);
      doc.text(row.label,x+11,yy+13);
      doc.setFont('helvetica','normal');doc.setTextColor(...TEXT);
      doc.text(row.lines,x+105,yy+12);
      yy+=row.height;
    }
  }
  function drawSummary(doc,label,rows,color,x,y,width,height){
    doc.setDrawColor(...color);doc.setLineWidth(.55);
    doc.setFillColor(252,253,255);doc.roundedRect(x,y,width,height,7,7,'FD');
    doc.setFillColor(...color);doc.roundedRect(x,y,width,25,7,7,'F');
    doc.rect(x,y+13,width,12,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(255,255,255);
    doc.text(label,x+11,y+16);
    if(!rows.length){
      doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...MUTED);
      doc.text('Sin movimientos',x+12,y+48);
      return;
    }
    const rowHeight=(height-25)/rows.length;
    rows.forEach((row,i)=>{
      const yy=y+25+i*rowHeight;
      if(i){doc.setDrawColor(230,236,243);doc.line(x+4,yy,x+width-4,yy);}
      doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(...color);
      doc.text(row.moneda,x+10,yy+19);
      const names=['Monto inicial','Monto cobrado','Monto pendiente','% cobrado'];
      const vals=[row.total,row.cobrado,row.pendiente,row.porcentaje];
      const left=x+50, cw=(width-57)/4;
      for(let k=0;k<4;k++){
        doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(...MUTED);
        doc.text(names[k],left+k*cw,yy+11);
        doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(...TEXT);
        const lines=wrap(doc,vals[k],cw-5).slice(0,3);
        doc.text(lines,left+k*cw,yy+23);
      }
    });
  }
  function drawHeader(doc,data,logo){
    const W=doc.internal.pageSize.getWidth();
    const inner=W-2*MARGIN;
    const logoBox={x:MARGIN,y:22,w:241,h:65};
    const ratio=logo.width/logo.height;
    const w=Math.min(logoBox.w,logoBox.h*ratio),h=w/ratio;
    doc.addImage(logo.data,'PNG',logoBox.x,logoBox.y+(logoBox.h-h)/2,w,h);
    // El logo BLT es la unica identidad; el nombre del documento se centra en la hoja.
    doc.setTextColor(...TEXT);doc.setFont('helvetica','bold');doc.setFontSize(24);
    doc.text('ESTADO DE CUENTA',W/2,66,{align:'center'});
    doc.setDrawColor(212,224,236);doc.line(MARGIN,92,W-MARGIN,92);

    const gap=11,projectWidth=355,summaryWidth=(inner-projectWidth-2*gap)/2;
    const layout=projectLayout(doc,data.proyecto,projectWidth);
    const nRows=Math.max(data.suministro.length,data.instalacion.length,1);
    const sumHeight=Math.max(135,25+nRows*53);
    const height=Math.max(layout.height,sumHeight);
    const y=103;
    drawProjectTable(doc,data.proyecto,MARGIN,y,projectWidth,height,layout);
    drawSummary(doc,'SUMINISTRO',data.suministro,BLUE,MARGIN+projectWidth+gap,y,summaryWidth,height);
    drawSummary(doc,'INSTALACI\u00d3N',data.instalacion,ORANGE,MARGIN+projectWidth+gap+summaryWidth+gap,y,summaryWidth,height);
    return y+height+17;
  }
  function drawMovementTable(doc,title,table,color,startY){
    if(!table||!table.headers.length) return startY;
    const width=doc.internal.pageSize.getWidth();
    const inner=width-2*MARGIN;
    const n=table.headers.length;
    const isTwelve=n===12;
    const weights=isTwelve
      ? [5,14,9,5,9,8,9,11,9,9,7,11]
      : [10,9,12,11,21,12,7,7,6,9].slice(0,n);
    const weightSum=weights.reduce((a,b)=>a+b,0);
    const columnStyles={};
    for(let i=0;i<n;i++){
      columnStyles[i]={cellWidth:inner*(weights[i]||1)/weightSum};
      if((isTwelve&&[0,3,10].includes(i))||(!isTwelve&&[6].includes(i))) columnStyles[i].halign='center';
      if(i===1||(title==='ADITIVAS'&&[0,2,3,4,5].includes(i))) columnStyles[i].halign='left';
    }
    const headerRow=[{content:title,colSpan:n,styles:{fillColor:color,textColor:[255,255,255],fontStyle:'bold',fontSize:11,halign:'center',cellPadding:7}}];
    const headerLabels=table.headers.map(label=>({content:label}));
    const body=(table.rows.length?table.rows:[{cells:[{value:'Sin movimientos para esta secci\u00f3n.',span:n}],total:false}]).map(row=>row.cells.map(cell=>cell.span>1?{content:cell.value,colSpan:cell.span}:cell.value));
    const maxHeight=doc.internal.pageSize.getHeight();
    if(startY>maxHeight-130){doc.addPage();startY=MARGIN;}
    doc.autoTable({
      startY,
      head:[headerRow,headerLabels],
      body,
      showHead:'everyPage',
      theme:'plain',
      pageBreak:'auto',
      rowPageBreak:'avoid',
      margin:{left:MARGIN,right:MARGIN,top:MARGIN,bottom:BOTTOM_MARGIN},
      tableWidth:inner,
      styles:{font:'helvetica',fontSize:7.2,cellPadding:{top:7,bottom:7,left:4,right:4},overflow:'linebreak',valign:'middle',lineWidth:0,textColor:TEXT,halign:'right',minCellHeight:20},
      headStyles:{fillColor:color,textColor:[255,255,255],fontStyle:'bold',fontSize:7.6,halign:'center',cellPadding:5},
      bodyStyles:{fillColor:[255,255,255]},
      alternateRowStyles:{fillColor:[248,251,254]},
      columnStyles,
      didParseCell:function(cell){
        if(cell.section!=='body') return;
        const source=table.rows[cell.row.index];
        if(!source) return;
        if(source.total){
          cell.cell.styles.fillColor=title==='SUMINISTRO'?[228,240,251]:title==='INSTALACI\u00d3N'?[255,238,221]:[235,243,220];
          cell.cell.styles.fontStyle='bold';
        }else if(cell.column.index===n-1){
          cell.cell.styles.textColor=[165,58,43];
        }
      },
      didDrawCell:function(data){
        // Separadores discretos como en los dos dummys aprobados.
        if(data.section==='body'&&data.column.index===0){
          // AutoTable exposes row.height, but the vertical coordinate belongs to cell.y.
          const cell=data.cell;
          if(!cell||!Number.isFinite(cell.y)||!Number.isFinite(cell.height)) return;
          const bottom=cell.y+cell.height;
          doc.setDrawColor(229,237,245);doc.setLineWidth(.35);
          doc.line(MARGIN,bottom,doc.internal.pageSize.getWidth()-MARGIN,bottom);
        }
      }
    });
    return doc.lastAutoTable&&Number.isFinite(doc.lastAutoTable.finalY)
      ?doc.lastAutoTable.finalY+13:startY+38;
  }
  function drawWarning(doc,text,y){
    if(!text) return y;
    const height=29;
    if(y+height>doc.internal.pageSize.getHeight()-BOTTOM_MARGIN){doc.addPage();y=MARGIN;}
    doc.setFillColor(255,248,229);doc.setDrawColor(239,208,148);
    doc.roundedRect(MARGIN,y,doc.internal.pageSize.getWidth()-2*MARGIN,height,5,5,'FD');
    doc.setTextColor(131,81,14);doc.setFont('helvetica','normal');doc.setFontSize(9);
    doc.text(wrap(doc,text,doc.internal.pageSize.getWidth()-2*MARGIN-20).slice(0,2),MARGIN+9,y+13);
    return y+height+12;
  }
  function drawConditionalPageNumbers(doc){
    const count=doc.getNumberOfPages();
    if(count<=1) return;
    const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    for(let i=1;i<=count;i++){
      doc.setPage(i);
      doc.setFillColor(...ORANGE);
      doc.roundedRect(W-MARGIN-58,H-30,58,17,7,7,'F');
      doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);
      doc.text(i+' / '+count,W-MARGIN-29,H-19,{align:'center'});
    }
  }
  async function generateEstadoCuenta(){
    if(!PDF_EXPORT_ENABLED_COR||busy) return false;
    const view=detailView();
    if(!view) return false;
    busy=true;
    const button=view.querySelector('#'+BUTTON_ID);
    if(button){button.disabled=true;button.textContent='Generando PDF...';}
    try{
      ensurePdf();
      const data=extractView(view);
      if(!data.proyecto.ppns) throw new Error('No se identifico el proyecto seleccionado.');
      if(!data.tablas.suministro.headers.length||!data.tablas.instalacion.headers.length){
        throw new Error('La vista no contiene las dos tablas de Estado de Cuenta.');
      }
      const logo=await imageLoad(new URL('assets/logo.png',document.baseURI).href);
      const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'a3',compress:true});
      if(typeof doc.autoTable!=='function') throw new Error('jsPDF AutoTable no esta disponible.');
      doc.setProperties({title:'BLT NOW - Estado de Cuenta - '+data.proyecto.ppns,subject:'Estado de Cuenta'});
      let y=drawHeader(doc,data,logo);
      y=drawMovementTable(doc,'SUMINISTRO',data.tablas.suministro,BLUE,y);
      y=drawMovementTable(doc,'INSTALACI\u00d3N',data.tablas.instalacion,ORANGE,y);
      if(data.tablas.aditivas) y=drawMovementTable(doc,'ADITIVAS',data.tablas.aditivas,GREEN,y);
      y=drawWarning(doc,data.advertencia,y);
      drawConditionalPageNumbers(doc);
      doc.save('BLT_NOW_Estado_de_Cuenta_'+fileSafe(data.proyecto.ppns)+'.pdf');
      return true;
    }finally{
      busy=false;
      if(button&&button.isConnected){button.disabled=!PDF_EXPORT_ENABLED_COR;button.textContent=PDF_EXPORT_ENABLED_COR?'Exportar PDF':'PDF en revisión';}
    }
  }
  function ensureButton(){
    const view=detailView();
    const host=view&&view.querySelector('.ccor-ec-hero-actions');
    if(!host||host.querySelector('#'+BUTTON_ID)) return;
    const button=document.createElement('button');
    button.id=BUTTON_ID;button.type='button';
    button.className='ccor-ec-btn ccor-ec-btn-primary';
    button.disabled=!PDF_EXPORT_ENABLED_COR;
    button.textContent=PDF_EXPORT_ENABLED_COR?'Exportar PDF':'PDF en revisión';
    button.title=PDF_EXPORT_ENABLED_COR?'Descargar PDF generado por BLT NOW':'Formato en preparación técnica';
    if(!PDF_EXPORT_ENABLED_COR){button.style.opacity='0.55';button.style.cursor='not-allowed';}
    host.insertBefore(button,host.firstChild);
  }
  function initialize(){
    const root=document.getElementById('view-placeholder');
    if(root&&typeof MutationObserver==='function'){
      new MutationObserver(ensureButton).observe(root,{subtree:true,childList:true});
    }
    document.addEventListener('mantto:navigation',ensureButton);
    document.addEventListener('click',event=>{
      if(!event.target||!event.target.closest||!event.target.closest('#'+BUTTON_ID)) return;
      if(!detailView()) return;
      event.preventDefault();
      if(!PDF_EXPORT_ENABLED_COR) return;
      generateEstadoCuenta().catch(error=>{
        window.alert('No fue posible generar el PDF: '+clean(error&&error.message||error));
      });
    },true);
    ensureButton();
  }
  window.ManttoCobranzaCorEstadoCuentaPdf=Object.freeze({
    generate:generateEstadoCuenta,
    print:generateEstadoCuenta
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();