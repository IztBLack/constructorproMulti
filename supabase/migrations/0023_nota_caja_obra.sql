-- 0023_nota_caja_obra.sql — Nota de conciliación de caja por obra
-- Depende de: 0001 (empresas), 0002 (obras), 0022 (rol contador)
--
-- Nace del Excel de la contadora, que al pie lleva apuntes de conciliación como
-- "DIFERENCIA A FAVOR $20,957.46 CON CONCRETOS DE VERACRUZ". Es texto libre suyo.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN `obras`:
-- la nota la escribe la CONTADORA, pero su rol (0022) solo tiene LECTURA sobre
-- `obras` — no debe poder editar nombre, cliente, avance, etc. RLS es por FILA,
-- no por columna, así que no se puede "dejarle editar solo esta columna" de
-- obras. Una tabla 1-a-1 con su propia policy resuelve el alcance: aquí sí
-- escribe, en `obras` no.

create table if not exists public.obra_caja_nota (
  obra_id            uuid primary key references public.obras(id) on delete cascade,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nota               text not null default '',
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

alter table public.obra_caja_nota enable row level security;

-- Lectura: todo el personal + la contadora (la nota es parte del panorama de
-- dinero de la obra).
drop policy if exists obra_caja_nota_read on public.obra_caja_nota;
create policy obra_caja_nota_read on public.obra_caja_nota
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador', 'contador')
  );

-- Escritura: quien lleva las cuentas — admin, supervisor y contador. El
-- colaborador de campo no escribe conciliaciones.
drop policy if exists obra_caja_nota_insert on public.obra_caja_nota;
create policy obra_caja_nota_insert on public.obra_caja_nota
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

drop policy if exists obra_caja_nota_update on public.obra_caja_nota;
create policy obra_caja_nota_update on public.obra_caja_nota
  for update
  using      (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

-- Sella server_updated_at igual que el resto de tablas sincronizables.
drop trigger if exists trg_srv_upd on public.obra_caja_nota;
create trigger trg_srv_upd
  before insert or update on public.obra_caja_nota
  for each row execute function public.set_server_updated_at();
