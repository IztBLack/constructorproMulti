import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode, SVGProps } from 'react';
import { LinkButton } from '@/components/ui';
import { enlaceApkAndroid, enlaceAppIos } from '@/lib/descargas';
import { IconAndroid, IconApple } from '@/components/descargas/iconos';

export const metadata: Metadata = {
  title: { absolute: 'ConstructorPro — Lleva tus obras en orden' },
  description:
    'Lleva las cuentas, el equipo y los pagos de tus obras en un solo lugar. Fácil de usar, con un espacio para ti y otro para tus clientes.',
};

// ---------------------------------------------------------------------------
// Íconos (SVG inline, estilo Lucide). El design system prohíbe emojis como
// íconos, así que usamos trazos consistentes de 24×24 con currentColor.
// ---------------------------------------------------------------------------

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const IconCotizacion = (p: IconProps) => (
  <IconBase {...p}>
    <rect width="8" height="4" x="8" y="2" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4" />
    <path d="M12 16h4" />
    <path d="M8 11h.01" />
    <path d="M8 16h.01" />
  </IconBase>
);

const IconEquipo = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </IconBase>
);

const IconNomina = (p: IconProps) => (
  <IconBase {...p}>
    <rect width="20" height="12" x="2" y="6" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01" />
    <path d="M18 12h.01" />
  </IconBase>
);

const IconFlujo = (p: IconProps) => (
  <IconBase {...p}>
    <path d="m16 3 4 4-4 4" />
    <path d="M20 7H4" />
    <path d="m8 21-4-4 4-4" />
    <path d="M4 17h16" />
  </IconBase>
);

const IconReporte = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v5h5" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </IconBase>
);

const IconPortal = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </IconBase>
);

const IconOfflineSync = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </IconBase>
);

const IconCheck = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M20 6 9 17l-5-5" />
  </IconBase>
);

const IconArrow = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </IconBase>
);

