import { describe, expect, it } from 'vitest';
import { BackupService } from './backup.service';
import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  BACKUP_PAYLOAD_MAGIC
} from './backup-crypto';
import type { RespaldoPayload } from './backup.types';

describe('BackupService.validarPayload (ficticio)', () => {
  const servicio = new BackupService({} as never);

  const base = (): RespaldoPayload => ({
    magic: BACKUP_PAYLOAD_MAGIC,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    createdAt: '2026-11-01T12:00:00.000Z',
    databaseName: 'perfumescontrol',
    tables: {
      clientes: [{ id: 1, nombre: 'Ana', telefono: '' }],
      productos: [{
        id: 10,
        nombre: 'Demo',
        mililitros: 60,
        costo_referencia_centavos: 10000,
        precio_venta_centavos: 28000
      }],
      compras: [{
        id: 100,
        producto_id: 10,
        cantidad: 2,
        costo_unitario_centavos: 10000,
        fecha: '2026-11-01'
      }],
      abonos: [],
      operaciones_venta: [{
        id: 50,
        cliente_id: 1,
        fecha: '2026-11-01',
        abono_id: null
      }],
      ventas: [{
        id: 200,
        cliente_id: 1,
        producto_id: 10,
        cantidad: 1,
        precio_unitario_centavos: 28000,
        fecha: '2026-11-01',
        operacion_id: 50
      }],
      venta_consumos: [{
        id: 300,
        venta_id: 200,
        compra_id: 100,
        cantidad: 1,
        costo_unitario_centavos: 10000
      }]
    },
    counts: {
      clientes: 1,
      productos: 1,
      compras: 1,
      abonos: 0,
      operaciones_venta: 1,
      ventas: 1,
      venta_consumos: 1
    }
  });

  it('acepta un payload ficticio consistente', () => {
    expect(() => servicio.validarPayload(base())).not.toThrow();
  });

  it('rechaza app incorrecta', () => {
    const malo = base();
    (malo as { app: string }).app = 'OtraApp';
    expect(() => servicio.validarPayload(malo)).toThrow(/PerfumesControl/);
  });

  it('rechaza relaciones rotas', () => {
    const malo = base();
    malo.tables.ventas[0]['cliente_id'] = 999;
    expect(() => servicio.validarPayload(malo)).toThrow(/inconsistente/);
  });
});
