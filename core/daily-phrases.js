(function(){
  const PHRASES = [
    'La eficiencia no es hacer las cosas rapido, es hacer las cosas correctas.',
    'El orden de hoy evita la urgencia de manana.',
    'Cada seguimiento cerrado es una operacion mas clara.',
    'Lo que se mide a tiempo, se corrige a tiempo.',
    'Un buen sistema no solo informa: ayuda a decidir.',
    'La prioridad correcta cambia el resultado del dia.',
    'La comunicacion clara reduce retrabajos.',
    'Primero lo critico, despues lo importante, nunca al reves.',
    'La mejora continua empieza con una accion pequena bien hecha.',
    'Un dato confiable vale mas que una suposicion rapida.',
    'Dar seguimiento tambien es resolver.',
    'La operacion fluye mejor cuando todos saben que sigue.',
    'Una tarea visible es una tarea que puede avanzar.',
    'El mejor reporte es el que permite actuar.',
    'La constancia convierte el control en cultura.',
    'Menos pendientes ocultos, mas avance real.',
    'La calidad se construye en cada cierre.',
    'Un equipo alineado trabaja con menos friccion.',
    'Lo urgente se atiende; lo recurrente se corrige.',
    'Cada interaccion debe acercarnos a una solucion.',
    'El mantenimiento tambien empieza con informacion ordenada.',
    'La trazabilidad protege la operacion.',
    'Lo que se documenta bien se puede mejorar.',
    'Resolver rapido importa; resolver bien importa mas.',
    'Un buen dia operativo empieza con prioridades claras.',
    'El seguimiento oportuno evita escalaciones innecesarias.',
    'Cada modulo debe ayudar a trabajar, no solo a consultar.',
    'El control no es vigilar: es dar visibilidad.',
    'La informacion correcta en el momento correcto cambia decisiones.',
    'Un pendiente menos es espacio para prevenir.',
    'La mejor alerta es la que llega antes del problema mayor.'
  ];

  function dayOfYear(date){
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
    return Math.floor(diff / 86400000);
  }

  function getDailyPhrase(date = new Date()){
    const idx = dayOfYear(date) % PHRASES.length;
    return PHRASES[idx];
  }

  window.ManttoDailyPhrases = {
    list: PHRASES.slice(),
    getDailyPhrase
  };
})();
