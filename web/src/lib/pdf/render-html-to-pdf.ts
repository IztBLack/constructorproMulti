import { existsSync } from 'node:fs';
import { platform } from 'node:process';
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

/** Rutas habituales del navegador en cada sistema, en orden de preferencia. */
const NAVEGADORES_LOCALES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ],
};

/** ¿Corremos en la función serverless (Vercel/Lambda) o en una máquina? */
function enServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Elige con qué Chromium imprimir.
 *
 * En Vercel el binario lo pone `@sparticuz/chromium`, comprimido dentro de la
 * función. En una máquina de desarrollo ESE binario no sirve: es de Linux y
 * `executablePath()` apunta a un `/tmp/chromium` que no existe, así que
 * `puppeteer.launch` reventaba con `spawn … ENOENT` al descargar cualquier PDF.
 * Fuera de serverless se usa el Chrome o Edge ya instalado; `CHROME_PATH` gana
 * siempre, para poder apuntar a uno en otra ruta.
 */
async function resolverNavegador(): Promise<{ executablePath: string; args: string[] }> {
  if (enServerless()) {
    return { executablePath: await chromium.executablePath(), args: chromium.args };
  }

  const declarado = process.env.CHROME_PATH?.trim();
  if (declarado) {
    if (!existsSync(declarado)) {
      throw new Error(`CHROME_PATH apunta a un archivo que no existe: ${declarado}`);
    }
    return { executablePath: declarado, args: [] };
  }

  const candidatos = NAVEGADORES_LOCALES[platform] ?? [];
  const encontrado = candidatos.find((p) => p.length > 0 && existsSync(p));
  if (encontrado) return { executablePath: encontrado, args: [] };

  throw new Error(
    'No se encontró Chrome ni Edge para generar el PDF en local. Instala uno, o define ' +
      'CHROME_PATH en web/.env.local con la ruta al ejecutable. En producción no aplica: ' +
      'ahí el binario lo pone @sparticuz/chromium.',
  );
}

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    const { executablePath, args } = await resolverNavegador();
    browser = await puppeteer.launch({ args, executablePath, headless: true });
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
