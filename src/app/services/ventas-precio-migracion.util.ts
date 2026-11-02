/**
 * Migración idempotente: ventas.precio_unitario_centavos CHECK (> 0) → (>= 0).
 * Lógica pura + SQL reutilizable (jeep-sqlite web y Android nativo).
 */

export const FLAG_VENTAS_PRECIO_GE_CERO = 'ventas_precio_ge_cero';
export const TABLA_VENTAS_MIG = 'ventas_mig';
export const TABLA_VENTAS_BACKUP = 'ventas_pre_precio_cero';

export type EstadoMigracionVentas =
  | 'ya_migrada_flag'
  | 'ya_esquema_nuevo'
  | 'parcial_solo_mig'
  | 'parcial_ambas'
  | 'parcial_solo_backup'
  | 'pendiente'
  | 'sin_tabla_ventas';

export interface ConteosVentas {
  total: number;
  maxId: number;
}

/** True si el CREATE de ventas ya permite precio 0. */
export function ventasSqlPermitePrecioCero(
  sql: string | null | undefined
): boolean {
  if (!sql) {
    return false;
  }
  return /precio_unitario_centavos\s+INTEGER[\s\S]*?CHECK\s*\(\s*precio_unitario_centavos\s*>=\s*0\s*\)/i.test(
    sql
  );
}

/** True si el esquema antiguo exige precio > 0. */
export function ventasSqlRequiereMigracion(
  sql: string | null | undefined
): boolean {
  if (!sql) {
    return false;
  }
  if (ventasSqlPermitePrecioCero(sql)) {
    return false;
  }
  return /precio_unitario_centavos\s+INTEGER[\s\S]*?CHECK\s*\(\s*precio_unitario_centavos\s*>\s*0\s*\)/i.test(
    sql
  );
}

export function decidirEstadoMigracionVentas(opts: {
  tieneFlag: boolean;
  tablas: string[];
  sqlVentas: string | null;
}): EstadoMigracionVentas {
  if (opts.tieneFlag) {
    return 'ya_migrada_flag';
  }

  const tieneVentas = opts.tablas.includes('ventas');
  const tieneMig = opts.tablas.includes(TABLA_VENTAS_MIG);
  const tieneBackup = opts.tablas.includes(TABLA_VENTAS_BACKUP);

  if (!tieneVentas && tieneMig) {
    return 'parcial_solo_mig';
  }
  if (!tieneVentas && tieneBackup) {
    return 'parcial_solo_backup';
  }
  if (!tieneVentas) {
    return 'sin_tabla_ventas';
  }
  if (ventasSqlPermitePrecioCero(opts.sqlVentas)) {
    return 'ya_esquema_nuevo';
  }
  if (tieneMig) {
    return 'parcial_ambas';
  }
  return 'pendiente';
}

export function conteosMigracionCoinciden(
  antes: ConteosVentas,
  despues: ConteosVentas
): boolean {
  return antes.total === despues.total && antes.maxId === despues.maxId;
}

export function mensajeErrorConRollback(
  errorOriginal: unknown,
  errorRollback: unknown
): string {
  const orig =
    errorOriginal instanceof Error
      ? errorOriginal.message
      : String(errorOriginal);
  const rb =
    errorRollback instanceof Error
      ? errorRollback.message
      : String(errorRollback);
  return `Migración ventas: ${orig} | rollback: ${rb}`;
}

/** DDL destino (mismo shape que ventas + operacion_id, CHECK >= 0). */
export const SQL_CREAR_VENTAS_PRECIO_GE_CERO = `
CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  precio_unitario_centavos INTEGER NOT NULL
    CHECK(precio_unitario_centavos >= 0),
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operacion_id INTEGER REFERENCES operaciones_venta(id)
);
`.trim();

export const SQL_CREAR_VENTAS_MIG = `
CREATE TABLE IF NOT EXISTS ventas_mig (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  precio_unitario_centavos INTEGER NOT NULL
    CHECK(precio_unitario_centavos >= 0),
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operacion_id INTEGER REFERENCES operaciones_venta(id)
);
`.trim();

export const SQL_CREAR_VENTAS_BACKUP = `
CREATE TABLE IF NOT EXISTS ventas_pre_precio_cero (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_unitario_centavos INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  operacion_id INTEGER
);
`.trim();

export const SQL_COPIAR_VENTAS_A_MIG = `
INSERT INTO ventas_mig (
  id, cliente_id, producto_id, cantidad,
  precio_unitario_centavos, fecha, creado_en, operacion_id
)
SELECT id, cliente_id, producto_id, cantidad,
  precio_unitario_centavos, fecha, creado_en, operacion_id
FROM ventas
`.trim();

export const SQL_COPIAR_VENTAS_A_BACKUP = `
INSERT INTO ventas_pre_precio_cero (
  id, cliente_id, producto_id, cantidad,
  precio_unitario_centavos, fecha, creado_en, operacion_id
)
SELECT id, cliente_id, producto_id, cantidad,
  precio_unitario_centavos, fecha, creado_en, operacion_id
FROM ventas
`.trim();

export const SQL_RESTAURAR_VENTAS_DESDE_BACKUP = `
INSERT INTO ventas (
  id, cliente_id, producto_id, cantidad,
  precio_unitario_centavos, fecha, creado_en, operacion_id
)
SELECT id, cliente_id, producto_id, cantidad,
  precio_unitario_centavos, fecha, creado_en, operacion_id
FROM ventas_pre_precio_cero
`.trim();

/**
 * Pasos SQL de la reconstrucción (sin BEGIN/COMMIT).
 * Cada sentencia debe ejecutarse con transaction=false si hay TX explícita;
 * o sin TX explícita (recomendado para DDL en jeep-sqlite).
 */
export function pasosReconstruccionVentas(): string[] {
  return [
    'PRAGMA foreign_keys = OFF',
    SQL_CREAR_VENTAS_BACKUP,
    // Limpiar backup previo incompleto
    'DELETE FROM ventas_pre_precio_cero',
    SQL_COPIAR_VENTAS_A_BACKUP,
    SQL_CREAR_VENTAS_MIG,
    'DELETE FROM ventas_mig',
    SQL_COPIAR_VENTAS_A_MIG,
    'DROP TABLE ventas',
    'ALTER TABLE ventas_mig RENAME TO ventas',
    'PRAGMA foreign_keys = ON'
  ];
}
