window.MANTTO_MOCK = {
  user:{ id:1, nombre:'Joseph Vera', iniciales:'JV', rol:'Programador' },
  tasks:[
    {id:101,tipo:'PERSONAL',titulo:'Revisar avance de Nori en Centro de Ayuda',prioridad:'CRITICA',estatus:'En proceso',due:'Hoy 18:00',proyecto:'Mantto Gestor',equipo:null,responsables:['JV'],subtareas:4,comentarios:2,route:{module:'tareas',id:101}},
    {id:102,tipo:'PERSONAL',titulo:'Validar estructura modular del Proyecto Final',prioridad:'ALTA',estatus:'Pendiente',due:'Mañana',proyecto:'Mantto Gestor',equipo:null,responsables:['JV'],subtareas:2,comentarios:1,route:{module:'tareas',id:102}},
    {id:103,tipo:'PERSONAL',titulo:'Probar permisos del Panel de Control',prioridad:'MEDIA',estatus:'Pendiente',due:'Vie 12:00',proyecto:'Mantto Gestor',equipo:null,responsables:['JV'],subtareas:0,comentarios:0,route:{module:'tareas',id:103}},
    {id:201,tipo:'COLABORATIVA',titulo:'Cerrar ajustes visuales del HOME definitivo',prioridad:'CRITICA',estatus:'En proceso',due:'Hoy',proyecto:'Mantto Gestor',equipo:null,responsables:['JV','AR','RR'],subtareas:6,comentarios:5,route:{module:'tareas',id:201}},
    {id:202,tipo:'COLABORATIVA',titulo:'Revisar tickets fuera de SLA de CNB',prioridad:'ALTA',estatus:'Pendiente',due:'Mañana',proyecto:'CNB',equipo:'CNB-021',responsables:['AR','VN'],subtareas:3,comentarios:4,route:{module:'tickets',id:'TK-2451'}},
    {id:203,tipo:'COLABORATIVA',titulo:'Actualizar portafolio de OCC por movimientos recientes',prioridad:'MEDIA',estatus:'Pendiente',due:'Viernes',proyecto:'OCC',equipo:'OCC-118',responsables:['JP','AM'],subtareas:1,comentarios:0,route:{module:'portafolio',id:'OCC-118'}}
  ],
  notifications:[
    {id:1,icon:'🎫',title:'Ticket actualizado',text:'TK-2451 cambió a En curso',time:'Hace 4 min',unread:true,route:{module:'tickets',id:'TK-2451'}},
    {id:2,icon:'💬',title:'Nuevo comentario',text:'Arturo comentó una tarea colaborativa',time:'Hace 11 min',unread:true,route:{module:'tareas',id:201}},
    {id:3,icon:'🚨',title:'Equipo crítico detectado',text:'CNB-021 superó el umbral de fallas BLT',time:'Hace 22 min',unread:false,route:{module:'criticos',id:'CNB-021'}},
    {id:4,icon:'🏢',title:'Portafolio actualizado',text:'OCC-118 cambió estatus operativo',time:'Hoy 10:12',unread:false,route:{module:'portafolio',id:'OCC-118'}},
    {id:5,icon:'👤',title:'Usuario editado',text:'Se actualizó perfil de supervisor',time:'Ayer 17:40',unread:false,route:{module:'usuarios',id:'USR-12'}},
    {id:6,icon:'🛠️',title:'Permiso modificado',text:'Rol Programador recibió acceso a Panel de Control',time:'Ayer 16:05',unread:false,route:{module:'panel-control',id:'permisos'}}
  ],
  activities:[
    {id:1,icon:'📁',title:'Proyecto Mantto Gestor',text:'Abriste detalle del proyecto',time:'Hace 3 min',route:{module:'proyectos',id:'Mantto Gestor'}},
    {id:2,icon:'🎫',title:'Ticket TK-2451',text:'Comentaste en el ticket',time:'Hace 9 min',route:{module:'tickets',id:'TK-2451'}},
    {id:3,icon:'📦',title:'Equipo OCC-118',text:'Consultaste historial de equipo',time:'Hace 18 min',route:{module:'portafolio',id:'OCC-118'}},
    {id:4,icon:'👥',title:'Usuarios',text:'Revisaste permisos por rol',time:'Hace 32 min',route:{module:'usuarios',id:'roles'}},
    {id:5,icon:'🤖',title:'Nori',text:'Probaste flujo de solicitud de soporte',time:'Hace 48 min',route:{module:'nori',id:'soporte'}}
  ]
};
