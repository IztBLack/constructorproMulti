-- 0028_bucket_cotizaciones_limites.sql
-- SEGURIDAD: ponerle al bucket `cotizaciones` los mismos límites que ya tiene
-- `comprobantes` desde 0024.
--
-- El hallazgo (auditoría del 2026-08-17): 0007 creó `cotizaciones` sin
-- `file_size_limit` ni `allowed_mime_types`, y el Server Action que sube
-- (`web/src/app/admin/cotizaciones/[id]/archivos-actions.ts`) solo validaba el
-- TAMAÑO; el `contentType` salía tal cual del cliente. Es decir: alguien del
-- personal podía guardar un `text/html` en el bucket y quedarse con una URL
-- firmada que lo sirve. Riesgo acotado —hace falta ser staff, y el objeto se
-- sirve desde el dominio de Storage, no desde el de la app— pero la asimetría
-- con `comprobantes` no tenía ninguna razón de ser.
--
-- Van las dos mitades: la lista blanca en el Server Action (ya aplicada) y esta,
-- que es la que de verdad para una subida hecha a mano contra Storage.
--
-- El límite de 15 MB es el que ya usaba el Server Action (`MAX_BYTES`), no uno
-- nuevo: las cotizaciones traen planos escaneados y pesan más que un
-- comprobante de pago.
--
-- Depende de: 0007 (crea el bucket). Correr en el SQL Editor de Supabase.
--
-- NO toca las policies: quién puede leer/subir/borrar sigue igual que en 0007
-- (admin/supervisor/colaborador de la empresa dueña de la primera carpeta).

update storage.buckets
   set file_size_limit   = 15728640,  -- 15 MB
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'application/pdf'
       ]
 where id = 'cotizaciones';

-- Comprobación: debe devolver una fila con los dos campos ya poblados.
--   select id, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'cotizaciones';
