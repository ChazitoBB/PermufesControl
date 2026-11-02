import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  BACKUP_PAYLOAD_MAGIC
} from './backup-crypto';

/** Tablas v1 (compatibilidad con respaldos anteriores). */
export const TABLAS_RESPALDO_V1 = [
  'clientes',
  'productos',
  'compras',
  'abonos',
  'operaciones_venta',
  'ventas',
  'venta_consumos'
] as const;

/** Tablas nuevas v2 (catálogo/encargos/promos). */
export const TABLAS_RESPALDO_V2 = [
  'encargos',
  'promocion_codigos',
  'promocion_canjes',
  'ruleta_giros'
] as const;

export const TABLAS_RESPALDO = [
  ...TABLAS_RESPALDO_V1,
  ...TABLAS_RESPALDO_V2
] as const;

export type NombreTablaRespaldo = (typeof TABLAS_RESPALDO)[number];

export type TablasRespaldo = {
  [K in NombreTablaRespaldo]: Record<string, unknown>[];
};

export type ConteosRespaldo = {
  [K in NombreTablaRespaldo]: number;
};

export interface RespaldoPayload {
  magic: typeof BACKUP_PAYLOAD_MAGIC;
  formatVersion: number;
  app: typeof BACKUP_APP_ID;
  createdAt: string;
  databaseName: 'perfumescontrol';
  tables: TablasRespaldo;
  counts: ConteosRespaldo;
}

export interface MetricasPreviewRespaldo {
  saldo_global_centavos: number;
  inventario_unidades: number;
  ganancia_bruta_fifo_centavos: number;
  total_ventas_centavos: number;
  total_abonos_centavos: number;
}

export interface VistaPreviaRespaldo {
  createdAt: string;
  formatVersion: number;
  counts: ConteosRespaldo;
  valido: boolean;
  advertencias: string[];
  metricas: MetricasPreviewRespaldo;
}

/** Completa tablas v2 vacías al leer respaldos v1. */
export function normalizarPayloadRespaldo(
  payload: RespaldoPayload
): RespaldoPayload {
  const tables = { ...payload.tables } as TablasRespaldo;
  const counts = { ...payload.counts } as ConteosRespaldo;
  for (const nombre of TABLAS_RESPALDO) {
    if (!Array.isArray(tables[nombre])) {
      tables[nombre] = [];
    }
    if (typeof counts[nombre] !== 'number') {
      counts[nombre] = tables[nombre].length;
    }
  }
  return { ...payload, tables, counts };
}
