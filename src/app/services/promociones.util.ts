/**
 * Probabilidades y reglas de cupones / ruleta.
 * Los descuentos % aplican a UNA sola unidad elegible, nunca al carrito completo.
 *
 * Escala interna: 100% = 10_000 puntos (precisión 0.01%).
 * No recalcula ni altera códigos/giros ya guardados en SQLite.
 */

export type TipoPremioPromocion =
  | 'desc_5'
  | 'desc_10'
  | 'desc_15'
  | 'desc_20'
  | 'desc_50'
  | 'promo_3x2'
  | 'sorpresa';

export interface PremioConfig {
  tipo: TipoPremioPromocion;
  etiqueta: string;
  /** Probabilidad en % (admite decimales, p. ej. 0.25). Deben sumar 100. */
  probabilidadPct: number;
  /** Descuento porcentual (0–100) si aplica. */
  porcentaje: number | null;
}

/** 100% expresado en puntos enteros (0.01% cada uno). */
export const PROBABILIDAD_ESCALA = 10_000;

/**
 * Distribución experimental definitiva (suma 100%).
 * No modifica premios históricos ya emitidos en BD.
 */
export const PREMIOS_RULETA_DEFAULT: PremioConfig[] = [
  { tipo: 'desc_5', etiqueta: '5% de descuento', probabilidadPct: 72, porcentaje: 5 },
  { tipo: 'desc_10', etiqueta: '10% de descuento', probabilidadPct: 19, porcentaje: 10 },
  { tipo: 'desc_15', etiqueta: '15% de descuento', probabilidadPct: 5, porcentaje: 15 },
  { tipo: 'desc_20', etiqueta: '20% de descuento', probabilidadPct: 2, porcentaje: 20 },
  { tipo: 'desc_50', etiqueta: '50% de descuento', probabilidadPct: 0.25, porcentaje: 50 },
  { tipo: 'promo_3x2', etiqueta: '3x2 (60 ml)', probabilidadPct: 0.25, porcentaje: null },
  { tipo: 'sorpresa', etiqueta: 'Premio sorpresa', probabilidadPct: 1.5, porcentaje: null }
];

export function probabilidadAPuntos(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0) {
    throw new Error(`Probabilidad inválida: ${pct}`);
  }
  return Math.round(pct * 100);
}

export function sumarProbabilidades(premios: PremioConfig[]): number {
  return premios.reduce((acc, p) => acc + p.probabilidadPct, 0);
}

export function sumarPuntosProbabilidad(premios: PremioConfig[]): number {
  return premios.reduce((acc, p) => acc + probabilidadAPuntos(p.probabilidadPct), 0);
}

export function validarProbabilidades(premios: PremioConfig[]): void {
  const puntos = sumarPuntosProbabilidad(premios);
  if (puntos !== PROBABILIDAD_ESCALA) {
    throw new Error(
      `Las probabilidades deben sumar 100% (${PROBABILIDAD_ESCALA} puntos; actual: ${puntos}).`
    );
  }
  for (const p of premios) {
    if (!Number.isFinite(p.probabilidadPct) || p.probabilidadPct < 0) {
      throw new Error(`Probabilidad inválida para ${p.tipo}.`);
    }
  }
}

/** Entero uniforme [0, maxExclusive) con Web Crypto. */
export function enteroAleatorioSeguro(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('Rango aleatorio inválido.');
  }
  const limite = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limite);
  return x % maxExclusive;
}

/**
 * Selección determinista por ticket en [0, PROBABILIDAD_ESCALA).
 * Útil en tests; la UI usa seleccionarPremioPonderado.
 */
export function seleccionarPremioPorTicket(
  ticket: number,
  premios: PremioConfig[] = PREMIOS_RULETA_DEFAULT
): PremioConfig {
  validarProbabilidades(premios);
  if (!Number.isInteger(ticket) || ticket < 0 || ticket >= PROBABILIDAD_ESCALA) {
    throw new Error(`Ticket fuera de rango [0, ${PROBABILIDAD_ESCALA}).`);
  }
  let acumulado = 0;
  for (const premio of premios) {
    acumulado += probabilidadAPuntos(premio.probabilidadPct);
    if (ticket < acumulado) {
      return premio;
    }
  }
  return premios[premios.length - 1]!;
}

