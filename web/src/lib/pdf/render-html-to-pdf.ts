import { NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

/**
 * Renderiza un HTML autocontenido a PDF con Chromium headless.
 *
 * Es lo único genérico de la generación de PDF: recibe un HTML (que cada
 * documento arma con su builder) y devuelve los bytes del PDF. Toma el tamaño y
 * márgenes del `@page` del documento (`preferCSSPageSize`), así respeta el
 * diseño y los `break-inside: avoid`.
 *
 * OJO al desplegar: cada ruta que llame a esto necesita su clave en
 * `outputFileTracingIncludes` (next.config) para que el binario de Chromium
 * viaje con la función. Verificable en el `.nft.json` de la ruta.
 */
export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    // El HTML es autocontenido (sin recursos externos), así que 'load' basta.
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    if (browser) await browser.close();
  }
}

/** Respuesta HTTP con el PDF. `inline` lo abre en el visor; si no, lo descarga. */
export function pdfResponse(bytes: Uint8Array, filename: string, inline: boolean): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
