import { describe, expect, it } from 'vitest';
import {
  FLAG_VENTAS_PRECIO_GE_CERO,
  TABLA_VENTAS_BACKUP,
  TABLA_VENTAS_MIG,
  conteosMigracionCoinciden,
  decidirEstadoMigracionVentas,
  mensajeErrorConRollback,
  ventasSqlPermitePrecioCero,
  ventasSqlRequiereMigracion,
  SQL_CREAR_VENTAS_PRECIO_GE_CERO
} from './ventas-precio-migracion.util';

const SQL_VENTAS_ANTIGUA = `
CREATE TABLE ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  precio_unitario_centavos INTEGER NOT NULL CHECK(precio_unitario_centavos > 0),
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operacion_id INTEGER REFERENCES operaciones_venta(id)
);
`;

const SQL_VENTAS_NUEVA = `
CREATE TABLE ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  precio_unitario_centavos INTEGER NOT NULL CHECK(precio_unitario_centavos >= 0),
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operacion_id INTEGER REFERENCES operaciones_venta(id)
);
`;

interface FilaVenta {
  id: number;
  cliente_id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario_centavos: number;
  fecha: string;
  creado_en: string;
  operacion_id: number | null;
}

/** Simula el esquema/estado de migración sin abrir SQLite real (jsdom). */
class FakeMigracionDb {
  tablas = new Map<string, FilaVenta[]>();
  sqlPorTabla = new Map<string, string>();
  flag = false;
  falloEn: 'post_drop' | null = null;

  constructor(filas: FilaVenta[] = [], sqlVentas = SQL_VENTAS_ANTIGUA) {
    this.tablas.set('ventas', structuredClone(filas));
    this.sqlPorTabla.set('ventas', sqlVentas);
  }

  private nombres(): string[] {
    return [...this.tablas.keys()];
  }

  private conteos(nombre: string): { total: number; maxId: number } {
    const filas = this.tablas.get(nombre) ?? [];
    return {
      total: filas.length,
      maxId: filas.reduce((m, f) => Math.max(m, f.id), 0)
    };
  }

  estado() {
    return decidirEstadoMigracionVentas({
      tieneFlag: this.flag,
      tablas: this.nombres(),
      sqlVentas: this.sqlPorTabla.get('ventas') ?? null
    });
  }

  /** Equivalente a migrarVentasPermitenPrecioCero + reconstruir. */
  migrar(): void {
    const estado = this.estado();
    if (estado === 'ya_migrada_flag') {
      return;
    }
    if (estado === 'ya_esquema_nuevo') {
      this.flag = true;
      this.tablas.delete(TABLA_VENTAS_MIG);
      this.tablas.delete(TABLA_VENTAS_BACKUP);
      this.sqlPorTabla.delete(TABLA_VENTAS_MIG);
      this.sqlPorTabla.delete(TABLA_VENTAS_BACKUP);
      return;
    }
    if (estado === 'parcial_solo_mig') {
      const mig = this.tablas.get(TABLA_VENTAS_MIG)!;
      this.tablas.set('ventas', mig);
      this.sqlPorTabla.set('ventas', SQL_VENTAS_NUEVA);
      this.tablas.delete(TABLA_VENTAS_MIG);
      this.sqlPorTabla.delete(TABLA_VENTAS_MIG);
      this.flag = true;
      this.tablas.delete(TABLA_VENTAS_BACKUP);
      return;
    }
    if (estado === 'parcial_solo_backup') {
      const backup = this.tablas.get(TABLA_VENTAS_BACKUP)!;
      this.tablas.set('ventas', structuredClone(backup));
      this.sqlPorTabla.set('ventas', SQL_VENTAS_NUEVA);
      this.flag = true;
      this.tablas.delete(TABLA_VENTAS_MIG);
      this.tablas.delete(TABLA_VENTAS_BACKUP);
      return;
    }
    if (estado === 'sin_tabla_ventas') {
      this.tablas.set('ventas', []);
      this.sqlPorTabla.set('ventas', SQL_VENTAS_NUEVA);
      this.flag = true;
      return;
    }
    if (estado === 'parcial_ambas') {
      this.tablas.delete(TABLA_VENTAS_MIG);
      this.sqlPorTabla.delete(TABLA_VENTAS_MIG);
    }
    this.reconstruir();
  }

