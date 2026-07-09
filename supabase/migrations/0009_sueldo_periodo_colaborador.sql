-- 0009_sueldo_periodo_colaborador.sql
-- Captura del sueldo por PERIODO (semanal/quincenal/mensual) en colaboradores.
-- El salario diario (colaboradores.salario_personalizado) deja de capturarse a
-- mano: ahora se DERIVA del sueldo del periodo y de los días trabajados/semana.
--
-- Contrato de nómina INTACTO: nómina sigue leyendo salario_personalizado (MXN/día);
-- aquí solo agregamos de dónde sale ese número. Cambio aditivo y con defaults, así
-- que el push del móvil (que no conoce estas columnas) no las pisa.
-- Depende de: 0001-0008. Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

alter table public.colaboradores
  -- Esquema de pago del sueldo base capturado por el usuario.
  add column if not exists periodo_pago text not null default 'MENSUAL',
  -- Monto del sueldo tal cual lo captura el usuario (para el periodo elegido).
  add column if not exists salario_periodo double precision,
  -- Días trabajados por semana (5, 6 o 7) que definen el divisor a diario.
  add column if not exists dias_semana smallint not null default 6;

alter table public.colaboradores
  drop constraint if exists colaboradores_periodo_pago_chk;
alter table public.colaboradores
  add constraint colaboradores_periodo_pago_chk
  check (periodo_pago in ('SEMANAL', 'QUINCENAL', 'MENSUAL'));

alter table public.colaboradores
  drop constraint if exists colaboradores_dias_semana_chk;
alter table public.colaboradores
  add constraint colaboradores_dias_semana_chk
  check (dias_semana between 1 and 7);
