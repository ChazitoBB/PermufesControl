import type {
  ConteosRespaldo,
  NombreTablaRespaldo,
  TablasRespaldo
} from './backup.types';
import { TABLAS_RESPALDO } from './backup.types';

/** Borrado en orden seguro respecto a FKs. */
export const ORDEN_BORRADO_RESTAURACION: NombreTablaRespaldo[] = [
  'promocion_canjes',
  'ruleta_giros',
  'promocion_codigos',
  'encargos',
  'venta_consumos',
  'ventas',
  'operaciones_venta',
  'abonos',
  'compras',
  'productos',
  'clientes'
];

/** Inserción en orden seguro respecto a FKs. */
export const ORDEN_INSERCION_RESTAURACION: NombreTablaRespaldo[] = [
  'clientes',
  'productos',
  'compras',
  'abonos',
  'operaciones_venta',
  'ventas',
  'venta_consumos',
  'encargos',
  'promocion_codigos',
  'promocion_canjes',
  'ruleta_giros'
];

export function construirInsertSql(
  tabla: string,
  fila: Record<string, unknown>
): { sql: string; valores: unknown[] } {
  const columnas = Object.keys(fila);
  if (columnas.length === 0) {
    throw new Error(`Fila vacía al restaurar la tabla ${tabla}.`);
  }
  const placeholders = columnas.map(() => '?').join(', ');
  const sql =
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${placeholders})`;
  const valores = columnas.map(c => fila[c] ?? null);
  return { sql, valores };
}

export function maxIdDeTabla(filas: Record<string, unknown>[]): number {
  let max = 0;
  for (const fila of filas) {
    const id = Number(fila['id']);
    if (Number.isSafeInteger(id) && id > max) {
      max = id;
    }
  }
  return max;
}

export function conteosCoinciden(
  esperado: ConteosRespaldo,
  obtenido: ConteosRespaldo
): string[] {
  const errores: string[] = [];
  for (const nombre of TABLAS_RESPALDO) {
    if ((esperado[nombre] ?? 0) !== (obtenido[nombre] ?? 0)) {
      errores.push(
        `${nombre}: esperado ${esperado[nombre] ?? 0}, obtenido ${obtenido[nombre] ?? 0}`
      );
    }
  }
  return errores;
}

export function contarTablasDesdePayload(tables: TablasRespaldo): ConteosRespaldo {
  const counts = {} as ConteosRespaldo;
  for (const nombre of TABLAS_RESPALDO) {
    counts[nombre] = tables[nombre]?.length ?? 0;
  }
  return counts;
}

export interface MetricasPreviewRespaldo {
  saldo_global_centavos: number;
  inventario_unidades: number;
  ganancia_bruta_fifo_centavos: number;
  total_ventas_centavos: number;
  total_abonos_centavos: number;
}

export function calcularMetricasDesdePayload(
  tables: TablasRespaldo
): MetricasPreviewRespaldo {
  let totalVentas = 0;
  for (const venta of tables.ventas ?? []) {
    totalVentas +=
      (Number(venta['cantidad']) || 0) *
      (Number(venta['precio_unitario_centavos']) || 0);
  }
  let totalAbonos = 0;
  for (const abono of tables.abonos ?? []) {
    totalAbonos += Number(abono['importe_centavos']) || 0;
  }
  let compradas = 0;
  for (const compra of tables.compras ?? []) {
    compradas += Number(compra['cantidad']) || 0;
  }
  let consumidas = 0;
  let costoFifo = 0;
  for (const consumo of tables.venta_consumos ?? []) {
    const cantidad = Number(consumo['cantidad']) || 0;
    consumidas += cantidad;
    costoFifo += cantidad * (Number(consumo['costo_unitario_centavos']) || 0);
  }
  return {
    saldo_global_centavos: totalVentas - totalAbonos,
    inventario_unidades: compradas - consumidas,
    ganancia_bruta_fifo_centavos: totalVentas - costoFifo,
    total_ventas_centavos: totalVentas,
    total_abonos_centavos: totalAbonos
  };
}

export function rutaPreRestorePersistente(nombreArchivo: string): string {
  const seguro = nombreArchivo
    .replace(/\.\./g, '_')
    .replace(/[^\w.\-]+/g, '_');
  return `pre-restore/${seguro}`;
}