  private reconstruir(): void {
    const origen = this.tablas.get('ventas');
    if (!origen) {
      throw new Error('No hay ventas');
    }
    const antes = this.conteos('ventas');

    this.tablas.set(TABLA_VENTAS_BACKUP, structuredClone(origen));
    this.sqlPorTabla.set(TABLA_VENTAS_BACKUP, 'backup');
    if (!conteosMigracionCoinciden(antes, this.conteos(TABLA_VENTAS_BACKUP))) {
      throw new Error('Backup incompleto');
    }

    this.tablas.set(TABLA_VENTAS_MIG, structuredClone(origen));
    this.sqlPorTabla.set(TABLA_VENTAS_MIG, SQL_VENTAS_NUEVA);
    if (!conteosMigracionCoinciden(antes, this.conteos(TABLA_VENTAS_MIG))) {
      throw new Error('Mig incompleta');
    }

    this.tablas.delete('ventas');
    this.sqlPorTabla.delete('ventas');

    if (this.falloEn === 'post_drop') {
      // Interrupción: no RENAME ni flag (datos en backup + mig).
      throw new Error('SQL simulado: fallo post DROP');
    }

    const mig = this.tablas.get(TABLA_VENTAS_MIG)!;
    this.tablas.set('ventas', mig);
    this.sqlPorTabla.set('ventas', SQL_VENTAS_NUEVA);
    this.tablas.delete(TABLA_VENTAS_MIG);
    this.sqlPorTabla.delete(TABLA_VENTAS_MIG);

    if (!conteosMigracionCoinciden(antes, this.conteos('ventas'))) {
      throw new Error('Post-swap incompleto');
    }
    if (!ventasSqlPermitePrecioCero(this.sqlPorTabla.get('ventas'))) {
      throw new Error('Esquema final incorrecto');
    }

    this.flag = true;
    this.tablas.delete(TABLA_VENTAS_BACKUP);
    this.sqlPorTabla.delete(TABLA_VENTAS_BACKUP);
  }

  /** Como intentarRecuperarVentasDesdeBackup. */
  recuperarDesdeBackup(): void {
    const backup = this.tablas.get(TABLA_VENTAS_BACKUP);
    if (!backup) {
      return;
    }
    if (!this.tablas.has('ventas')) {
      this.tablas.set('ventas', structuredClone(backup));
      this.sqlPorTabla.set('ventas', SQL_VENTAS_NUEVA);
    }
    this.tablas.delete(TABLA_VENTAS_MIG);
    this.sqlPorTabla.delete(TABLA_VENTAS_MIG);
  }
}

const FILAS_NEGOCIO: FilaVenta[] = [
  {
    id: 100,
    cliente_id: 1,
    producto_id: 1,
    cantidad: 2,
    precio_unitario_centavos: 28000,
    fecha: '2026-01-04',
    creado_en: '2026-01-04T10:00:00',
    operacion_id: 10
  },
  {
    id: 101,
    cliente_id: 2,
    producto_id: 2,
    cantidad: 1,
    precio_unitario_centavos: 45000,
    fecha: '2026-01-05',
    creado_en: '2026-01-05T11:00:00',
    operacion_id: null
  }
];