function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white ${className}`}
      aria-hidden="true"
    >
      <IconBase className="h-5 w-5">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
      </IconBase>
    </span>
  );
}

// Los íconos de marca Android/Apple y la configuración de descargas viven en
// módulos compartidos (`@/components/descargas/iconos` y `@/lib/descargas`), la
// misma fuente que usa el botón de descarga dentro del portal.

// ---------------------------------------------------------------------------
// Datos de las secciones. Lenguaje sencillo, del día a día de una obra.
// ---------------------------------------------------------------------------

const FUNCIONES = [
  {
    icon: IconCotizacion,
    titulo: 'Cotizaciones y presupuestos',
    texto:
      'Haz tus cotizaciones, pásalas a presupuesto y ve fácil si vas gastando de más o de menos.',
  },
  {
    icon: IconEquipo,
    titulo: 'Tu gente y su asistencia',
    texto:
      'Anota a tus trabajadores, pásales lista en la obra y lleva la cuenta de los días que trabajaron.',
  },
  {
    icon: IconNomina,
    titulo: 'El pago de tu gente',
    texto:
      'Calcula la raya de cada quien según los días que trabajó, con sus faltas y ajustes ya incluidos.',
  },
  {
    icon: IconFlujo,
    titulo: 'El dinero que entra y sale',
    texto:
      'Anota lo que recibes y lo que gastas en cada obra, y ve cuánto te queda en cualquier momento.',
  },
  {
    icon: IconReporte,
    titulo: 'Reportes listos para enviar',
    texto:
      'Saca reportes y estados de cuenta bien presentados para imprimir o mandar por mensaje.',
  },
  {
    icon: IconPortal,
    titulo: 'Un espacio para tu cliente',
    texto:
      'Tu cliente entra con su propia clave y ve su cotización, cómo va la obra y cuánto ha pagado.',
  },
];

const PASOS = [
  {
    titulo: 'Cotiza y arma tu presupuesto',
    texto:
      'Pon lo que vas a hacer y a qué precio. Eso se vuelve tu presupuesto, con el que después comparas todo.',
  },
  {
    titulo: 'Anota todo en la obra',
    texto:
      'Pasa lista, apunta gastos y movimientos desde la obra. Aunque no tengas internet, no se pierde nada.',
  },
  {
    titulo: 'Revisa y comparte',
    texto:
      'Mira los pagos, el dinero y el avance en tu panel. Y muéstrale a tu cliente cómo va, sin dar tantas vueltas.',
  },
];

// ---------------------------------------------------------------------------
// Página
//
// PENDIENTE (precio/acceso): el copy de los CTA es a propósito NEUTRO —no dice
// "gratis", "prueba" ni "de paga"— porque el modelo de negocio aún no está
// definido y puede cambiar. Cuando se decida, ajustar el texto de los botones
// "Crear cuenta" y el microcopy del hero ("Empieza con tu primera obra…").
// ---------------------------------------------------------------------------

export default function Home() {
  // Enlaces de descarga (o `null` mientras no estén publicados). Fuente única en
  // `@/lib/descargas`, compartida con el botón de descarga del portal.
  const androidUrl = enlaceApkAndroid();
  const iosUrl = enlaceAppIos();

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      {/* ---------------------------------------------------------------- Nav */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-50/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight">ConstructorPro</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-neutral-600 md:flex">
            <a href="#funciones" className="transition hover:text-neutral-900">
              Qué hace
            </a>
            <a href="#como" className="transition hover:text-neutral-900">
              Cómo funciona
            </a>
            <a href="#para-quien" className="transition hover:text-neutral-900">
              Para quién es
            </a>
            <a href="#descargar" className="transition hover:text-neutral-900">
              Descargar
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <LinkButton href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
              Entrar
            </LinkButton>
            <LinkButton href="/login?modo=registro" size="sm">
              Crear cuenta
            </LinkButton>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ------------------------------------------------------------- Hero */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
                <IconOfflineSync className="h-3.5 w-3.5" />
                Funciona sin internet y se guarda solo
              </span>

              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Lleva tus obras en orden, sin complicarte
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-neutral-600">
                ConstructorPro junta las cuentas, tu gente y los pagos de todas tus obras en un solo
                lugar. Así tú tienes el control, y tus clientes pueden ver cómo va su obra cuando
                quieran.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <LinkButton href="/login?modo=registro">
                  Crear cuenta
                  <IconArrow className="h-4 w-4" />
                </LinkButton>
                <LinkButton href="#funciones" variant="secondary">
                  Ver qué hace
                </LinkButton>
              </div>

              <p className="mt-4 text-sm text-neutral-500">
                Empieza con tu primera obra en unos minutos.
              </p>
            </div>

            {/* Vista previa (maqueta, no imagen externa) */}
            <div className="relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-br from-neutral-200/60 to-transparent blur-2xl"
              />
              <div className="relative rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Casa Los Pinos</p>
                    <p className="text-xs text-neutral-500">Cómo va la obra</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    En obra
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-neutral-200 p-3">
                    <p className="text-xs text-neutral-500">Presupuesto</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">$1,840,000</p>
                  </div>
                  <div className="rounded-xl border border-neutral-200 p-3">
                    <p className="text-xs text-neutral-500">Gastado</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">$1,213,400</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Avance</span>
                    <span className="font-medium text-neutral-700">66%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full w-2/3 rounded-full bg-neutral-900" />
                  </div>
                </div>

                <div className="mt-5 space-y-2.5">
                  {[
                    { l: 'Pago de la semana', v: '$96,200' },
                    { l: 'Compra de material', v: '$142,800' },
                    { l: 'Anticipo del cliente', v: '+$300,000' },
                  ].map((r) => (
                    <div key={r.l} className="flex items-center gap-3 text-sm">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                        <IconCheck className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex-1 truncate text-neutral-700">{r.l}</span>
                      <span className="font-medium tabular-nums text-neutral-900">{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Qué hace */}
        <section id="funciones" className="scroll-mt-20 border-t border-neutral-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-neutral-500">Qué hace</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Todo lo de tu obra, en un solo lugar
              </h2>
              <p className="mt-3 text-neutral-600">
                Desde que pasas la cotización hasta que entregas, aquí llevas las cuentas y a tu
                gente. Sin andar buscando en mil hojas y cuadernos.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FUNCIONES.map(({ icon: Icon, titulo, texto }) => (
                <div
                  key={titulo}
                  className="rounded-xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-md"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-700">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold">{titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Cómo funciona */}
        <section id="como" className="scroll-mt-20 border-t border-neutral-200">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-neutral-500">Cómo funciona</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                En tres pasos, de principio a fin
              </h2>
              <p className="mt-3 text-neutral-600">
                Hecho para el día a día de una obra: se anota en la obra, se revisa en la oficina y
                se le muestra al cliente.
              </p>
            </div>

            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} className="relative rounded-xl border border-neutral-200 bg-white p-6">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{paso.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{paso.texto}</p>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
              <IconOfflineSync className="mt-0.5 h-5 w-5 shrink-0 text-neutral-900" />
              <p>
                <span className="font-medium text-neutral-900">No necesitas internet en la obra.</span>{' '}
                Puedes anotar todo aunque no haya señal; se guarda solo en cuanto vuelve el internet.
                Nada se pierde.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Para quién */}
        <section id="para-quien" className="scroll-mt-20 border-t border-neutral-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-neutral-500">Para quién es</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Un espacio para ti y otro para tus clientes
              </h2>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {/* Oficina */}
              <div className="flex flex-col rounded-2xl border border-neutral-200 bg-neutral-50 p-8">
                <h3 className="text-xl font-semibold">Si construyes o llevas obras</h3>
                <p className="mt-2 text-neutral-600">
                  Lleva todas tus obras, a tu gente y tus cuentas desde un solo lugar.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-neutral-700">
                  {[
                    'Presupuestos y control de lo que gastas en cada obra',
                    'Asistencia y pago de tu gente',
                    'El dinero que entra y sale, con reportes listos para enviar',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <LinkButton href="/login?modo=registro">
                    Crear cuenta
                    <IconArrow className="h-4 w-4" />
                  </LinkButton>
                </div>
              </div>

              {/* Cliente */}
              <div className="flex flex-col rounded-2xl border border-neutral-200 bg-neutral-50 p-8">
                <h3 className="text-xl font-semibold">Si eres cliente</h3>
                <p className="mt-2 text-neutral-600">
                  Entra a ver tu obra cuando quieras, sin tener que llamar ni pedir cuentas.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-neutral-700">
                  {[
                    'Tu cotización aprobada, siempre a la mano',
                    'Cómo va tu obra, al día',
                    'Cuánto has pagado y cuánto falta, bien claro',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <LinkButton href="/cliente" variant="secondary">
                    Entrar como cliente
                  </LinkButton>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Descargar app */}
        <section id="descargar" className="scroll-mt-20 border-t border-neutral-200">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-neutral-500">Descarga la app</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Llévala contigo a la obra
              </h2>
              <p className="mt-3 text-neutral-600">
                Además del panel en la computadora, ConstructorPro tiene app para tu celular. Así
                anotas todo directo en la obra, aunque no tengas internet.
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {/* Android */}
              <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-8">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-white">
                    <IconAndroid className="h-6 w-6" />
                  </span>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">Android</h3>
                    <p className="text-xs text-neutral-500">Celular o tablet</p>
                  </div>
                  {!androidUrl && (
                    // neutral-600 y no -500: sobre `bg-neutral-100` el -500 da
                    // 4.35:1 y WCAG AA pide 4.5:1 para texto normal.
                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                      Próximamente
                    </span>
                  )}
                </div>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-neutral-600">
                  Se instala como una app aparte, fuera de la Play Store. La bajas desde el enlace de
                  descarga y la instalas en tu teléfono.
                </p>
                <div className="mt-6">
                  {androidUrl ? (
                    <LinkButton href={androidUrl} download>
                      Descargar para Android
                      <IconArrow className="h-4 w-4" />
                    </LinkButton>
                  ) : (
                    <span
                      aria-disabled="true"
                      // `text-neutral-400` daba 2.31:1 y era ilegible. WCAG exime a
                      // los controles deshabilitados, pero este no es un botón
                      // muerto: es el único aviso de que la descarga aún no existe,
                      // así que tiene que leerse.
                      className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600"
                    >
                      Disponible pronto
                    </span>
                  )}
                </div>
              </div>

              {/* iOS */}
              <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-8">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-white">
                    <IconApple className="h-6 w-6" />
                  </span>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">iPhone (iOS)</h3>
                    <p className="text-xs text-neutral-500">Apple</p>
                  </div>
                  {!iosUrl && (
                    // neutral-600 y no -500: sobre `bg-neutral-100` el -500 da
                    // 4.35:1 y WCAG AA pide 4.5:1 para texto normal.
                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                      Próximamente
                    </span>
                  )}
                </div>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-neutral-600">
                  Estamos preparando la mejor forma de instalarla en iPhone. Muy pronto habrá más
                  noticias por aquí.
                </p>
                <div className="mt-6">
                  {iosUrl ? (
                    <LinkButton href={iosUrl} target="_blank" rel="noopener noreferrer">
                      Descargar para iPhone
                      <IconArrow className="h-4 w-4" />
                    </LinkButton>
                  ) : (
                    <span
                      aria-disabled="true"
                      // `text-neutral-400` daba 2.31:1 y era ilegible. WCAG exime a
                      // los controles deshabilitados, pero este no es un botón
                      // muerto: es el único aviso de que la descarga aún no existe,
                      // así que tiene que leerse.
                      className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600"
                    >
                      Disponible pronto
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-6 text-sm text-neutral-500">
              Todavía no publicamos las apps de forma oficial. Estamos preparando las descargas; muy
              pronto vas a poder instalarlas desde aquí.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- CTA final */}
        <section className="border-t border-neutral-200">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="rounded-3xl bg-neutral-900 px-6 py-14 text-center text-white sm:px-12">
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Empieza a poner tus obras en orden hoy
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-neutral-300">
                Crea tu cuenta, agrega tu primera obra y ten el control de las cuentas y los pagos
                desde el primer día.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login?modo=registro"
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-5 py-2 text-sm font-medium text-neutral-900 outline-none transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                >
                  Crear cuenta
                  <IconArrow className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-neutral-700 px-5 py-2 text-sm font-medium text-white outline-none transition hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                >
                  Ya tengo cuenta
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ----------------------------------------------------------- Footer */}
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold">ConstructorPro</p>
              <p className="text-xs text-neutral-500">El control de tus obras, en un solo lugar</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-600">
            <Link href="/login" className="transition hover:text-neutral-900">
              Entrar
            </Link>
            <Link href="/login?modo=registro" className="transition hover:text-neutral-900">
              Crear cuenta
            </Link>
            <Link href="/cliente" className="transition hover:text-neutral-900">
              Soy cliente
            </Link>
          </nav>
        </div>
        <div className="border-t border-neutral-200">
          {/* neutral-600: el -400 daba 2.52:1 sobre blanco. */}
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-neutral-600 sm:px-6">
            © {new Date().getFullYear()} ConstructorPro. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
