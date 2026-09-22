-- ============================================================
-- Reverso de la migración 003 — Eventos de producto
--
-- Se ejecuta con:  npm run db:rollback
--
-- OJO — esto BORRA DATOS:
--   - Se pierde TODO el historial de eventos. Las lecturas
--     (`content_views`) no se tocan, así que el panel sigue mostrando
--     vistas, pero se pierden las conversiones medidas hasta ahora.
--   - Es un borrado sin vuelta: los eventos no se pueden reconstruir.
-- ============================================================

DROP TABLE IF EXISTS events;
