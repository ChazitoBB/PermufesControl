import { describe, expect, it } from 'vitest';
import {
  BACKUP_MAGIC,
  BACKUP_PAYLOAD_MAGIC,
  cifrarRespaldo,
  descifrarRespaldo,
  esArchivoRespaldoCifrado
} from './backup-crypto';

describe('backup-crypto', () => {
  const payloadFicticio = JSON.stringify({
    magic: BACKUP_PAYLOAD_MAGIC,
    formatVersion: 1,
    app: 'PerfumesControl',
    createdAt: '2026-11-01T12:00:00.000Z',
    databaseName: 'perfumescontrol',
    tables: {
      clientes: [{ id: 1, nombre: 'Prueba', telefono: '' }],
      productos: [],
      compras: [],
      abonos: [],
      operaciones_venta: [],
      ventas: [],
      venta_consumos: []
    },
    counts: {
      clientes: 1,
      productos: 0,
      compras: 0,
      abonos: 0,
      operaciones_venta: 0,
      ventas: 0,
      venta_consumos: 0
    }
  });

  it('cifra y descifra un payload ficticio', async () => {
    const archivo = await cifrarRespaldo(payloadFicticio, 'clave-segura-demo');
    expect(esArchivoRespaldoCifrado(archivo)).toBe(true);
    expect(archivo.magic).toBe(BACKUP_MAGIC);
    const plano = await descifrarRespaldo(archivo, 'clave-segura-demo');
    expect(plano).toBe(payloadFicticio);
  });

  it('rechaza contraseña incorrecta', async () => {
    const archivo = await cifrarRespaldo(payloadFicticio, 'clave-segura-demo');
    await expect(
      descifrarRespaldo(archivo, 'clave-incorrecta')
    ).rejects.toThrow(/Contraseña incorrecta|archivo alterado/);
  });

  it('detecta archivo alterado', async () => {
    const archivo = await cifrarRespaldo(payloadFicticio, 'clave-segura-demo');
    archivo.ciphertext = archivo.ciphertext.slice(0, -4) + 'AAAA';
    await expect(
      descifrarRespaldo(archivo, 'clave-segura-demo')
    ).rejects.toThrow(/Contraseña incorrecta|archivo alterado/);
  });

  it('rechaza formato incompatible', () => {
    expect(esArchivoRespaldoCifrado({ magic: 'OTRO' })).toBe(false);
    expect(esArchivoRespaldoCifrado(null)).toBe(false);
  });
});
