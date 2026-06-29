const db = require('../config/db');

/* ==========================================
   CENTRO DE AYUDA
========================================== */

async function getMenu(req, res) {
    try {

        // Obtener el nodo principal
        const [nodos] = await db.query(`
            SELECT
                id_nodo,
                titulo_nodo,
                descripcion_nodo,
                tipo_nodo
            FROM sup_nodos
            WHERE id_nodo = 1
              AND activo = 1
            LIMIT 1
        `);

        if (!nodos.length) {
            return res.status(404).json({
                ok: false,
                message: 'No se encontró el menú principal.'
            });
        }

        // Obtener sus opciones
        const [opciones] = await db.query(`
            SELECT
                id_opcion,
                texto_opcion,
                accion_opcion,
                id_destino,
                orden_visualizacion
            FROM sup_opciones
            WHERE id_nodo = 1
              AND activo = 1
            ORDER BY orden_visualizacion ASC
        `);

        return res.json({
            ok: true,
            source: 'support_menu',
            data: {
                nodo: nodos[0],
                opciones: opciones
            }
        });

    } catch (error) {

        return res.status(500).json({
            ok: false,
            message: 'Error consultando el menú del Centro de Ayuda.',
            error: error.message
        });

    }
}

module.exports = {
    getMenu
};