describe('ventas-precio-migracion.util — detección', () => {
  it('detecta CHECK > 0 vs >= 0', () => {
    expect(ventasSqlRequiereMigracion(SQL_VENTAS_ANTIGUA)).toBe(true);
    expect(ventasSqlPermitePrecioCero(SQL_VENTAS_ANTIGUA)).toBe(false);
    expect(ventasSqlPermitePrecioCero(SQL_CREAR_VENTAS_PRECIO_GE_CERO)).toBe(
      true
    );
    expect(ventasSqlRequiereMigracion(SQL_CREAR_VENTAS_PRECIO_GE_CERO)).toBe(
      false
    );
  });

  it('decide estados parciales y finales', () => {
    expect(
      decidirEstadoMigracionVentas({
        tieneFlag: true,
        tablas: ['ventas'],
        sqlVentas: SQL_VENTAS_ANTIGUA
      })
    ).toBe('ya_migrada_flag');

    expect(
      decidirEstadoMigracionVentas({
        tieneFlag: false,
        tablas: ['ventas'],
        sqlVentas: SQL_VENTAS_NUEVA
      })
    ).toBe('ya_esquema_nuevo');

    expect(
      decidirEstadoMigracionVentas({
        tieneFlag: false,
        tablas: [TABLA_VENTAS_MIG],
        sqlVentas: null
      })
    ).toBe('parcial_solo_mig');

    expect(
      decidirEstadoMigracionVentas({
        tieneFlag: false,
        tablas: ['ventas', TABLA_VENTAS_MIG],
        sqlVentas: SQL_VENTAS_ANTIGUA
      })
    ).toBe('parcial_ambas');

    expect(
      decidirEstadoMigracionVentas({
        tieneFlag: false,
        tablas: [TABLA_VENTAS_BACKUP],
        sqlVentas: null
      })
    ).toBe('parcial_solo_backup');

    expect(
      decidirEstadoMigracionVentas({
        tieneFlag: false,
        tablas: ['ventas'],
        sqlVentas: SQL_VENTAS_ANTIGUA
      })
    ).toBe('pendiente');
  });

  it('conserva mensaje original si rollback falla', () => {
    const msg = mensajeErrorConRollback(
      new Error('Already in transaction'),
      new Error('cannot rollback - no transaction is active')
    );
    expect(msg).toContain('Already in transaction');
    expect(msg).toContain('cannot rollback');
  });
});

