import { ImageResponse } from 'next/og';

/**
 * Imagen que se ve al compartir el sitio (convención de Next:
 * `app/opengraph-image.tsx`). Sirve para WhatsApp, Facebook, LinkedIn y como
 * `twitter:image`.
 *
 * POR QUÉ IMPORTA AQUÍ. La forma real en que se reparte este producto es un
 * constructor pegando la liga en un grupo de WhatsApp. Sin esta imagen, el
 * enlace aparece como una tarjeta gris sin nada — que es exactamente como se ve
 * un enlace sospechoso. Es reputación, no posicionamiento.
 *
 * Se dibuja aquí en vez de subir un PNG a `public/`: así el texto se mantiene
 * junto al resto del código y no hay que reabrir un editor de imágenes para
 * cambiar una palabra.
 *
 * Sin `next/font` a propósito: la fuente de la marca (Geist) se descarga en
 * tiempo de build y encarece la generación; para 1200×630 la sans del sistema
 * del runtime se ve bien y no añade un punto de falla.
 */
export const alt = 'ConstructorPro — Lleva tus obras en orden';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0F172A',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        {/* Marca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0F172A"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
              <path d="M10 6h4" />
              <path d="M10 10h4" />
              <path d="M10 14h4" />
            </svg>
          </div>
          <div style={{ fontSize: 34, color: '#FFFFFF', fontWeight: 600 }}>ConstructorPro</div>
        </div>

        {/* Mensaje */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.1,
              color: '#FFFFFF',
              fontWeight: 600,
              letterSpacing: -1.5,
              maxWidth: 900,
            }}
          >
            Lleva tus obras en orden, sin complicarte
          </div>
          <div style={{ fontSize: 30, color: '#CBD5E1', maxWidth: 860, lineHeight: 1.4 }}>
            Cotizaciones, tu gente, la raya y el dinero de cada obra en un solo lugar.
          </div>
        </div>

        {/* Pie */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#0F172A',
              background: '#FFFFFF',
              padding: '10px 20px',
              borderRadius: 999,
              fontWeight: 500,
            }}
          >
            Funciona sin internet en la obra
          </div>
        </div>
      </div>
    ),
    size,
  );
}
