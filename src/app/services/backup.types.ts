import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  BACKUP_PAYLOAD_MAGIC
} from './backup-crypto';

export const TABLAS_RESPALDO = [
  'clientes',
  'productos',
  'compras',
  'abonos',
  'operaciones_venta',
  'ventas',
  'venta_consumos'
] as const;

export type NombreTablaRespaldo = (typeof TABLAS_RESPALDO)[number];

export type TablasRespaldo = {
  [K in NombreTablaRespaldo]: Record<string, unknown>[];
};

export interface ConteosRespaldo {
  clientes: number;
  productos: number;
  compras: number;
  abonos: number;
  operaciones_venta: number;
  ventas: number;
  venta_consumos: number;
}

export interface RespaldoPayload {
  magic: typeof BACKUP_PAYLOAD_MAGIC;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  app: typeof BACKUP_APP_ID;
  createdAt: string;
  databaseName: 'perfumescontrol';
  tables: TablasRespaldo;
  counts: ConteosRespaldo;
}

export interface VistaPreviaRespaldo {
  createdAt: string;
  formatVersion: number;
  counts: ConteosRespaldo;
  valido: boolean;
  advertencias: string[];
}