describe('ventas-precio-migracion — escenarios A–G', () => {
  it('A: base nueva vacía marca flag sin datos', () => {
    const db = new FakeMigracionDb([], SQL_VENTAS_NUEVA);
    db.migrar();
    expect(db.flag).toBe(true);
    expect(ventasSqlPermitePrecioCero(db.sqlPorTabla.get('ventas'))).toBe(true);
    expect(db.tablas.get('ventas')!.length).toBe(0);
    db.migrar();
    expect(db.tablas.get('ventas')!.length).toBe(0);
  });

  it('B: base antigua con ventas y datos de negocio', () => {
    const db = new FakeMigracionDb(FILAS_NEGOCIO, SQL_VENTAS_ANTIGUA);
    const antes = structuredClone(db.tablas.get('ventas')!);
    db.migrar();
    expect(db.flag).toBe(true);
    expect(ventasSqlPermitePrecioCero(db.sqlPorTabla.get('ventas'))).toBe(true);
    expect(db.tablas.get('ventas')).toEqual(antes);
    expect(db.tablas.get('ventas')!.map(f => f.id)).toEqual([100, 101]);
  });

  it('C: base parcialmente migrada (solo ventas_mig)', () => {
    const db = new FakeMigracionDb(FILAS_NEGOCIO, SQL_VENTAS_ANTIGUA);
    const filas = structuredClone(db.tablas.get('ventas')!);
    db.tablas.set(TABLA_VENTAS_MIG, filas);
    db.sqlPorTabla.set(TABLA_VENTAS_MIG, SQL_VENTAS_NUEVA);
    db.tablas.delete('ventas');
    db.sqlPorTabla.delete('ventas');
    expect(db.estado()).toBe('parcial_solo_mig');

    db.migrar();
    expect(db.flag).toBe(true);
    expect(db.tablas.has('ventas')).toBe(true);
    expect(db.tablas.get('ventas')).toEqual(filas);
  });

  it('C2: parcial ventas + ventas_mig reintenta limpio', () => {
    const db = new FakeMigracionDb(FILAS_NEGOCIO, SQL_VENTAS_ANTIGUA);
    const antes = structuredClone(db.tablas.get('ventas')!);
    db.tablas.set(TABLA_VENTAS_MIG, [
      { ...FILAS_NEGOCIO[0], id: 999, precio_unitario_centavos: 1 }
    ]);
    expect(db.estado()).toBe('parcial_ambas');
    db.migrar();
    expect(db.tablas.get('ventas')).toEqual(antes);
    expect(db.tablas.has(TABLA_VENTAS_MIG)).toBe(false);
  });

  it('D: doble inicialización no duplica ni altera datos', () => {
    const db = new FakeMigracionDb(FILAS_NEGOCIO, SQL_VENTAS_ANTIGUA);
    db.migrar();
    const snap = structuredClone(db.tablas.get('ventas')!);
    const sql = db.sqlPorTabla.get('ventas');
    db.migrar();
    db.migrar();
    expect(db.tablas.get('ventas')).toEqual(snap);
    expect(db.sqlPorTabla.get('ventas')).toBe(sql);
    expect([...db.tablas.keys()].filter(t => t.startsWith('ventas'))).toEqual([
      'ventas'
    ]);
  });

  it('E: reconstrucción conserva IDs, relaciones y cantidad', () => {
    const db = new FakeMigracionDb(FILAS_NEGOCIO, SQL_VENTAS_ANTIGUA);
    const antes = structuredClone(db.tablas.get('ventas')!);
    db.migrar();
    expect(db.tablas.get('ventas')).toEqual(antes);
    expect(conteosMigracionCoinciden(
      { total: 2, maxId: 101 },
      {
        total: db.tablas.get('ventas')!.length,
        maxId: Math.max(...db.tablas.get('ventas')!.map(f => f.id))
      }
    )).toBe(true);
  });

  it('F: error SQL a mitad conserva datos vía backup (sin marcar flag)', () => {
    const db = new FakeMigracionDb(FILAS_NEGOCIO, SQL_VENTAS_ANTIGUA);
    const antes = structuredClone(db.tablas.get('ventas')!);
    db.falloEn = 'post_drop';
    expect(() => db.migrar()).toThrow(/fallo post DROP/);
    expect(db.flag).toBe(false);
    expect(db.tablas.has('ventas')).toBe(false);
    expect(db.tablas.has(TABLA_VENTAS_BACKUP)).toBe(true);

    db.recuperarDesdeBackup();
    expect(db.tablas.get('ventas')).toEqual(antes);
    expect(db.flag).toBe(false);

    db.falloEn = null;
    // Esquema ya nuevo tras recuperación → solo marca flag
    db.migrar();
    expect(db.flag).toBe(true);
    expect(db.tablas.get('ventas')).toEqual(antes);
  });

  it('G: sin TX anidada — mismos pasos web (jeep-sqlite) y Android', () => {
    // Documenta la estrategia: sin beginTransaction + execute(true).
    // Los pasos son DDL/DML secuenciales con transaction=false.
    const db = new FakeMigracionDb(FILAS_NEGOCIO, SQL_VENTAS_ANTIGUA);
    expect(db.estado()).toBe('pendiente');
    db.migrar();
    expect(db.flag).toBe(true);
    expect(ventasSqlPermitePrecioCero(db.sqlPorTabla.get('ventas'))).toBe(true);
    // Reintento no abre otra reconstrucción
    const sql = db.sqlPorTabla.get('ventas');
    db.migrar();
    expect(db.sqlPorTabla.get('ventas')).toBe(sql);
  });
});
