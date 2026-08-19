-- 0029_sueldo_drop_columnas_viejas.sql
-- SEGURIDAD (segunda mitad de 0027): quitar las columnas de sueldo de
-- `colaboradores`, para que el rol `colaborador` deje de poder leerlas.
--
-- ══ NO CORRAS ESTA MIGRACIÓN TODAVÍA ════════════════════════════════════════
--
-- Requisitos, los DOS:
--   1. La 0027 aplicada (crea `colaborador_sueldo` y copia los datos).
--   2. **Todos** los teléfonos con la versión nueva de la app (la que trae el
--      esquema Drift v10 y sincroniza `colaborador_sueldo`).
--
-- El motivo del segundo: un teléfono con la versión anterior manda
-- `salario_personalizado`, `periodo_pago`, `salario_periodo` y `dias_semana` en
-- cada push de `colaboradores`. En cuanto estas columnas no existan, PostgREST
-- responde PGRST204 («column not found») y ese teléfono se queda con el sync
-- atorado en rojo, sin poder subir NADA de esa tabla — ni asistencias del día.
--
-- Cómo comprobar que ya se puede, antes de correrla: en cada dispositivo, que la
-- pantalla de nube diga la versión nueva y no haya pendientes. Son pocos
-- equipos y son de la empresa, así que es una comprobación de vista, no un
-- problema de despliegue masivo.
--
-- Si aun así se corriera antes de tiempo, el arreglo es actualizar el APK del
-- teléfono afectado: los datos locales no se pierden (siguen en su SQLite) y el
-- push se destraba solo en el siguiente ciclo.
--
-- Hasta que se aplique, el hallazgo A3 sigue mitigado solo por los gates de la
-- aplicación (web y móvil): un colaborador no ve la nómina en pantalla, pero
-- podría consultar `colaboradores` directo con su propia sesión.
--
-- Depende de: 0027. Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- Red de seguridad: no dejes ir un dato que no esté copiado. Si esta consulta
-- devuelve algo, PARA y revisa la 0027 antes de seguir.
do $$
declare huerfanos bigint;
begin
  select count(*) into huerfanos
    from public.colaboradores c
   where (c.salario_personalizado is not null or c.salario_periodo is not null)
     and not exists (
       select 1 from public.colaborador_sueldo s where s.colaborador_id = c.id
     );

  if huerfanos > 0 then
    raise exception
      'Hay % colaboradores con sueldo que NO están en colaborador_sueldo. Corre 0027 primero.',
      huerfanos;
  end if;
end $$;

alter table public.colaboradores
  drop column if exists salario_personalizado,
  drop column if exists periodo_pago,
  drop column if exists salario_periodo,
  drop column if exists dias_semana;

-- Comprobación: con sesión de colaborador, esto ya no debe listar ninguna
-- columna de sueldo.
--   select column_name from information_schema.columns
--    where table_name = 'colaboradores' order by ordinal_position;