/**
 * Selección ponderada con Web Crypto (escala 10_000).
 * La ruleta visual debe mapear ángulos con los mismos pesos.
 */
export function seleccionarPremioPonderado(
  premios: PremioConfig[] = PREMIOS_RULETA_DEFAULT
): PremioConfig {
  const ticket = enteroAleatorioSeguro(PROBABILIDAD_ESCALA);
  return seleccionarPremioPorTicket(ticket, premios);
}

/** Ángulos de inicio/fin (grados) proporcionales a la probabilidad. */
export function sectoresAngularesRuleta(
  premios: PremioConfig[] = PREMIOS_RULETA_DEFAULT
): Array<{ tipo: TipoPremioPromocion; inicioDeg: number; finDeg: number }> {
  validarProbabilidades(premios);
  let angulo = 0;
  return premios.map(p => {
    const span = (probabilidadAPuntos(p.probabilidadPct) / PROBABILIDAD_ESCALA) * 360;
    const sector = { tipo: p.tipo, inicioDeg: angulo, finDeg: angulo + span };
    angulo += span;
    return sector;
  });
}

export function generarCodigoPremioUnico(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `PC-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12)}`.toUpperCase();
}

export interface LineaParaDescuento {
  productoId: number;
  mililitros: number;
  cantidad: number;
  precioUnitarioCentavos: number;
}

export interface ResultadoDescuentoOperacion {
  lineasAjustadas: LineaParaDescuento[];
  subtotalCentavos: number;
  descuentoCentavos: number;
  totalCentavos: number;
  /** Unidades físicas a descontar del inventario (incluye bonificadas). */
  unidadesInventario: number;
  detalle: string;
}

export function contarUnidades(lineas: LineaParaDescuento[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad, 0);
}

export function subtotalLineas(lineas: LineaParaDescuento[]): number {
  return lineas.reduce(
    (acc, l) => acc + l.cantidad * l.precioUnitarioCentavos,
    0
  );
}

/**
 * Expande cantidades a unidades individuales para aplicar 1 descuento o 3x2.
 */
function expandirUnidades(lineas: LineaParaDescuento[]): Array<{
  productoId: number;
  mililitros: number;
  precioUnitarioCentavos: number;
  elegible3x2: boolean;
}> {
  const unidades: Array<{
    productoId: number;
    mililitros: number;
    precioUnitarioCentavos: number;
    elegible3x2: boolean;
  }> = [];
  for (const linea of lineas) {
    for (let i = 0; i < linea.cantidad; i++) {
      unidades.push({
        productoId: linea.productoId,
        mililitros: linea.mililitros,
        precioUnitarioCentavos: linea.precioUnitarioCentavos,
        elegible3x2: linea.mililitros === 60
      });
    }
  }
  return unidades;
}

function comprimirUnidades(
  unidades: Array<{ productoId: number; mililitros: number; precioUnitarioCentavos: number }>
): LineaParaDescuento[] {
  const mapa = new Map<string, LineaParaDescuento>();
  for (const u of unidades) {
    const clave = `${u.productoId}|${u.precioUnitarioCentavos}`;
    const prev = mapa.get(clave);
    if (prev) {
      prev.cantidad += 1;
    } else {
      mapa.set(clave, {
        productoId: u.productoId,
        mililitros: u.mililitros,
        cantidad: 1,
        precioUnitarioCentavos: u.precioUnitarioCentavos
      });
    }
  }
  return [...mapa.values()];
}

/** Verifica que subtotal − descuento === total y que no haya negativos. */
export function assertTotalesConsistentes(r: ResultadoDescuentoOperacion): void {
  if (r.descuentoCentavos < 0 || r.totalCentavos < 0 || r.subtotalCentavos < 0) {
    throw new Error('Importes negativos en la promoción.');
  }
  if (r.subtotalCentavos - r.descuentoCentavos !== r.totalCentavos) {
    throw new Error('Inconsistencia: subtotal − descuento ≠ total.');
  }
  if (subtotalLineas(r.lineasAjustadas) !== r.totalCentavos) {
    throw new Error('Las líneas ajustadas no coinciden con el total neto.');
  }
  if (contarUnidades(r.lineasAjustadas) !== r.unidadesInventario) {
    throw new Error('Unidades de inventario inconsistentes tras el premio.');
  }
}

