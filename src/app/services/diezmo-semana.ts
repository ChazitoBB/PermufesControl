/** Semana domingo–sábado en America/Mexico_City. */

export const ZONA_DIEZMO = 'America/Mexico_City';

export interface LimitesSemana {
  inicio: string; // YYYY-MM-DD (domingo)
  fin: string;    // YYYY-MM-DD (sábado)
}

export interface DiezmoSemana {
  inicio: string;
  fin: string;
  ventas_centavos: number;
  diezmo_centavos: number;
  es_actual: boolean;
}

/** 10% redondeado a centavos enteros. */
export function calcularDiezmoCentavos(ventasCentavos: number): number {
  const total = Number(ventasCentavos) || 0;
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.round(total / 10);
}

export function esFechaISO(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

/** Fecha civil actual en America/Mexico_City (YYYY-MM-DD). */
export function fechaHoyMexico(ahora: Date = new Date()): string {
  return formatearFechaEnZona(ahora, ZONA_DIEZMO);
}

export function formatearFechaEnZona(
  fecha: Date,
  timeZone: string = ZONA_DIEZMO
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(fecha);
}

/** Suma días a una fecha civil YYYY-MM-DD (aritmética UTC de calendario). */
export function sumarDiasISO(fechaISO: string, dias: number): string {
  if (!esFechaISO(fechaISO)) {
    throw new Error('Fecha inválida.');
  }
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const utc = new Date(Date.UTC(anio, mes - 1, dia + dias));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Día de la semana en America/Mexico_City para una fecha civil.
 * 0 = domingo … 6 = sábado.
 */
export function diaSemanaMexico(fechaISO: string): number {
  if (!esFechaISO(fechaISO)) {
    throw new Error('Fecha inválida.');
  }

  // Busca un instante UTC cuya fecha civil en México coincida.
  let t = Date.parse(`${fechaISO}T12:00:00.000Z`);
  for (let i = 0; i < 36; i++) {
    const instante = new Date(t);
    const ymd = formatearFechaEnZona(instante, ZONA_DIEZMO);
    if (ymd === fechaISO) {
      const partes = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone: ZONA_DIEZMO,
          weekday: 'short'
        })
          .formatToParts(instante)
          .filter(p => p.type === 'weekday')
          .map(p => ['weekday', p.value])
      ) as { weekday: string };

      const mapa: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
      };
      const valor = mapa[partes.weekday];
      if (valor === undefined) {
        throw new Error('No se pudo determinar el día de la semana.');
      }
      return valor;
    }
    t += (ymd < fechaISO ? 1 : -1) * 60 * 60 * 1000;
  }
  throw new Error('No se pudo resolver la fecha en America/Mexico_City.');
}

/** Límites domingo–sábado que contienen la fecha civil dada. */
export function limitesSemanaDomingoSabado(fechaISO: string): LimitesSemana {
  const dia = diaSemanaMexico(fechaISO);
  const inicio = sumarDiasISO(fechaISO, -dia);
  const fin = sumarDiasISO(inicio, 6);
  return { inicio, fin };
}

/** Lista de fechas civiles inclusive entre inicio y fin. */
export function enumerarDias(inicio: string, fin: string): string[] {
  if (inicio > fin) {
    return [];
  }
  const dias: string[] = [];
  let actual = inicio;
  while (actual <= fin) {
    dias.push(actual);
    actual = sumarDiasISO(actual, 1);
  }
  return dias;
}

/**
 * Construye el historial de semanas desde la primera venta hasta hoy.
 * Incluye semanas intermedias con $0. Orden: más reciente primero.
 */
export function construirHistorialDiezmos(opciones: {
  hoyISO: string;
  primeraVentaISO: string | null;
  ventasPorDia: Map<string, number> | Record<string, number>;
}): DiezmoSemana[] {
  const hoy = opciones.hoyISO;
  const mapa = opciones.ventasPorDia instanceof Map
    ? opciones.ventasPorDia
    : new Map(Object.entries(opciones.ventasPorDia));

  const semanaActual = limitesSemanaDomingoSabado(hoy);
  const ancla = opciones.primeraVentaISO && esFechaISO(opciones.primeraVentaISO)
    ? opciones.primeraVentaISO
    : hoy;
  const primeraSemana = limitesSemanaDomingoSabado(ancla);

  const historial: DiezmoSemana[] = [];
  let inicio = semanaActual.inicio;
  while (inicio >= primeraSemana.inicio) {
    const fin = sumarDiasISO(inicio, 6);
    let ventas = 0;
    for (const dia of enumerarDias(inicio, fin)) {
      ventas += Number(mapa.get(dia) || 0);
    }
    historial.push({
      inicio,
      fin,
      ventas_centavos: ventas,
      diezmo_centavos: calcularDiezmoCentavos(ventas),
      es_actual: inicio === semanaActual.inicio
    });
    inicio = sumarDiasISO(inicio, -7);
  }
  return historial;
}
