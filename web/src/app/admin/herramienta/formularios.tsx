'use client';

import { useState, useTransition } from 'react';
import { Button, Modal } from '@/components/ui';
import {
  ESTADOS_HERRAMIENTA,
  ETIQUETA_ESTADO_HERRAMIENTA,
  ETIQUETA_TIPO_HERRAMIENTA,
  TIPOS_HERRAMIENTA,
} from '@/lib/herramienta/herramienta';
import type { Herramienta } from '@/lib/data/herramienta';
import { cambiarTipoAsignacion, devolverHerramienta, guardarHerramienta, prestarHerramienta } from './actions';

const CAMPO = 'mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900';

type Opcion = { id: string; nombre: string };

function ErrorForm({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {error}
    </p>
  );
}

// ── Alta / edición ──────────────────────────────────────────────────────────

export function FormHerramienta({ inicial, textoBoton }: { inicial: Herramienta | null; textoBoton: string }) {
  const [abierto, setAbierto] = useState(false);
  const [id, setId] = useState(() => inicial?.id ?? crypto.randomUUID());
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [tipo, setTipo] = useState<string>(inicial?.tipo ?? 'HERRAMIENTA');
  const [clave, setClave] = useState(inicial?.clave ?? '');
  const [serie, setSerie] = useState(inicial?.serie ?? '');
  const [estado, setEstado] = useState<string>(inicial?.estado ?? 'BUENO');
  const [costo, setCosto] = useState(inicial?.costo?.toString() ?? '');
  const [notas, setNotas] = useState(inicial?.notas ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await guardarHerramienta({ id, nombre, tipo, clave, serie, estado, costo, notas }, !inicial);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.');
        return;
      }
      setAbierto(false);
      if (!inicial) {
        // Lista para la siguiente alta.
        setId(crypto.randomUUID());
        setNombre('');
        setClave('');
        setSerie('');
        setCosto('');
        setNotas('');
      }
    });
  }

  return (
    <>
      <Button
        variant={inicial ? 'secondary' : 'primary'}
        data-guia={inicial ? undefined : 'herramienta-nueva'}
        onClick={() => setAbierto(true)}
      >
        {textoBoton}
      </Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title={inicial ? 'Editar herramienta' : 'Nueva herramienta'}>
        <form onSubmit={enviar} className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Nombre</span>
            <input
              required
              maxLength={120}
              data-guia={inicial ? undefined : 'herramienta-form-nombre'}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Revolvedora de 1 saco, rotomartillo…"
              className={CAMPO}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO}>
                {TIPOS_HERRAMIENTA.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_HERRAMIENTA[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Estado</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={CAMPO}>
                {ESTADOS_HERRAMIENTA.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_ESTADO_HERRAMIENTA[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Número de inventario (opcional)</span>
              <input maxLength={60} value={clave} onChange={(e) => setClave(e.target.value)} placeholder="H-014" className={CAMPO} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Número de serie (opcional)</span>
              <input maxLength={80} value={serie} onChange={(e) => setSerie(e.target.value)} className={CAMPO} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Lo que costó (opcional)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                className={CAMPO}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Notas (opcional)</span>
            <input maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} className={CAMPO} />
          </label>
          <ErrorForm error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pendiente} data-guia={inicial ? undefined : 'herramienta-form-guardar'}>
              {pendiente ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Prestar o asignar de planta ─────────────────────────────────────────────

type Modo = 'PRESTAMO' | 'PLANTA';

const MODOS: { valor: Modo; titulo: string; ayuda: string }[] = [
  {
    valor: 'PRESTAMO',
    titulo: 'Préstamo (con fecha de regreso)',
    ayuda:
      'Va a regresar a bodega. Si pones la fecha, te avisa cuando se pase; sin fecha, a los 30 días pide confirmar dónde está.',
  },
  {
    valor: 'PLANTA',
    titulo: 'Asignación permanente (queda a cargo de alguien o de la obra)',
    ayuda:
      'Para la camioneta del cabo o el equipo que una cuadrilla trae toda la obra. No lleva fecha ni avisos; cuando vuelva, registras su regreso igual.',
  },
];

/** Préstamo o de planta, con su explicación. Radios nativos: teclado y lector de pantalla sin trucos. */
function ElegirModo({ modo, onChange, nombre }: { modo: Modo; onChange: (m: Modo) => void; nombre: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-neutral-700">¿Cómo sale?</legend>
      {MODOS.map((m) => (
        <label
          key={m.valor}
          className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
            modo === m.valor ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-300 bg-white'
          }`}
        >
          <input
            type="radio"
            name={nombre}
            value={m.valor}
            checked={modo === m.valor}
            onChange={() => onChange(m.valor)}
            aria-describedby={`${nombre}-${m.valor}-ayuda`}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            <span className="block font-medium text-neutral-900">{m.titulo}</span>
            <span id={`${nombre}-${m.valor}-ayuda`} className="block text-neutral-600">
              {m.ayuda}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function Prestar({
  herramienta,
  obras,
  responsables,
  hoy,
}: {
  herramienta: { id: string; nombre: string };
  obras: Opcion[];
  responsables: Opcion[];
  hoy: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<Modo>('PRESTAMO');
  const [obraId, setObraId] = useState('');
  const [colaboradorId, setColaboradorId] = useState('');
  const [desde, setDesde] = useState(hoy);
  const [devolver, setDevolver] = useState('');
  const [entrego, setEntrego] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await prestarHerramienta({
        herramientaId: herramienta.id,
        obraId: obraId || null,
        colaboradorId: colaboradorId || null,
        desde,
        devolverAntes: modo === 'PLANTA' ? null : devolver || null,
        permanente: modo === 'PLANTA',
        entregoNombre: entrego,
        notas,
      });
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else setAbierto(false);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}>
        Prestar o asignar
      </Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title={`Prestar o asignar: ${herramienta.nombre}`}>
        <form onSubmit={enviar} className="space-y-3">
          <ElegirModo modo={modo} onChange={setModo} nombre={`modo-${herramienta.id}`} />
          <p className="text-sm text-neutral-600">
            {modo === 'PLANTA'
              ? 'Elige la obra, quién queda a cargo o las dos.'
              : 'Elige la obra, quién se la lleva o las dos.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Obra</span>
              <select value={obraId} onChange={(e) => setObraId(e.target.value)} className={CAMPO}>
                <option value="">Sin obra</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Responsable</span>
              <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className={CAMPO}>
                <option value="">Nadie en particular</option>
                {responsables.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Sale el día</span>
              <input type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} className={CAMPO} />
            </label>
            {modo === 'PRESTAMO' && (
              <label className="block text-sm">
                <span className="font-medium text-neutral-700">Debe regresar (opcional)</span>
                <input type="date" min={desde} value={devolver} onChange={(e) => setDevolver(e.target.value)} className={CAMPO} />
              </label>
            )}
          </div>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Entregó</span>
            <input maxLength={120} value={entrego} onChange={(e) => setEntrego(e.target.value)} className={CAMPO} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Notas (opcional)</span>
            <input
              maxLength={500}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Sale con 2 discos y su llave"
              className={CAMPO}
            />
          </label>
          <ErrorForm error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : modo === 'PLANTA' ? 'Asignar de planta' : 'Prestar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Registrar regreso ───────────────────────────────────────────────────────

export function Devolver({
  herramienta,
  prestamoId,
  hoy,
}: {
  herramienta: { id: string; nombre: string };
  prestamoId: string;
  hoy: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [hasta, setHasta] = useState(hoy);
  const [recibio, setRecibio] = useState('');
  const [estado, setEstado] = useState<string>('BUENO');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await devolverHerramienta({
        prestamoId,
        herramientaId: herramienta.id,
        hasta,
        recibioNombre: recibio,
        estadoRegreso: estado,
        notas,
      });
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else setAbierto(false);
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>
        Registrar regreso
      </Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title={`Regresó: ${herramienta.nombre}`}>
        <form onSubmit={enviar} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Día en que regresó</span>
              <input type="date" required max={hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">¿Cómo regresó?</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={CAMPO}>
                <option value="BUENO">Bien</option>
                <option value="REPARACION">Necesita reparación</option>
                <option value="BAJA">Se perdió o ya no sirve (baja)</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Recibió</span>
            <input maxLength={120} value={recibio} onChange={(e) => setRecibio(e.target.value)} className={CAMPO} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Notas (opcional)</span>
            <input
              maxLength={300}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Le falta la llave del mandril"
              className={CAMPO}
            />
          </label>
          <p className="text-xs text-neutral-500">
            Un préstamo cerrado ya no se cambia: queda en el historial de la herramienta.
          </p>
          <ErrorForm error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : 'Registrar regreso'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Préstamo ↔ de planta (mientras siga abierto) ───────────────────────────

export function CambiarTipo({
  herramienta,
  prestamoId,
  permanente,
  destino,
  desde,
}: {
  herramienta: { id: string; nombre: string };
  prestamoId: string;
  permanente: boolean;
  /** "Obra · Persona", para decir a cargo de quién queda. */
  destino: string;
  /** Día de salida (yyyy-mm-dd): la fecha de regreso no puede ser antes. */
  desde: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [devolver, setDevolver] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const aPlanta = !permanente;
  const accion = aPlanta ? 'Dejar de planta' : 'Volver préstamo';

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await cambiarTipoAsignacion({
        prestamoId,
        herramientaId: herramienta.id,
        permanente: aPlanta,
        devolverAntes: aPlanta ? null : devolver || null,
      });
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else setAbierto(false);
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>
        {accion}
      </Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title={`${accion}: ${herramienta.nombre}`}>
        <form onSubmit={enviar} className="space-y-3">
          {aPlanta ? (
            <p className="text-sm text-neutral-700">
              Deja de ser un préstamo: queda a cargo de {destino || 'quien la tiene'}, sin fecha de regreso y sin avisos.
              Cuando vuelva a bodega, registra su regreso como siempre.
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-700">
                Vuelve a contar como préstamo: si pones fecha, te avisa cuando se pase; sin fecha, a los 30 días pide
                confirmar dónde está.
              </p>
              <label className="block text-sm">
                <span className="font-medium text-neutral-700">Debe regresar (opcional)</span>
                <input type="date" min={desde} value={devolver} onChange={(e) => setDevolver(e.target.value)} className={CAMPO} />
              </label>
            </>
          )}
          <ErrorForm error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : accion}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
