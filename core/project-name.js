(function(){
  const MONTHS = {
    '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril',
    '05':'Mayo','06':'Junio','07':'Julio','08':'Agosto',
    '09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'
  };

  const MONTH_NAMES = {
    enero:1, ene:1, january:1, jan:1,
    febrero:2, feb:2, february:2,
    marzo:3, mar:3, march:3,
    abril:4, abr:4, april:4, apr:4,
    mayo:5, may:5,
    junio:6, jun:6, june:6,
    julio:7, jul:7, july:7,
    agosto:8, ago:8, august:8, aug:8,
    septiembre:9, setiembre:9, sep:9, sept:9, september:9,
    octubre:10, oct:10, october:10,
    noviembre:11, nov:11, november:11,
    diciembre:12, dic:12, dec:12, december:12
  };

  function cleanText(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizeWord(value){
    return cleanText(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'');
  }

  function pad2(value){
    return String(Number(value)).padStart(2,'0');
  }

  function validParts(numero, mes, dia){
    const project = Number(numero);
    const month = Number(mes);
    const day = Number(dia);

    if(!Number.isInteger(project) || project < 0) return false;
    if(!Number.isInteger(month) || month < 1 || month > 12) return false;
    if(!Number.isInteger(day) || day < 1 || day > 31) return false;

    const daysByMonth = [31,29,31,30,31,30,31,31,30,31,30,31];
    return day <= daysByMonth[month - 1];
  }

  function renderParts(numero, mes, dia){
    if(!validParts(numero, mes, dia)) return null;

    const project = String(Number(numero));
    const monthKey = pad2(mes);
    const day = String(Number(dia));

    return day + ' de ' + MONTHS[monthKey] + ' #' + project;
  }

  function parseNumericDate(raw){
    const match = raw.match(/^(\d{1,6})\s*([\/.-])\s*(\d{1,2})\s*\2\s*(\d{1,6})(?:[T\s].*)?$/);
    if(!match) return null;

    const a = Number(match[1]);
    const b = Number(match[3]);
    const c = Number(match[4]);

    // Formato canonico del proyecto: NUMERO-MM-DD.
    if(validParts(a,b,c)) return { numero:a, mes:b, dia:c };

    // Formato latino: DD-MM-AAAA / DD/MM/AAAA / DD.MM.AAAA.
    if(validParts(c,b,a)) return { numero:c, mes:b, dia:a };

    // Formato estadounidense: MM-DD-AAAA / MM/DD/AAAA.
    if(validParts(c,a,b)) return { numero:c, mes:a, dia:b };

    return null;
  }

  function parseNamedDate(raw){
    const normalized = normalizeWord(raw)
      .replace(/,/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    // 16 de septiembre de 0197 / 16 septiembre 0197 / 16 Sep 197
    let match = normalized.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?#?(\d{1,6})$/);
    if(match){
      const month = MONTH_NAMES[match[2]];
      if(month && validParts(match[3],month,match[1])){
        return { numero:Number(match[3]), mes:month, dia:Number(match[1]) };
      }
    }

    // September 16 0197 / Sep 16 197
    match = normalized.match(/^([a-z]+)\s+(\d{1,2})\s+#?(\d{1,6})$/);
    if(match){
      const month = MONTH_NAMES[match[1]];
      if(month && validParts(match[3],month,match[2])){
        return { numero:Number(match[3]), mes:month, dia:Number(match[2]) };
      }
    }

    return null;
  }

  function parseProjectDate(value){
    if(value instanceof Date && !Number.isNaN(value.getTime())){
      const numero = value.getUTCFullYear();
      const mes = value.getUTCMonth() + 1;
      const dia = value.getUTCDate();
      return validParts(numero,mes,dia) ? { numero,mes,dia } : null;
    }

    const raw = cleanText(value);
    if(!raw) return null;

    return parseNumericDate(raw) || parseNamedDate(raw);
  }

  function projectName(value, fallback){
    const raw = cleanText(value);
    if(!raw) return fallback === undefined ? '—' : fallback;

    // Si ya esta formateado por esta funcion, se conserva tal cual.
    if(/^\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+\s+#\d+$/u.test(raw)){
      return raw;
    }

    const parsed = parseProjectDate(value);
    if(!parsed) return raw;

    return renderParts(parsed.numero,parsed.mes,parsed.dia) || raw;
  }

  window.ManttoFormat = window.ManttoFormat || {};
  window.ManttoFormat.projectName = projectName;
})();
