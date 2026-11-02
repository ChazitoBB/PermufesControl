import { describe, expect, it } from 'vitest';
import {
  ORDEN_BORRADO_RESTAURACION,
  ORDEN_INSERCION_RESTAURACION,
  construirInsertSql,
  conteosCoinciden,
  contarTablasDesdePayload,
  maxIdDeTabla
} from './backup-restore.util';
import type { TablasRespaldo } from './backup.types';

describe('backup-restore.util', () => {
  it('ordena borrado e inserción de forma compatible con FKs', () => {
    expect(ORDEN_BORRADO_RESTAURACION[0]).toBe('venta_consumos');
    expect(ORDEN_BORRADO_RESTAURACION.at(-1)).toBe('clientes');
    expect(ORDEN_INSERCION_RESTAURACION[0]).toBe('clientes');
    expect(ORDEN_INSERCION_RESTAURACION.at(-1)).toBe('venta_consumos');
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
    expect(sql).toContain('?');
    expect(valores).toEqual([1, 'Ana', '']);
  });

  it('detecta desfases de conteos', () => {
    const base = {
      clientes: 1,
      productos: 1,
      compras: 1,
      abonos: 0,
      operaciones_venta: 1,
      ventas: 1,
      venta_consumos: 1
    };
    expect(conteosCoinciden(base, base)).toEqual([]);
    expect(conteosCoinciden(base, { ...base, ventas: 2 }).length).toBe(1);
  });

  it('calcula max id y conteos de payload ficticio', () => {
    const tables = {
      clientes: [{ id: 3 }, { id: 9 }],
      productos: [{ id: 1 }],
      compras: [],
      abonos: [],
      operaciones_venta: [],
      ventas: [],
      venta_consumos: []
    } as unknown as TablasRespaldo;
    expect(maxIdDeTabla(tables.clientes)).toBe(9);
    expect(contarTablasDesdePayload(tables).clientes).toBe(2);
  });
});
