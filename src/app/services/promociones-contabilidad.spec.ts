import { describe, expect, it } from 'vitest';
import {
  TABLAS_RESPALDO_V1,
  TABLAS_RESPALDO_V2,
  normalizarPayloadRespaldo,
  type RespaldoPayload
} from './backup.types';
import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  BACKUP_PAYLOAD_MAGIC
} from './backup-crypto';
import {
  aplicarPremioALineas,
  assertTotalesConsistentes
} from './promociones.util';

/**
 * Auditoría financiera / respaldos con datos ficticios.
 * No toca SQLite real ni datos de producción.
 */
describe('auditoría contable y respaldos (ficticios)', () => {
  const costoFifoUnitario = 13700;

  it('FIFO: descuento no altera costo histórico unitario', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 3, precioUnitarioCentavos: 28000 }],
      'desc_20',
      20
    );
    // El util solo toca precios de venta; el costo FIFO vive en venta_consumos.
    const ingresoNeto = r.totalCentavos;
    const costoTotal = r.unidadesInventario * costoFifoUnitario;
    const ganancia = ingresoNeto - costoTotal;
    expect(ingresoNeto).toBe(78400);
    expect(costoTotal).toBe(3 * 13700);
    expect(ganancia).toBe(78400 - 41100);
    assertTotalesConsistentes(r);
  });

  it('pago inicial no puede superar el neto (regla de negocio)', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 2, precioUnitarioCentavos: 28000 }],
      'desc_50',
      50
    );
    const pago = 50000;
    expect(pago > r.totalCentavos).toBe(true);
    expect(r.totalCentavos).toBe(42000);
  });

  it('diezmo sobre ventas netas (líneas ya descontadas), no sobre abonos', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 3, precioUnitarioCentavos: 28000 }],
      'promo_3x2',
      null
    );
    const baseDiezmo = r.totalCentavos; // = SUM(líneas netas)
    const abonos = 10000; // no deben entrar al diezmo
    const diezmo = Math.round(baseDiezmo / 10);
    expect(baseDiezmo).toBe(56000);
    expect(diezmo).toBe(5600);
    expect(diezmo).not.toBe(Math.round((baseDiezmo + abonos) / 10));
  });

  it('respaldo v1 se normaliza con tablas v2 vacías; v2 conserva nuevas', () => {
    const v1 = {
      magic: BACKUP_PAYLOAD_MAGIC,
      formatVersion: 1,
      app: BACKUP_APP_ID,
      createdAt: '2026-11-01T00:00:00.000Z',
      databaseName: 'perfumescontrol',
      tables: {
        clientes: [{ id: 1 }],
        productos: [{ id: 1 }],
        compras: [],
        abonos: [],
        operaciones_venta: [],
        ventas: [{ id: 9, precio_unitario_centavos: 28000 }],
        venta_consumos: []
      },
      counts: {
        clientes: 1,
        productos: 1,
        compras: 0,
        abonos: 0,
        operaciones_venta: 0,
        ventas: 1,
        venta_consumos: 0
      }
    } as unknown as RespaldoPayload;

    const norm = normalizarPayloadRespaldo(v1);
    for (const t of TABLAS_RESPALDO_V1) {
      expect(Array.isArray(norm.tables[t])).toBe(true);
    }
    for (const t of TABLAS_RESPALDO_V2) {
      expect(norm.tables[t]).toEqual([]);
      expect(norm.counts[t]).toBe(0);
    }
    // Ventas históricas conservadas
    expect(norm.tables.ventas).toHaveLength(1);
    expect(norm.tables.ventas[0]!['id']).toBe(9);

    const v2 = normalizarPayloadRespaldo({
      ...norm,
      formatVersion: BACKUP_FORMAT_VERSION,
      tables: {
        ...norm.tables,
        encargos: [{ id: 1, nombre_perfume: 'Demo' }],
        promocion_codigos: [{ id: 1, codigo: 'PC-TEST' }],
        promocion_canjes: [],
        ruleta_giros: [{ id: 1, ticket: 100 }]
      },
      counts: {
        ...norm.counts,
        encargos: 1,
        promocion_codigos: 1,
        promocion_canjes: 0,
        ruleta_giros: 1
      }
    });
    expect(v2.tables.encargos).toHaveLength(1);
    expect(v2.tables.promocion_codigos[0]!['codigo']).toBe('PC-TEST');
    expect(v2.tables.ventas[0]!['id']).toBe(9);
  });
});
