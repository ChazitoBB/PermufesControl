import { describe, expect, it } from 'vitest';
import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  BACKUP_PAYLOAD_MAGIC,
  cifrarRespaldo,
  descifrarRespaldo
} from './backup-crypto';
import type { RespaldoPayload } from './backup.types';
import { calcularMetricasDesdePayload } from './backup-restore.util';
import { BackupService } from './backup.service';

function payloadBase(): RespaldoPayload {
  return {
    magic: BACKUP_PAYLOAD_MAGIC,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    createdAt: '2026-11-02T12:00:00.000Z',
    databaseName: 'perfumescontrol',
    tables: {
      clientes: [{ id: 1, nombre: 'Demo', telefono: '' }],
      productos: [{
        id: 1,
        nombre: 'Aqua',
        mililitros: 60,
        costo_referencia_centavos: 4000,
        precio_venta_centavos: 10000
      }],
      compras: [{
        id: 1,
        producto_id: 1,
        cantidad: 3,
        costo_unitario_centavos: 4000,
        fecha: '2026-11-01'
      }],
      abonos: [],
      operaciones_venta: [{
        id: 1,
        cliente_id: 1,
        fecha: '2026-11-01',
        abono_id: null
      }],
      ventas: [{
        id: 1,
        cliente_id: 1,
        producto_id: 1,
        cantidad: 1,
        precio_unitario_centavos: 10000,
        fecha: '2026-11-01',
        operacion_id: 1
      }],
      venta_consumos: [{
        id: 1,
        venta_id: 1,
        compra_id: 1,
        cantidad: 1,
        costo_unitario_centavos: 4000
      }],
      encargos: [{
        id: 1,
        cliente_id: 1,
        nombre_perfume: 'Aqua',
        mililitros: 60,
        cantidad: 1,
        estado: 'pendiente'
      }],
      promocion_codigos: [],
      promocion_canjes: [],
      ruleta_giros: []
    },
    counts: {
      clientes: 1,
      productos: 1,
      compras: 1,
      abonos: 0,
      operaciones_venta: 1,
      ventas: 1,
      venta_consumos: 1,
      encargos: 1,
      promocion_codigos: 0,
      promocion_canjes: 0,
      ruleta_giros: 0
    }
  };
}

describe('validación de restauración v1/v2 (ficticia)', () => {
  const servicio = new BackupService({} as never, { esRestoreTest: false } as never);

  it('rechaza contraseña incorrecta al descifrar .pcbak', async () => {
    const archivo = await cifrarRespaldo(
      JSON.stringify(payloadBase()),
      'clave-correcta-demo'
    );
    await expect(descifrarRespaldo(archivo, 'clave-mala'))
      .rejects.toThrow(/Contraseña incorrecta|archivo alterado/);
  });

  it('rechaza archivo dañado (ciphertext alterado)', async () => {
    const archivo = await cifrarRespaldo(
      JSON.stringify(payloadBase()),
      'clave-correcta-demo'
    );
    archivo.ciphertext = `${archivo.ciphertext.slice(0, -6)}XXXXXX`;
    await expect(descifrarRespaldo(archivo, 'clave-correcta-demo'))
      .rejects.toThrow(/Contraseña incorrecta|archivo alterado/);
  });

  it('acepta respaldo v2 con encargo y rechaza encargo sin cliente', () => {
    expect(() => servicio.validarPayload(payloadBase())).not.toThrow();
    const roto = payloadBase();
    roto.tables.encargos[0]['cliente_id'] = 999;
    expect(() => servicio.validarPayload(roto)).toThrow(/encargo sin cliente/);
  });

  it('acepta respaldo v1 al normalizar tablas nuevas vacías', () => {
    const v1 = payloadBase();
    v1.formatVersion = 1;
    delete (v1.tables as { encargos?: unknown }).encargos;
    delete (v1.tables as { promocion_codigos?: unknown }).promocion_codigos;
    delete (v1.tables as { promocion_canjes?: unknown }).promocion_canjes;
    delete (v1.tables as { ruleta_giros?: unknown }).ruleta_giros;
    delete (v1.counts as { encargos?: unknown }).encargos;
    expect(() => servicio.validarPayload(v1)).not.toThrow();
    expect(v1.tables.encargos).toEqual([]);
    expect(v1.counts.ruleta_giros).toBe(0);
  });

  it('calcula métricas coherentes para preview pre-restauración', () => {
    const m = calcularMetricasDesdePayload(payloadBase().tables);
    expect(m.inventario_unidades).toBe(2);
    expect(m.saldo_global_centavos).toBe(10000);
    expect(m.ganancia_bruta_fifo_centavos).toBe(6000);
  });

  it('rechaza inventario FIFO negativo', () => {
    const p = payloadBase();
    p.tables.venta_consumos[0]['cantidad'] = 9;
    expect(() => servicio.validarPayload(p)).toThrow(/inventario negativo/);
  });
});
