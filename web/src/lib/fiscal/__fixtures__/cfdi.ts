// XML de ejemplo FICTICIOS para las pruebas del lector de CFDI. No son facturas
// reales: RFC, nombres, sellos y folios están inventados.

export const UUID_FACTURA = '6F2B9C1A-3D4E-4F5A-8B7C-9D0E1F2A3B4C';
export const UUID_PPD = 'A1B2C3D4-E5F6-4711-8899-AABBCCDDEEFF';
export const UUID_COMPLEMENTO = '11111111-2222-4333-8444-555555555555';

/** Factura de ingreso PUE, con prefijos "de libro" (cfdi:, tfd:). */
export const FACTURA_PUE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- comentario del PAC -->
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  Version="4.0" Serie="A" Folio="102" Fecha="2026-09-15T10:30:00" FormaPago="03" MetodoPago="PUE"
  SubTotal="10000.00" Moneda="MXN" Total="11475.00" TipoDeComprobante="I" Exportacion="01" LugarExpedicion="64000"
  Sello="SELLOFICTICIO" NoCertificado="00000000000000000000" Certificado="CERTFICTICIO">
  <cfdi:Emisor Rfc="CPR200101AB1" Nombre="CONSTRUCTORA DE PRUEBA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="GODE561231GR8" Nombre="EMILIO GOMEZ DIAZ &amp; ASOCIADOS" DomicilioFiscalReceptor="06300"
    RegimenFiscalReceptor="612" UsoCFDI="I01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="72151900" Cantidad="20" ClaveUnidad="MTK" Unidad="Metro cuadrado"
      Descripcion="Muro de block 15 cm" ValorUnitario="500.00" Importe="10000.00" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosRetenidos="125.00" TotalImpuestosTrasladados="1600.00">
    <cfdi:Retenciones>
      <cfdi:Retencion Impuesto="001" Importe="125.00"/>
    </cfdi:Retenciones>
    <cfdi:Traslados>
      <cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1"
      UUID="${UUID_FACTURA.toLowerCase()}" FechaTimbrado="2026-09-15T10:31:12" RfcProvCertif="AAA010101AAA"
      SelloCFD="X" NoCertificadoSAT="00000000000000000000" SelloSAT="Y"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/** La misma idea con OTROS prefijos (y el CFDI como namespace por defecto). */
export const FACTURA_PPD_OTROS_PREFIJOS = `<?xml version="1.0" encoding="utf-8"?>
<Comprobante xmlns="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-08-01T09:00:00" FormaPago="99"
  MetodoPago="PPD" SubTotal="100000" Moneda="MXN" Total="116000" TipoDeComprobante="I" LugarExpedicion="64000">
  <CfdiRelacionados TipoRelacion="07"><CfdiRelacionado UUID="${UUID_FACTURA}"/></CfdiRelacionados>
  <Emisor Rfc="CPR200101AB1" Nombre="CONSTRUCTORA DE PRUEBA" RegimenFiscal="601"/>
  <Receptor Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="616" UsoCFDI="S01"/>
  <Conceptos><Concepto ClaveProdServ="72111000" Cantidad="1" ClaveUnidad="E48" Descripcion="Casa" ValorUnitario="100000" Importe="100000" ObjetoImp="02"/></Conceptos>
  <Impuestos TotalImpuestosTrasladados="16000"><Traslados><Traslado Base="100000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16000"/></Traslados></Impuestos>
  <Complemento><t:TimbreFiscalDigital xmlns:t="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${UUID_PPD}" FechaTimbrado="2026-08-01T09:01:00"/></Complemento>
</Comprobante>`;

/** Complemento de pago 2.0 que liquida la parcialidad 2 de la PPD. */
export const COMPLEMENTO_PAGO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20"
  Version="4.0" Fecha="2026-09-03T12:00:00" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" LugarExpedicion="64000">
  <cfdi:Emisor Rfc="CPR200101AB1" Nombre="CONSTRUCTORA DE PRUEBA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="616" UsoCFDI="CP01"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/></cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="58000.00"/>
      <pago20:Pago FechaPago="2026-09-02T12:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="58000.00">
        <pago20:DoctoRelacionado IdDocumento="${UUID_PPD.toLowerCase()}" MonedaDR="MXN" NumParcialidad="2"
          ImpSaldoAnt="58000.00" ImpPagado="58000.00" ImpSaldoInsoluto="0.00" ObjetoImpDR="01"/>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${UUID_COMPLEMENTO}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

export const CFDI_33 = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" Version="3.3" TipoDeComprobante="I"/>`;

export const SIN_TIMBRE = FACTURA_PUE.replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, '');

export const CON_DOCTYPE = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">&e;</cfdi:Comprobante>`;

export const MAL_CERRADO = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"><cfdi:Emisor></cfdi:Comprobante>`;
