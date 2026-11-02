import type { ConteosRespaldo, NombreTablaRespaldo, TablasRespaldo } from './backup.types';
import { TABLAS_RESPALDO } from './backup.types';

/** Borrado en orden seguro respecto a FKs. */
export const ORDEN_BORRADO_RESTAURACION: NombreTablaRespaldo[] = [
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
  'venta_consumos'
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
    if (esperado[nombre] !== obtenido[nombre]) {
      errores.push(
        `${nombre}: esperado ${esperado[nombre]}, obtenido ${obtenido[nombre]}`
      );
    }
  }
  return errores;
}

export function contarTablasDesdePayload(tables: TablasRespaldo): ConteosRespaldo {
  return {
    clientes: tables.clientes.length,
    productos: tables.productos.length,
    compras: tables.compras.length,
    abonos: tables.abonos.length,
    operaciones_venta: tables.operaciones_venta.length,
    ventas: tables.ventas.length,
    venta_consumos: tables.venta_consumos.length
  };
}