/**
 * Indica si un código puede canjearse (sin efectos de lado).
 * El canje real ocurre en la misma TX que la venta.
 */
export function codigoPuedeCanjearse(estado: string): boolean {
  return estado === 'disponible';
}

export function aplicarPremioALineas(
  lineas: LineaParaDescuento[],
  tipo: TipoPremioPromocion,
  porcentaje: number | null
): ResultadoDescuentoOperacion {
  if (!lineas.length) {
    throw new Error('No hay líneas para aplicar el premio.');
  }

  const subtotal = subtotalLineas(lineas);
  const unidadesAntes = contarUnidades(lineas);
  const unidades = expandirUnidades(lineas);

  if (tipo === 'sorpresa') {
    const r: ResultadoDescuentoOperacion = {
      lineasAjustadas: lineas.map(l => ({ ...l })),
      subtotalCentavos: subtotal,
      descuentoCentavos: 0,
      totalCentavos: subtotal,
      unidadesInventario: unidadesAntes,
      detalle: 'Premio sorpresa: sin descuento automático en esta venta.'
    };
    assertTotalesConsistentes(r);
    return r;
  }

  if (tipo === 'promo_3x2') {
    const elegibles = unidades
      .map((u, idx) => ({ u, idx }))
      .filter(x => x.u.elegible3x2);
    if (elegibles.length < 3) {
      throw new Error(
        'El 3x2 requiere al menos 3 unidades elegibles (60 ml estándar).'
      );
    }
    elegibles.sort(
      (a, b) => a.u.precioUnitarioCentavos - b.u.precioUnitarioCentavos
    );
    const bonificada = elegibles[0]!;
    const precioAntes = unidades[bonificada.idx]!.precioUnitarioCentavos;
    unidades[bonificada.idx] = {
      ...unidades[bonificada.idx]!,
      precioUnitarioCentavos: 0
    };
    const ajustadas = comprimirUnidades(unidades);
    const total = subtotalLineas(ajustadas);
    const r: ResultadoDescuentoOperacion = {
      lineasAjustadas: ajustadas,
      subtotalCentavos: subtotal,
      descuentoCentavos: subtotal - total,
      totalCentavos: total,
      // Las 3+ unidades físicas siguen en el carrito (una a precio 0).
      unidadesInventario: contarUnidades(ajustadas),
      detalle: `3x2: se bonifica 1 unidad de ${precioAntes} centavos (la más barata elegible).`
    };
    assertTotalesConsistentes(r);
    return r;
  }

  const pct = porcentaje ?? 0;
  if (pct <= 0 || pct > 100) {
    throw new Error('Porcentaje de descuento inválido.');
  }

  if (tipo === 'desc_50' && unidades.length < 2) {
    throw new Error(
      'El 50% requiere al menos 2 unidades elegibles en la compra.'
    );
  }

  // Una sola unidad: la de mayor precio (determinista).
  let idxMax = 0;
  for (let i = 1; i < unidades.length; i++) {
    if (
      unidades[i]!.precioUnitarioCentavos >
      unidades[idxMax]!.precioUnitarioCentavos
    ) {
      idxMax = i;
    }
  }
  const original = unidades[idxMax]!.precioUnitarioCentavos;
  const descuentoUnidad = Math.round((original * pct) / 100);
  const nuevo = original - descuentoUnidad;
  unidades[idxMax] = {
    ...unidades[idxMax]!,
    precioUnitarioCentavos: nuevo
  };
  const ajustadas = comprimirUnidades(unidades);
  const total = subtotalLineas(ajustadas);
  const r: ResultadoDescuentoOperacion = {
    lineasAjustadas: ajustadas,
    subtotalCentavos: subtotal,
    descuentoCentavos: subtotal - total,
    totalCentavos: total,
    unidadesInventario: contarUnidades(ajustadas),
    detalle: `${pct}% aplicado a 1 sola unidad (de ${original} a ${nuevo} centavos).`
  };
  assertTotalesConsistentes(r);
  return r;
}
