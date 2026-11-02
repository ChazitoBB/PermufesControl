import { describe, expect, it } from 'vitest';
import {
  ORDEN_BORRADO_RESTAURACION,
  ORDEN_INSERCION_RESTAURACION,
  calcularMetricasDesdePayload,
  construirInsertSql,
  conteosCoinciden,
  contarTablasDesdePayload,
  maxIdDeTabla,
  rutaPreRestorePersistente
} from './backup-restore.util';
import { TABLAS_RESPALDO, type ConteosRespaldo, type TablasRespaldo } from './backup.types';

function conteosVacios(parcial: Partial<ConteosRespaldo> = {}): ConteosRespaldo {
  const base = {} as ConteosRespaldo;
  for (const t of TABLAS_RESPALDO) {
    base[t] = 0;
  }
  return { ...base, ...parcial };
}

describe('backup-restore.util', () => {
  it('ordena borrado e inserción de forma compatible con FKs', () => {
    expect(ORDEN_BORRADO_RESTAURACION[0]).toBe('promocion_canjes');
    expect(ORDEN_BORRADO_RESTAURACION.at(-1)).toBe('clientes');
    expect(ORDEN_INSERCION_RESTAURACION[0]).toBe('clientes');
    expect(ORDEN_INSERCION_RESTAURACION.at(-1)).toBe('ruleta_giros');
    expect(ORDEN_INSERCION_RESTAURACION.indexOf('abonos'))
      .toBeLessThan(ORDEN_INSERCION_RESTAURACION.indexOf('operaciones_venta'));
  });

  it('construye INSERT parametrizado', () => {
    const { sql, valores } = construirInsertSql('clientes', {
      id: 1,
      nombre: 'Ana',
      telefono: ''
    });
    expect(sql).toContain('INSERT INTO clientes');
    expect(valores).toEqual([1, 'Ana', '']);
  });

  it('detecta desfases de conteos', () => {
    const base = conteosVacios({
      clientes: 1, productos: 1, compras: 1, ventas: 1, venta_consumos: 1, operaciones_venta: 1
    });
    expect(conteosCoinciden(base, base)).toEqual([]);
    expect(conteosCoinciden(base, { ...base, ventas: 2 }).length).toBe(1);
  });

  it('calcula max id y métricas FIFO', () => {
    const tables = {
      clientes: [{ id: 1 }],
      productos: [{ id: 1 }],
      compras: [{ id: 1, cantidad: 5 }],
      abonos: [{ id: 1, importe_centavos: 1000 }],
      operaciones_venta: [],
      ventas: [{ id: 1, cantidad: 2, precio_unitario_centavos: 28000 }],
      venta_consumos: [{ cantidad: 2, costo_unitario_centavos: 13700 }],
      encargos: [],
      promocion_codigos: [],
      promocion_canjes: [],
      ruleta_giros: []
    } as unknown as TablasRespaldo;
    expect(maxIdDeTabla(tables.clientes)).toBe(1);
    expect(contarTablasDesdePayload(tables).ventas).toBe(1);
    const m = calcularMetricasDesdePayload(tables);
    expect(m.inventario_unidades).toBe(3);
    expect(m.saldo_global_centavos).toBe(56000 - 1000);
  });

  it('ruta PRE-RESTORE es persistente y saneada', () => {
    expect(rutaPreRestorePersistente('PRE-RESTORE-a.pcbak'))
      .toBe('pre-restore/PRE-RESTORE-a.pcbak');
    expect(rutaPreRestorePersistente('PRE-RESTORE a/../x.pcbak')).not.toContain('..');
  });
});
