import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection
} from '@capacitor-community/sqlite';
import {
  calcularDiezmoCentavos,
  construirHistorialDiezmos,
  fechaHoyMexico,
  limitesSemanaDomingoSabado
} from './diezmo-semana';
import type { ConteosRespaldo, RespaldoPayload } from './backup.types';
import { TABLAS_RESPALDO } from './backup.types';
import {
  ORDEN_BORRADO_RESTAURACION,
  ORDEN_INSERCION_RESTAURACION,
  construirInsertSql,
  conteosCoinciden,
  maxIdDeTabla
} from './backup-restore.util';
import {
  FLAG_VENTAS_PRECIO_GE_CERO,
  SQL_COPIAR_VENTAS_A_BACKUP,
  SQL_COPIAR_VENTAS_A_MIG,
  SQL_CREAR_VENTAS_BACKUP,
  SQL_CREAR_VENTAS_MIG,
  SQL_CREAR_VENTAS_PRECIO_GE_CERO,
  SQL_RESTAURAR_VENTAS_DESDE_BACKUP,
  TABLA_VENTAS_BACKUP,
  TABLA_VENTAS_MIG,
  conteosMigracionCoinciden,
  decidirEstadoMigracionVentas,
  mensajeErrorConRollback,
  ventasSqlPermitePrecioCero
} from './ventas-precio-migracion.util';

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
}

export interface Producto {
  id: number;
  nombre: string;
  mililitros: number;
  costo_referencia_centavos: number;
  precio_venta_centavos: number;
  categoria: 'hombre' | 'mujer' | 'sin_clasificar';
  concentracion: string;
}

// Cada fila es una entrada de mercancía, no una venta.
export interface Compra {
  id: number;
  producto_id: number;
  nombre: string;
  mililitros: number;
  cantidad: number;
  costo_unitario_centavos: number;
  fecha: string;
}

export interface ExistenciaProducto {
  producto_id: number;
  unidades: number;
  inversion_centavos: number;
  ingreso_potencial_centavos: number;
  ganancia_potencial_centavos: number;
}

export interface Venta {
  id: number;
  cliente_id: number;
  cliente: string;
  producto: string;
  mililitros: number;
  cantidad: number;
  precio_unitario_centavos: number;
  total_centavos: number;
  costo_total_centavos: number;
  fecha: string;
  operacion_id: number | null;
}

export interface LineaVentaEntrada {
  productoId: number;
  cantidad: number;
  precioCentavos: number;
}

export interface OperacionVentaResumen {
  id: number;
  cliente_id: number;
  cliente: string;
  fecha: string;
  total_centavos: number;
  subtotal_centavos: number;
  descuento_centavos: number;
  pago_inicial_centavos: number;
  lineas_count: number;
  promocion_codigo: string | null;
}

export type EstadoEncargo =
  | 'pendiente'
  | 'pedido'
  | 'conseguido'
  | 'entregado'
  | 'cancelado';

export interface Encargo {
  id: number;
  cliente_id: number;
  cliente: string;
  nombre_perfume: string;
  mililitros: number;
  concentracion: string;
  cantidad: number;
  fecha_solicitud: string;
  notas: string;
  estado: EstadoEncargo;
  compra_id: number | null;
  operacion_venta_id: number | null;
  producto_id: number | null;
}

export type EstadoCodigoPremio = 'disponible' | 'utilizado' | 'anulado';

export interface CodigoPremio {
  id: number;
  codigo: string;
  cliente_id: number;
  cliente: string;
  tipo_premio: string;
  etiqueta: string;
  porcentaje: number | null;
  estado: EstadoCodigoPremio;
  creado_en: string;
  utilizado_en: string | null;
  sorpresa_entregada: number;
}

export interface LineaOperacionVenta {
  id: number;
  producto_id: number;
  producto: string;
  mililitros: number;
  cantidad: number;
  precio_unitario_centavos: number;
  total_centavos: number;
  costo_total_centavos: number;
}

export interface OperacionVentaDetalle {
  id: number;
  cliente_id: number;
  cliente: string;
  fecha: string;
  total_centavos: number;
  pago_inicial_centavos: number;
  lineas: LineaOperacionVenta[];
}

export interface Abono {
  id: number;
  cliente_id: number;
  cliente: string;
  importe_centavos: number;
  fecha: string;
  concepto: string;
}

export interface SaldoCliente {
  cliente_id: number;
  nombre: string;
  total_ventas_centavos: number;
  total_abonos_centavos: number;
  saldo_centavos: number;
}

/** Indicadores del panel de Inicio (importes en centavos). */
export interface ResumenInicio {
  fecha: string;
  ventas_hoy_centavos: number;
  cobros_hoy_centavos: number;
  saldo_por_cobrar_centavos: number;
  inventario_unidades: number;
  ganancia_bruta_ventas_centavos: number;
  ganancia_potencial_inventario_centavos: number;
  diezmo_semana_inicio: string;
  diezmo_semana_fin: string;
  ventas_semana_centavos: number;
  diezmo_semana_centavos: number;
}

export interface DiezmoSemanaResumen {
  inicio: string;
  fin: string;
  ventas_centavos: number;
  diezmo_centavos: number;
  es_actual: boolean;
}

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly nombreBD = 'perfumescontrol';
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private conexion?: SQLiteDBConnection;
  private inicializacion?: Promise<void>;

  iniciar(): Promise<void> {
    if (!this.inicializacion) {
      this.inicializacion = this.iniciarBD().catch(error => {
        this.inicializacion = undefined;
        throw error;
      });
    }
    return this.inicializacion;
  }

  private async iniciarBD(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      if (!document.querySelector('jeep-sqlite')) {
        document.body.appendChild(document.createElement('jeep-sqlite'));
      }
      await customElements.whenDefined('jeep-sqlite');
      await this.sqlite.initWebStore();
    }

    const existe = await this.sqlite.isConnection(this.nombreBD, false);
    this.conexion = existe.result
      ? await this.sqlite.retrieveConnection(this.nombreBD, false)
      : await this.sqlite.createConnection(
          this.nombreBD, false, 'no-encryption', 1, false
        );

    await this.conexion.open();

    await this.conexion.execute(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT NOT NULL DEFAULT '',
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.conexion.execute(`
      CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        mililitros INTEGER NOT NULL CHECK (mililitros IN (60, 120)),
        costo_referencia_centavos INTEGER NOT NULL
          CHECK (costo_referencia_centavos >= 0),
        precio_venta_centavos INTEGER NOT NULL
          CHECK (precio_venta_centavos >= 0),
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Nueva tabla: se crea sin borrar clientes ni productos anteriores.
    await this.conexion.execute(`
      CREATE TABLE IF NOT EXISTS compras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL CHECK (cantidad > 0),
        costo_unitario_centavos INTEGER NOT NULL
          CHECK (costo_unitario_centavos > 0),
        fecha TEXT NOT NULL,
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
      );
    `);

    // Ventas y consumos de lotes: permiten descontar existencias con FIFO.
    // Precio >= 0 permite unidad bonificada 3x2. Bases antiguas migran en
    // migrarVentasPermitenPrecioCero (CREATE IF NOT EXISTS no altera esquema).
    await this.conexion.execute(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        cantidad INTEGER NOT NULL CHECK(cantidad > 0),
        precio_unitario_centavos INTEGER NOT NULL CHECK(precio_unitario_centavos >= 0),
        fecha TEXT NOT NULL,
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.conexion.execute(`
      CREATE TABLE IF NOT EXISTS venta_consumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER NOT NULL REFERENCES ventas(id),
        compra_id INTEGER NOT NULL REFERENCES compras(id),
        cantidad INTEGER NOT NULL CHECK(cantidad > 0),
        costo_unitario_centavos INTEGER NOT NULL CHECK(costo_unitario_centavos > 0),
        UNIQUE(venta_id, compra_id)
      );
    `);
    await this.conexion.execute(`
      CREATE TABLE IF NOT EXISTS abonos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        importe_centavos INTEGER NOT NULL CHECK(importe_centavos > 0),
        fecha TEXT NOT NULL,
        concepto TEXT NOT NULL DEFAULT 'Abono',
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Agrupa líneas de una misma operación sin destruir ventas previas.
    await this.migrarOperacionesVenta();
    await this.migrarCatalogoEncargosPromociones();

    await this.persistirWeb();
  }

  /**
   * Migraciones no destructivas: categorías, encargos, cupones y totales de operación.
   * Nunca borra datos de negocio.
   */
  private async migrarCatalogoEncargosPromociones(): Promise<void> {
    await this.asegurarColumna(
      'productos',
      'categoria',
      `ALTER TABLE productos ADD COLUMN categoria TEXT NOT NULL DEFAULT 'sin_clasificar'`
    );
    await this.asegurarColumna(
      'productos',
      'concentracion',
      `ALTER TABLE productos ADD COLUMN concentracion TEXT NOT NULL DEFAULT ''`
    );

    await this.asegurarColumna(
      'operaciones_venta',
      'subtotal_centavos',
      `ALTER TABLE operaciones_venta ADD COLUMN subtotal_centavos INTEGER`
    );
    await this.asegurarColumna(
      'operaciones_venta',
      'descuento_centavos',
      `ALTER TABLE operaciones_venta ADD COLUMN descuento_centavos INTEGER NOT NULL DEFAULT 0`
    );
    await this.asegurarColumna(
      'operaciones_venta',
      'total_centavos',
      `ALTER TABLE operaciones_venta ADD COLUMN total_centavos INTEGER`
    );
    await this.asegurarColumna(
      'operaciones_venta',
      'promocion_codigo_id',
      `ALTER TABLE operaciones_venta ADD COLUMN promocion_codigo_id INTEGER`
    );

    await this.conexion!.execute(`
      CREATE TABLE IF NOT EXISTS encargos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        nombre_perfume TEXT NOT NULL,
        mililitros INTEGER NOT NULL CHECK (mililitros IN (60, 120)),
        concentracion TEXT NOT NULL DEFAULT '',
        cantidad INTEGER NOT NULL CHECK (cantidad > 0),
        fecha_solicitud TEXT NOT NULL,
        notas TEXT NOT NULL DEFAULT '',
        estado TEXT NOT NULL DEFAULT 'pendiente'
          CHECK (estado IN ('pendiente','pedido','conseguido','entregado','cancelado')),
        compra_id INTEGER REFERENCES compras(id),
        operacion_venta_id INTEGER REFERENCES operaciones_venta(id),
        producto_id INTEGER REFERENCES productos(id),
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.conexion!.execute(`
      CREATE TABLE IF NOT EXISTS promocion_codigos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        tipo_premio TEXT NOT NULL,
        etiqueta TEXT NOT NULL,
        porcentaje INTEGER,
        estado TEXT NOT NULL DEFAULT 'disponible'
          CHECK (estado IN ('disponible','utilizado','anulado')),
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        utilizado_en TEXT,
        operacion_venta_id INTEGER REFERENCES operaciones_venta(id),
        sorpresa_entregada INTEGER NOT NULL DEFAULT 0,
        notas TEXT NOT NULL DEFAULT ''
      );
    `);

    await this.conexion!.execute(`
      CREATE TABLE IF NOT EXISTS promocion_canjes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_id INTEGER NOT NULL REFERENCES promocion_codigos(id),
        operacion_venta_id INTEGER NOT NULL REFERENCES operaciones_venta(id),
        subtotal_centavos INTEGER NOT NULL,
        descuento_centavos INTEGER NOT NULL,
        total_centavos INTEGER NOT NULL,
        detalle TEXT NOT NULL DEFAULT '',
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.conexion!.execute(`
      CREATE TABLE IF NOT EXISTS ruleta_giros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER REFERENCES clientes(id),
        tipo_premio TEXT NOT NULL,
        etiqueta TEXT NOT NULL,
        codigo_id INTEGER REFERENCES promocion_codigos(id),
        ticket INTEGER NOT NULL,
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Backfill totales de operaciones antiguas (sin tocar montos históricos de líneas).
    await this.conexion!.run(`
      UPDATE operaciones_venta
      SET
        subtotal_centavos = COALESCE(subtotal_centavos, (
          SELECT COALESCE(SUM(v.cantidad * v.precio_unitario_centavos), 0)
          FROM ventas v WHERE v.operacion_id = operaciones_venta.id
        )),
        total_centavos = COALESCE(total_centavos, (
          SELECT COALESCE(SUM(v.cantidad * v.precio_unitario_centavos), 0)
          FROM ventas v WHERE v.operacion_id = operaciones_venta.id
        )),
        descuento_centavos = COALESCE(descuento_centavos, 0)
      WHERE total_centavos IS NULL OR subtotal_centavos IS NULL
    `);

    await this.migrarVentasPermitenPrecioCero();
  }

  private async asegurarColumna(
    tabla: string,
    columna: string,
    alterSql: string
  ): Promise<void> {
    const info = await this.conexion!.query(`PRAGMA table_info(${tabla})`);
    const columnas = (info.values ?? []).map(
      (c: { name: string }) => c.name
    );
    if (!columnas.includes(columna)) {
      await this.conexion!.execute(alterSql);
    }
  }

  /**
   * Permite precio 0 en líneas (unidad bonificada 3x2) sin borrar ventas.
   *
   * No usa beginTransaction + execute(default true): en @capacitor-community/sqlite
   * execute()/run() abren TX automática y anidan/rompen la TX explícita
   * (jeep-sqlite web y Android). DDL tampoco es fiable dentro de TX.
   * Estrategia: backup recuperable → copia verificada → swap → flag.
   */
  private async migrarVentasPermitenPrecioCero(): Promise<void> {
    await this.asegurarSchemaMeta();
    const tieneFlag = await this.schemaMetaTiene(FLAG_VENTAS_PRECIO_GE_CERO);
    const tablas = await this.listarNombresTablas();
    const sqlVentas = await this.obtenerSqlTabla('ventas');
    const estado = decidirEstadoMigracionVentas({
      tieneFlag,
      tablas,
      sqlVentas
    });

    if (estado === 'ya_migrada_flag') {
      return;
    }

    if (estado === 'ya_esquema_nuevo') {
      await this.schemaMetaSet(FLAG_VENTAS_PRECIO_GE_CERO, '1');
      await this.limpiarTablasMigracionVentasTemporales();
      return;
    }

    if (estado === 'parcial_solo_mig') {
      await this.ejecutarSinTx(
        `ALTER TABLE ${TABLA_VENTAS_MIG} RENAME TO ventas`
      );
      await this.schemaMetaSet(FLAG_VENTAS_PRECIO_GE_CERO, '1');
      await this.limpiarTablasMigracionVentasTemporales();
      return;
    }

    if (estado === 'parcial_solo_backup') {
      await this.ejecutarSinTx(SQL_CREAR_VENTAS_PRECIO_GE_CERO);
      await this.ejecutarSinTx(SQL_RESTAURAR_VENTAS_DESDE_BACKUP);
      const ok = await this.verificarConteosTablas(
        TABLA_VENTAS_BACKUP,
        'ventas'
      );
      if (!ok) {
        throw new Error(
          'No se pudo restaurar ventas desde ventas_pre_precio_cero.'
        );
      }
      // Tras restaurar, el esquema nuevo ya está; continuar no es necesario.
      await this.schemaMetaSet(FLAG_VENTAS_PRECIO_GE_CERO, '1');
      await this.limpiarTablasMigracionVentasTemporales();
      return;
    }

    if (estado === 'sin_tabla_ventas') {
      await this.ejecutarSinTx(SQL_CREAR_VENTAS_PRECIO_GE_CERO);
      await this.schemaMetaSet(FLAG_VENTAS_PRECIO_GE_CERO, '1');
      return;
    }

    if (estado === 'parcial_ambas') {
      // Mig incompleta: descartar solo la tabla temporal y reintentar.
      await this.ejecutarSinTx(`DROP TABLE IF EXISTS ${TABLA_VENTAS_MIG}`);
    }

    await this.reconstruirVentasPermitenPrecioCero();
  }

  private async reconstruirVentasPermitenPrecioCero(): Promise<void> {
    const antes = await this.conteosDeTabla('ventas');
    let foreignKeysRestauradas = false;

    try {
      await this.ejecutarSinTx('PRAGMA foreign_keys = OFF');

      // 1) Copia recuperable legible antes de cualquier DROP.
      await this.ejecutarSinTx(SQL_CREAR_VENTAS_BACKUP);
      await this.ejecutarSinTx(`DELETE FROM ${TABLA_VENTAS_BACKUP}`);
      await this.ejecutarSinTx(SQL_COPIAR_VENTAS_A_BACKUP);
      const backupOk = await this.verificarConteosTablas(
        'ventas',
        TABLA_VENTAS_BACKUP
      );
      if (!backupOk) {
        throw new Error(
          'Backup ventas_pre_precio_cero ilegible o incompleto; abortando.'
        );
      }

      // 2) Tabla destino con CHECK >= 0 y copia verificada.
      await this.ejecutarSinTx(`DROP TABLE IF EXISTS ${TABLA_VENTAS_MIG}`);
      await this.ejecutarSinTx(SQL_CREAR_VENTAS_MIG);
      await this.ejecutarSinTx(SQL_COPIAR_VENTAS_A_MIG);
      const migOk = await this.verificarConteosTablas('ventas', TABLA_VENTAS_MIG);
      if (!migOk) {
        throw new Error(
          'Migración de ventas abortada: no se conservaron todos los IDs/filas.'
        );
      }
      const despuesMig = await this.conteosDeTabla(TABLA_VENTAS_MIG);
      if (!conteosMigracionCoinciden(antes, despuesMig)) {
        throw new Error(
          'Migración de ventas abortada: no se conservaron todos los IDs/filas.'
        );
      }

      // 3) Swap destructivo solo tras verificación.
      await this.ejecutarSinTx('DROP TABLE ventas');
      await this.ejecutarSinTx(
        `ALTER TABLE ${TABLA_VENTAS_MIG} RENAME TO ventas`
      );

      const despues = await this.conteosDeTabla('ventas');
      if (!conteosMigracionCoinciden(antes, despues)) {
        throw new Error(
          'Post-swap: conteos de ventas no coinciden; revisar backup.'
        );
      }

      const sqlFinal = await this.obtenerSqlTabla('ventas');
      if (!ventasSqlPermitePrecioCero(sqlFinal)) {
        throw new Error(
          'Post-swap: el esquema de ventas no permite precio >= 0.'
        );
      }

      await this.schemaMetaSet(FLAG_VENTAS_PRECIO_GE_CERO, '1');
      // Backup histórico se conserva hasta el siguiente arranque limpio;
      // se elimina solo tras flag + verificación (idempotencia).
      await this.ejecutarSinTx(`DROP TABLE IF EXISTS ${TABLA_VENTAS_BACKUP}`);

      await this.ejecutarSinTx('PRAGMA foreign_keys = ON');
      foreignKeysRestauradas = true;
    } catch (error) {
      try {
        await this.intentarRecuperarVentasDesdeBackup();
      } catch {
        // Conservar el error de migración original abajo.
      }
      throw error;
    } finally {
      if (!foreignKeysRestauradas) {
        try {
          await this.ejecutarSinTx('PRAGMA foreign_keys = ON');
        } catch {
          // No ocultar el error de migración.
        }
      }
    }
  }

  private async intentarRecuperarVentasDesdeBackup(): Promise<void> {
    const tablas = await this.listarNombresTablas();
    if (!tablas.includes(TABLA_VENTAS_BACKUP)) {
      return;
    }
    if (!tablas.includes('ventas')) {
      await this.ejecutarSinTx(SQL_CREAR_VENTAS_PRECIO_GE_CERO);
      await this.ejecutarSinTx(SQL_RESTAURAR_VENTAS_DESDE_BACKUP);
    }
    await this.ejecutarSinTx(`DROP TABLE IF EXISTS ${TABLA_VENTAS_MIG}`);
  }

  private async limpiarTablasMigracionVentasTemporales(): Promise<void> {
    await this.ejecutarSinTx(`DROP TABLE IF EXISTS ${TABLA_VENTAS_MIG}`);
    // Conservar backup solo si aún no hay flag (recuperación); aquí ya migró.
    await this.ejecutarSinTx(`DROP TABLE IF EXISTS ${TABLA_VENTAS_BACKUP}`);
  }

  private async asegurarSchemaMeta(): Promise<void> {
    await this.ejecutarSinTx(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
    `);
  }

  private async schemaMetaTiene(clave: string): Promise<boolean> {
    const row = await this.conexion!.query(
      `SELECT valor FROM schema_meta WHERE clave = ?`,
      [clave]
    );
    return (row.values?.length ?? 0) > 0;
  }

  private async schemaMetaSet(clave: string, valor: string): Promise<void> {
    await this.conexion!.run(
      `INSERT OR REPLACE INTO schema_meta (clave, valor) VALUES (?, ?)`,
      [clave, valor],
      false
    );
  }

  /** execute con transaction=false (evita TX anidadas del plugin). */
  private async ejecutarSinTx(statements: string): Promise<void> {
    await this.conexion!.execute(statements, false);
  }

  private async listarNombresTablas(): Promise<string[]> {
    const res = await this.conexion!.query(
      `SELECT name FROM sqlite_master WHERE type='table'`
    );
    return (res.values ?? []).map((r: { name: string }) => r.name);
  }

  private async obtenerSqlTabla(nombre: string): Promise<string | null> {
    const res = await this.conexion!.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`,
      [nombre]
    );
    const sql = res.values?.[0]?.sql;
    return typeof sql === 'string' ? sql : null;
  }

  private async conteosDeTabla(tabla: string): Promise<{
    total: number;
    maxId: number;
  }> {
    const totalRes = await this.conexion!.query(
      `SELECT COUNT(*) AS total FROM ${tabla}`
    );
    const maxRes = await this.conexion!.query(
      `SELECT COALESCE(MAX(id), 0) AS max_id FROM ${tabla}`
    );
    return {
      total: Number(totalRes.values?.[0]?.total) || 0,
      maxId: Number(maxRes.values?.[0]?.max_id) || 0
    };
  }

  private async verificarConteosTablas(
    origen: string,
    destino: string
  ): Promise<boolean> {
    const a = await this.conteosDeTabla(origen);
    const b = await this.conteosDeTabla(destino);
    return conteosMigracionCoinciden(a, b);
  }

  /**
   * Rollback solo si hay TX activa; si el rollback falla, reporta ambas causas.
   */
  private async rollbackSiActiva(errorOriginal: unknown): Promise<never> {
    try {
      const activa = await this.conexion!.isTransactionActive();
      if (activa?.result) {
        await this.conexion!.rollbackTransaction();
      }
    } catch (errorRollback) {
      throw new Error(mensajeErrorConRollback(errorOriginal, errorRollback));
    }
    throw errorOriginal;
  }

  // Migración no destructiva: crea operaciones_venta y vincula ventas antiguas.
  private async migrarOperacionesVenta(): Promise<void> {
    await this.conexion!.execute(`
      CREATE TABLE IF NOT EXISTS operaciones_venta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        fecha TEXT NOT NULL,
        abono_id INTEGER REFERENCES abonos(id),
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const info = await this.conexion!.query('PRAGMA table_info(ventas)');
    const columnas = (info.values ?? []).map(
      (columna: { name: string }) => columna.name
    );
    if (!columnas.includes('operacion_id')) {
      await this.conexion!.execute(`
        ALTER TABLE ventas
        ADD COLUMN operacion_id INTEGER REFERENCES operaciones_venta(id)
      `);
    }

    const huerfanas = await this.conexion!.query(`
      SELECT id, cliente_id, fecha
      FROM ventas
      WHERE operacion_id IS NULL
      ORDER BY id ASC
    `);
    const pendientes = huerfanas.values ?? [];
    if (pendientes.length === 0) {
      return;
    }

    await this.conexion!.beginTransaction();
    try {
      for (const venta of pendientes) {
        const insertado = await this.conexion!.run(
          `INSERT INTO operaciones_venta (cliente_id, fecha)
           VALUES (?, ?)`,
          [venta.cliente_id, venta.fecha],
          false
        );
        const operacionId = insertado.changes?.lastId;
        if (
          typeof operacionId !== 'number' ||
          !Number.isSafeInteger(operacionId) ||
          operacionId <= 0
        ) {
          throw new Error('No se pudo migrar una venta histórica a operación.');
        }
        await this.conexion!.run(
          'UPDATE ventas SET operacion_id = ? WHERE id = ?',
          [operacionId, venta.id],
          false
        );
      }
      await this.conexion!.commitTransaction();
    } catch (error) {
      await this.rollbackSiActiva(error);
    }
  }

  private async persistirWeb(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      await this.sqlite.saveToStore(this.nombreBD);
    }
  }

  async listarClientes(): Promise<Cliente[]> {
    await this.iniciar();
    const resultado = await this.conexion!.query(
      'SELECT id, nombre, telefono FROM clientes ORDER BY id DESC'
    );
    return (resultado.values ?? []) as Cliente[];
  }

  async agregarCliente(nombre: string, telefono: string): Promise<void> {
    await this.iniciar();
    await this.conexion!.run(
      'INSERT INTO clientes (nombre, telefono) VALUES (?, ?)',
      [nombre.trim(), telefono.trim()]
    );
    await this.persistirWeb();
  }

  async listarProductos(): Promise<Producto[]> {
    await this.iniciar();
    const resultado = await this.conexion!.query(`
      SELECT id, nombre, mililitros,
             costo_referencia_centavos, precio_venta_centavos,
             COALESCE(categoria, 'sin_clasificar') AS categoria,
             COALESCE(concentracion, '') AS concentracion
      FROM productos ORDER BY nombre COLLATE NOCASE ASC, id DESC
    `);
    return (resultado.values ?? []) as Producto[];
  }

  async agregarProducto(
    nombre: string,
    mililitros: number,
    costoCentavos: number,
    precioCentavos: number,
    categoria: 'hombre' | 'mujer' | 'sin_clasificar' = 'sin_clasificar',
    concentracion = ''
  ): Promise<number> {
    await this.iniciar();
    const insertado = await this.conexion!.run(
      `INSERT INTO productos
       (nombre, mililitros, costo_referencia_centavos, precio_venta_centavos,
        categoria, concentracion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nombre.trim(),
        mililitros,
        costoCentavos,
        precioCentavos,
        categoria,
        concentracion
      ]
    );
    await this.persistirWeb();
    const id = insertado.changes?.lastId;
    if (typeof id !== 'number' || id <= 0) {
      throw new Error('No se pudo crear el producto.');
    }
    return id;
  }

  /**
   * Alta de perfume + compra inicial en una sola transacción atómica.
   */
  async crearProductoConCompraInicial(datos: {
    nombre: string;
    mililitros: number;
    costoCentavos: number;
    precioCentavos: number;
    categoria: 'hombre' | 'mujer' | 'sin_clasificar';
    concentracion: string;
    piezas: number;
    fecha: string;
  }): Promise<{ productoId: number; compraId: number }> {
    await this.iniciar();
    const {
      nombre, mililitros, costoCentavos, precioCentavos,
      categoria, concentracion, piezas, fecha
    } = datos;
    if (!nombre.trim() || ![60, 120].includes(mililitros) ||
        !Number.isSafeInteger(piezas) || piezas <= 0 ||
        !Number.isSafeInteger(costoCentavos) || costoCentavos <= 0 ||
        !Number.isSafeInteger(precioCentavos) || precioCentavos < 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Revisa los datos del perfume y la compra inicial.');
    }

    await this.conexion!.beginTransaction();
    try {
      const prod = await this.conexion!.run(
        `INSERT INTO productos
         (nombre, mililitros, costo_referencia_centavos, precio_venta_centavos,
          categoria, concentracion)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          nombre.trim(), mililitros, costoCentavos, precioCentavos,
          categoria, concentracion
        ],
        false
      );
      const productoId = prod.changes?.lastId;
      if (typeof productoId !== 'number' || productoId <= 0) {
        throw new Error('No se pudo crear el producto.');
      }
      const compra = await this.conexion!.run(
        `INSERT INTO compras
         (producto_id, cantidad, costo_unitario_centavos, fecha)
         VALUES (?, ?, ?, ?)`,
        [productoId, piezas, costoCentavos, fecha],
        false
      );
      const compraId = compra.changes?.lastId;
      if (typeof compraId !== 'number' || compraId <= 0) {
        throw new Error('No se pudo registrar la compra inicial.');
      }
      await this.conexion!.commitTransaction();
      await this.persistirWeb();
      return { productoId, compraId };
    } catch (error) {
      await this.conexion!.rollbackTransaction();
      throw error;
    }
  }


  async registrarCompra(
    productoId: number,
    cantidad: number,
    costoCentavos: number,
    fecha: string
  ): Promise<void> {
    await this.iniciar();

    if (!Number.isSafeInteger(productoId) || productoId <= 0 ||
        !Number.isSafeInteger(cantidad) || cantidad <= 0 ||
        !Number.isSafeInteger(costoCentavos) || costoCentavos <= 0 ||
        !Number.isSafeInteger(cantidad * costoCentavos) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Los datos de la compra no son válidos.');
    }

    const producto = await this.conexion!.query(
      'SELECT id FROM productos WHERE id = ?',
      [productoId]
    );
    if (!producto.values?.length) {
      throw new Error('El perfume seleccionado no existe.');
    }

    await this.conexion!.run(
      `INSERT INTO compras
        (producto_id, cantidad, costo_unitario_centavos, fecha)
       VALUES (?, ?, ?, ?)`,
      [productoId, cantidad, costoCentavos, fecha]
    );
    await this.persistirWeb();
  }

  async listarCompras(): Promise<Compra[]> {
    await this.iniciar();
    const resultado = await this.conexion!.query(`
      SELECT c.id, c.producto_id, p.nombre, p.mililitros,
             c.cantidad, c.costo_unitario_centavos, c.fecha
      FROM compras c
      INNER JOIN productos p ON p.id = c.producto_id
      ORDER BY c.fecha DESC, c.id DESC
    `);
    return (resultado.values ?? []) as Compra[];
  }

  // Inventario NETO: compras menos unidades asignadas a ventas.
  async listarExistencias(): Promise<ExistenciaProducto[]> {
    await this.iniciar();
    const resultado = await this.conexion!.query(`
      WITH lotes AS (
        SELECT c.producto_id, c.costo_unitario_centavos,
          c.cantidad - COALESCE((
            SELECT SUM(vc.cantidad) FROM venta_consumos vc
            WHERE vc.compra_id = c.id
          ), 0) AS disponibles
        FROM compras c
      )
      SELECT p.id AS producto_id,
        COALESCE(SUM(l.disponibles), 0) AS unidades,
        COALESCE(SUM(l.disponibles * l.costo_unitario_centavos), 0)
          AS inversion_centavos,
        COALESCE(SUM(l.disponibles * p.precio_venta_centavos), 0)
          AS ingreso_potencial_centavos,
        COALESCE(SUM(l.disponibles *
          (p.precio_venta_centavos - l.costo_unitario_centavos)), 0)
          AS ganancia_potencial_centavos
      FROM productos p
      LEFT JOIN lotes l ON l.producto_id = p.id
      GROUP BY p.id
    `);
    return (resultado.values ?? []) as ExistenciaProducto[];
  }

  // Compatibilidad: una sola línea se registra como operación multiproducto.
  async registrarVenta(datos: {
    clienteId: number;
    productoId: number;
    cantidad: number;
    precioCentavos: number;
    abonoInicialCentavos: number;
    fecha: string;
  }): Promise<void> {
    await this.registrarVentaMultiple({
      clienteId: datos.clienteId,
      lineas: [{
        productoId: datos.productoId,
        cantidad: datos.cantidad,
        precioCentavos: datos.precioCentavos
      }],
      abonoInicialCentavos: datos.abonoInicialCentavos,
      fecha: datos.fecha
    });
  }

  // Una operación, varias líneas, un solo pago inicial; todo o nada.
  // Código promocional opcional: se canjea en la misma transacción.
  async registrarVentaMultiple(datos: {
    clienteId: number;
    lineas: LineaVentaEntrada[];
    abonoInicialCentavos: number;
    fecha: string;
    codigoPremio?: string | null;
  }): Promise<number> {
    await this.iniciar();
    const { clienteId, lineas, abonoInicialCentavos, fecha } = datos;
    const codigoTexto = (datos.codigoPremio ?? '').trim().toUpperCase();
    const enteroPositivo = (n: number) => Number.isSafeInteger(n) && n > 0;

    if (!enteroPositivo(clienteId) || !Array.isArray(lineas) || lineas.length === 0 ||
        !Number.isSafeInteger(abonoInicialCentavos) || abonoInicialCentavos < 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Revisa los datos de la venta.');
    }

    const productosVistos = new Set<number>();
    const lineasBase: Array<LineaVentaEntrada & { mililitros: number }> = [];
    for (const linea of lineas) {
      if (!enteroPositivo(linea.productoId) ||
          !enteroPositivo(linea.cantidad) ||
          !Number.isSafeInteger(linea.precioCentavos) ||
          linea.precioCentavos < 0) {
        throw new Error('Revisa producto, cantidad y precio de cada línea.');
      }
      if (productosVistos.has(linea.productoId)) {
        throw new Error('El carrito no puede repetir el mismo perfume.');
      }
      productosVistos.add(linea.productoId);
      lineasBase.push({ ...linea, mililitros: 60 });
    }

    const { aplicarPremioALineas, assertTotalesConsistentes, codigoPuedeCanjearse } =
      await import('./promociones.util');

    let operacionId = 0;
    await this.conexion!.beginTransaction();
    try {
      const clientes = await this.conexion!.query(
        'SELECT id FROM clientes WHERE id = ?', [clienteId]
      );
      if (!clientes.values?.length) {
        throw new Error('El cliente ya no existe.');
      }

      for (const linea of lineasBase) {
        const productos = await this.conexion!.query(
          'SELECT id, mililitros FROM productos WHERE id = ?',
          [linea.productoId]
        );
        if (!productos.values?.length) {
          throw new Error('Un perfume del carrito ya no existe.');
        }
        linea.mililitros = Number(productos.values[0].mililitros) || 60;
      }

      let lineasCobro: Array<{
        productoId: number;
        cantidad: number;
        precioCentavos: number;
      }> = lineasBase.map(l => ({
        productoId: l.productoId,
        cantidad: l.cantidad,
        precioCentavos: l.precioCentavos
      }));

      let subtotalCentavos = lineasCobro.reduce(
        (a, l) => a + l.cantidad * l.precioCentavos, 0
      );
      let descuentoCentavos = 0;
      let totalOperacion = subtotalCentavos;
      let detallePromo = '';
      let codigoId: number | null = null;
      let tipoPremio = '';

      if (codigoTexto) {
        const cod = await this.conexion!.query(
          `SELECT id, cliente_id, tipo_premio, etiqueta, porcentaje, estado
           FROM promocion_codigos WHERE codigo = ?`,
          [codigoTexto]
        );
        if (!cod.values?.length) {
          throw new Error('Código promocional no encontrado.');
        }
        const fila = cod.values[0];
        if (Number(fila.cliente_id) !== clienteId) {
          throw new Error('El código no pertenece a este cliente.');
        }
        if (!codigoPuedeCanjearse(String(fila.estado))) {
          throw new Error('El código ya fue utilizado o anulado.');
        }
        codigoId = Number(fila.id);
        tipoPremio = String(fila.tipo_premio);
        const aplicado = aplicarPremioALineas(
          lineasBase.map(l => ({
            productoId: l.productoId,
            mililitros: l.mililitros,
            cantidad: l.cantidad,
            precioUnitarioCentavos: l.precioCentavos
          })),
          tipoPremio as never,
          fila.porcentaje == null ? null : Number(fila.porcentaje)
        );
        assertTotalesConsistentes(aplicado);
        // Una sola aplicación del descuento: líneas ya netas; operación guarda
        // subtotal/descuento/total sin volver a restar sobre las líneas.
        lineasCobro = aplicado.lineasAjustadas.map(l => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioCentavos: l.precioUnitarioCentavos
        }));
        subtotalCentavos = aplicado.subtotalCentavos;
        descuentoCentavos = aplicado.descuentoCentavos;
        totalOperacion = aplicado.totalCentavos;
        detallePromo = aplicado.detalle;
        const unidadesLineas = lineasCobro.reduce((s, l) => s + l.cantidad, 0);
        if (unidadesLineas !== aplicado.unidadesInventario) {
          throw new Error('Inconsistencia de unidades a descontar del inventario.');
        }
      }

      if (abonoInicialCentavos > totalOperacion) {
        throw new Error('El pago inicial no puede superar el total de la venta.');
      }

      const operacionInsertada = await this.conexion!.run(`
        INSERT INTO operaciones_venta (
          cliente_id, fecha, subtotal_centavos, descuento_centavos,
          total_centavos, promocion_codigo_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        clienteId, fecha, subtotalCentavos, descuentoCentavos,
        totalOperacion, codigoId
      ], false);
      const nuevoOperacionId = operacionInsertada.changes?.lastId;
      if (
        typeof nuevoOperacionId !== 'number' ||
        !Number.isSafeInteger(nuevoOperacionId) ||
        nuevoOperacionId <= 0
      ) {
        throw new Error('No se pudo crear la operación de venta.');
      }
      operacionId = nuevoOperacionId;

      for (const linea of lineasCobro) {
        const lotes = await this.conexion!.query(`
          SELECT c.id, c.costo_unitario_centavos,
            c.cantidad - COALESCE((
              SELECT SUM(vc.cantidad) FROM venta_consumos vc
              WHERE vc.compra_id = c.id
            ), 0) AS disponibles
          FROM compras c WHERE c.producto_id = ?
          ORDER BY c.fecha ASC, c.id ASC
        `, [linea.productoId]);

        let restante = linea.cantidad;
        const consumos: { compraId: number; cantidad: number; costo: number }[] = [];
        for (const lote of (lotes.values ?? [])) {
          const tomar = Math.min(restante, Number(lote.disponibles));
          if (tomar > 0) {
            consumos.push({
              compraId: Number(lote.id),
              cantidad: tomar,
              costo: Number(lote.costo_unitario_centavos)
            });
            restante -= tomar;
          }
          if (restante === 0) break;
        }
        if (restante > 0) {
          throw new Error('No hay suficientes existencias.');
        }

        const ventaInsertada = await this.conexion!.run(`
          INSERT INTO ventas (
            cliente_id, producto_id, cantidad,
            precio_unitario_centavos, fecha, operacion_id
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          clienteId, linea.productoId, linea.cantidad,
          linea.precioCentavos, fecha, operacionId
        ], false);
        const ventaId = ventaInsertada.changes?.lastId;
        if (
          typeof ventaId !== 'number' ||
          !Number.isSafeInteger(ventaId) ||
          ventaId <= 0
        ) {
          throw new Error('No se pudo identificar una línea de venta.');
        }

        for (const consumo of consumos) {
          await this.conexion!.run(`
            INSERT INTO venta_consumos
              (venta_id, compra_id, cantidad, costo_unitario_centavos)
            VALUES (?, ?, ?, ?)
          `, [ventaId, consumo.compraId, consumo.cantidad, consumo.costo], false);
        }
      }

      if (abonoInicialCentavos > 0) {
        const abonoInsertado = await this.conexion!.run(`
          INSERT INTO abonos (cliente_id, importe_centavos, fecha, concepto)
          VALUES (?, ?, ?, 'Pago inicial')
        `, [clienteId, abonoInicialCentavos, fecha], false);
        const abonoId = abonoInsertado.changes?.lastId;
        if (
          typeof abonoId !== 'number' ||
          !Number.isSafeInteger(abonoId) ||
          abonoId <= 0
        ) {
          throw new Error('No se pudo registrar el pago inicial.');
        }
        await this.conexion!.run(
          'UPDATE operaciones_venta SET abono_id = ? WHERE id = ?',
          [abonoId, operacionId],
          false
        );
      }

      if (codigoId != null) {
        const marcado = await this.conexion!.run(`
          UPDATE promocion_codigos
          SET estado = 'utilizado',
              utilizado_en = ?,
              operacion_venta_id = ?
          WHERE id = ? AND estado = 'disponible'
        `, [fecha, operacionId, codigoId], false);
        if ((marcado.changes?.changes ?? 0) !== 1) {
          throw new Error('No se pudo canjear el código (posible uso concurrente).');
        }
        await this.conexion!.run(`
          INSERT INTO promocion_canjes (
            codigo_id, operacion_venta_id,
            subtotal_centavos, descuento_centavos, total_centavos, detalle
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          codigoId, operacionId, subtotalCentavos,
          descuentoCentavos, totalOperacion, detallePromo
        ], false);
      }

      await this.conexion!.commitTransaction();
    } catch (error) {
      await this.conexion!.rollbackTransaction();
      throw error;
    }

    await this.persistirWeb();
    return operacionId;
  }

  async listarVentas(): Promise<Venta[]> {
    await this.iniciar();
    const r = await this.conexion!.query(`
      SELECT v.id, v.cliente_id, c.nombre AS cliente,
        p.nombre AS producto, p.mililitros, v.cantidad,
        v.precio_unitario_centavos,
        v.cantidad * v.precio_unitario_centavos AS total_centavos,
        COALESCE((SELECT SUM(vc.cantidad * vc.costo_unitario_centavos)
          FROM venta_consumos vc WHERE vc.venta_id = v.id), 0)
          AS costo_total_centavos,
        v.fecha, v.operacion_id
      FROM ventas v
      JOIN clientes c ON c.id = v.cliente_id
      JOIN productos p ON p.id = v.producto_id
      ORDER BY v.fecha DESC, v.id DESC
    `);
    return (r.values ?? []) as Venta[];
  }

  async listarOperacionesVenta(): Promise<OperacionVentaResumen[]> {
    await this.iniciar();
    const r = await this.conexion!.query(`
      SELECT o.id, o.cliente_id, c.nombre AS cliente, o.fecha,
        COALESCE(o.total_centavos, (
          SELECT SUM(v.cantidad * v.precio_unitario_centavos)
          FROM ventas v WHERE v.operacion_id = o.id
        ), 0) AS total_centavos,
        COALESCE(o.subtotal_centavos, (
          SELECT SUM(v.cantidad * v.precio_unitario_centavos)
          FROM ventas v WHERE v.operacion_id = o.id
        ), 0) AS subtotal_centavos,
        COALESCE(o.descuento_centavos, 0) AS descuento_centavos,
        COALESCE(a.importe_centavos, 0) AS pago_inicial_centavos,
        COALESCE((
          SELECT COUNT(*) FROM ventas v WHERE v.operacion_id = o.id
        ), 0) AS lineas_count,
        pc.codigo AS promocion_codigo
      FROM operaciones_venta o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN abonos a ON a.id = o.abono_id
      LEFT JOIN promocion_codigos pc ON pc.id = o.promocion_codigo_id
      ORDER BY o.fecha DESC, o.id DESC
    `);
    return (r.values ?? []) as OperacionVentaResumen[];
  }

  async obtenerDetalleOperacion(
    operacionId: number
  ): Promise<OperacionVentaDetalle> {
    await this.iniciar();
    if (!Number.isSafeInteger(operacionId) || operacionId <= 0) {
      throw new Error('Operación de venta no válida.');
    }

    const cabecera = await this.conexion!.query(`
      SELECT o.id, o.cliente_id, c.nombre AS cliente, o.fecha,
        COALESCE(a.importe_centavos, 0) AS pago_inicial_centavos
      FROM operaciones_venta o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN abonos a ON a.id = o.abono_id
      WHERE o.id = ?
    `, [operacionId]);
    if (!cabecera.values?.length) {
      throw new Error('La operación de venta no existe.');
    }

    const lineas = await this.conexion!.query(`
      SELECT v.id, v.producto_id, p.nombre AS producto, p.mililitros,
        v.cantidad, v.precio_unitario_centavos,
        v.cantidad * v.precio_unitario_centavos AS total_centavos,
        COALESCE((SELECT SUM(vc.cantidad * vc.costo_unitario_centavos)
          FROM venta_consumos vc WHERE vc.venta_id = v.id), 0)
          AS costo_total_centavos
      FROM ventas v
      JOIN productos p ON p.id = v.producto_id
      WHERE v.operacion_id = ?
      ORDER BY v.id ASC
    `, [operacionId]);

    const filas = (lineas.values ?? []) as LineaOperacionVenta[];
    const total = filas.reduce(
      (suma, linea) => suma + Number(linea.total_centavos), 0
    );
    const op = cabecera.values[0];
    return {
      id: Number(op.id),
      cliente_id: Number(op.cliente_id),
      cliente: String(op.cliente),
      fecha: String(op.fecha),
      total_centavos: total,
      pago_inicial_centavos: Number(op.pago_inicial_centavos) || 0,
      lineas: filas
    };
  }

  async listarSaldosClientes(): Promise<SaldoCliente[]> {
    await this.iniciar();
    // Deuda = totales de operación (ya netos de promoción) − abonos.
    const r = await this.conexion!.query(`
      SELECT c.id AS cliente_id, c.nombre,
        COALESCE(v.total, 0) AS total_ventas_centavos,
        COALESCE(a.total, 0) AS total_abonos_centavos,
        COALESCE(v.total, 0) - COALESCE(a.total, 0) AS saldo_centavos
      FROM clientes c
      LEFT JOIN (
        SELECT cliente_id,
          SUM(COALESCE(total_centavos, (
            SELECT SUM(ve.cantidad * ve.precio_unitario_centavos)
            FROM ventas ve WHERE ve.operacion_id = operaciones_venta.id
          ))) AS total
        FROM operaciones_venta
        GROUP BY cliente_id
      ) v ON v.cliente_id = c.id
      LEFT JOIN (
        SELECT cliente_id, SUM(importe_centavos) AS total
        FROM abonos GROUP BY cliente_id
      ) a ON a.cliente_id = c.id
      ORDER BY c.nombre COLLATE NOCASE
    `);
    return (r.values ?? []) as SaldoCliente[];
  }

  async registrarAbono(
    clienteId: number, importeCentavos: number, fecha: string
  ): Promise<void> {
    await this.iniciar();
    if (!Number.isSafeInteger(clienteId) || clienteId <= 0 ||
        !Number.isSafeInteger(importeCentavos) || importeCentavos <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Revisa los datos del abono.');
    }
    await this.conexion!.beginTransaction();
    try {
      const r = await this.conexion!.query(`
        SELECT
          COALESCE((
            SELECT SUM(COALESCE(total_centavos, (
              SELECT SUM(ve.cantidad * ve.precio_unitario_centavos)
              FROM ventas ve WHERE ve.operacion_id = operaciones_venta.id
            )))
            FROM operaciones_venta WHERE cliente_id = ?
          ), 0) -
          COALESCE((SELECT SUM(importe_centavos)
            FROM abonos WHERE cliente_id = ?), 0) AS saldo
      `, [clienteId, clienteId]);
      if (!r.values?.length) throw new Error('No se pudo consultar el saldo.');
      const cliente = await this.conexion!.query(
        'SELECT id FROM clientes WHERE id = ?', [clienteId]
      );
      if (!cliente.values?.length) throw new Error('Cliente no encontrado.');
      const saldo = Number(r.values[0].saldo);
      if (importeCentavos > saldo) {
        throw new Error('El abono supera el saldo del cliente.');
      }
      await this.conexion!.run(`
        INSERT INTO abonos (cliente_id, importe_centavos, fecha, concepto)
        VALUES (?, ?, ?, 'Abono')
      `, [clienteId, importeCentavos, fecha], false);
      await this.conexion!.commitTransaction();
    } catch (error) {
      await this.conexion!.rollbackTransaction();
      throw error;
    }
    await this.persistirWeb();
  }

  async listarAbonos(): Promise<Abono[]> {
    await this.iniciar();
    const r = await this.conexion!.query(`
      SELECT a.id, a.cliente_id, c.nombre AS cliente,
        a.importe_centavos, a.fecha, a.concepto
      FROM abonos a JOIN clientes c ON c.id = a.cliente_id
      ORDER BY a.fecha DESC, a.id DESC
    `);
    return (r.values ?? []) as Abono[];
  }

  private fechaLocalHoy(): string {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  /**
   * Lectura completa de tablas de negocio para respaldo.
   * No modifica ni elimina registros.
   */
  async exportarTablasRespaldo(): Promise<Record<string, Record<string, unknown>[]>> {
    await this.iniciar();
    const { TABLAS_RESPALDO } = await import('./backup.types');
    const resultado: Record<string, Record<string, unknown>[]> = {};
    for (const tabla of TABLAS_RESPALDO) {
      try {
        const consulta = await this.conexion!.query(`SELECT * FROM ${tabla}`);
        resultado[tabla] = (consulta.values ?? []) as Record<string, unknown>[];
      } catch {
        resultado[tabla] = [];
      }
    }
    return resultado;
  }

  /**
   * Resumen del dashboard.
   * Ventas/cobros del día usan la fecha de registro.
   * Cobros suman filas de abonos (pago inicial y abonos; sin duplicar).
   * Ganancias: bruta acumulada (FIFO) y potencial del inventario neto.
   */
  async obtenerResumenInicio(fecha?: string): Promise<ResumenInicio> {
    await this.iniciar();
    const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? fecha
      : this.fechaLocalHoy();

    const ventasHoy = await this.conexion!.query(`
      SELECT COALESCE(SUM(cantidad * precio_unitario_centavos), 0) AS total
      FROM ventas
      WHERE fecha = ?
    `, [dia]);

    // Cada pago (inicial o abono) es una sola fila en abonos.
    const cobrosHoy = await this.conexion!.query(`
      SELECT COALESCE(SUM(importe_centavos), 0) AS total
      FROM abonos
      WHERE fecha = ?
    `, [dia]);

    const saldos = await this.listarSaldosClientes();
    const saldoPorCobrar = saldos.reduce(
      (suma, s) => suma + Number(s.saldo_centavos || 0),
      0
    );

    const existencias = await this.listarExistencias();
    const inventarioUnidades = existencias.reduce(
      (suma, e) => suma + Number(e.unidades || 0),
      0
    );
    const gananciaPotencial = existencias.reduce(
      (suma, e) => suma + Number(e.ganancia_potencial_centavos || 0),
      0
    );

    // Ingresos de todas las ventas menos costos históricos FIFO.
    const gananciaBruta = await this.conexion!.query(`
      SELECT COALESCE(SUM(
        v.cantidad * v.precio_unitario_centavos - COALESCE((
          SELECT SUM(vc.cantidad * vc.costo_unitario_centavos)
          FROM venta_consumos vc
          WHERE vc.venta_id = v.id
        ), 0)
      ), 0) AS total
      FROM ventas v
    `);

    const diezmo = await this.obtenerDiezmoSemana();

    return {
      fecha: dia,
      ventas_hoy_centavos: Number(ventasHoy.values?.[0]?.total) || 0,
      cobros_hoy_centavos: Number(cobrosHoy.values?.[0]?.total) || 0,
      saldo_por_cobrar_centavos: saldoPorCobrar,
      inventario_unidades: inventarioUnidades,
      ganancia_bruta_ventas_centavos:
        Number(gananciaBruta.values?.[0]?.total) || 0,
      ganancia_potencial_inventario_centavos: gananciaPotencial,
      diezmo_semana_inicio: diezmo.inicio,
      diezmo_semana_fin: diezmo.fin,
      ventas_semana_centavos: diezmo.ventas_centavos,
      diezmo_semana_centavos: diezmo.diezmo_centavos
    };
  }

  /**
   * Diezmo = 10% del bruto de ventas (líneas en `ventas`) en la semana
   * domingo–sábado America/Mexico_City. No usa abonos ni cobros.
   */
  async obtenerDiezmoSemana(
    fechaReferencia?: string
  ): Promise<DiezmoSemanaResumen> {
    await this.iniciar();
    const referencia = fechaReferencia && /^\d{4}-\d{2}-\d{2}$/.test(fechaReferencia)
      ? fechaReferencia
      : fechaHoyMexico();
    const { inicio, fin } = limitesSemanaDomingoSabado(referencia);
    const actual = limitesSemanaDomingoSabado(fechaHoyMexico());

    const r = await this.conexion!.query(`
      SELECT COALESCE(SUM(cantidad * precio_unitario_centavos), 0) AS total
      FROM ventas
      WHERE fecha >= ? AND fecha <= ?
    `, [inicio, fin]);

    const ventas = Number(r.values?.[0]?.total) || 0;
    return {
      inicio,
      fin,
      ventas_centavos: ventas,
      diezmo_centavos: calcularDiezmoCentavos(ventas),
      es_actual: inicio === actual.inicio
    };
  }

  /** Historial recalculable desde ventas; sin tabla dedicada. */
  async listarHistorialDiezmos(): Promise<DiezmoSemanaResumen[]> {
    await this.iniciar();
    const hoy = fechaHoyMexico();

    const extrema = await this.conexion!.query(`
      SELECT MIN(fecha) AS primera FROM ventas
    `);
    const primera = (extrema.values?.[0]?.primera as string | null) ?? null;

    const porDia = await this.conexion!.query(`
      SELECT fecha,
        COALESCE(SUM(cantidad * precio_unitario_centavos), 0) AS total
      FROM ventas
      GROUP BY fecha
    `);

    const mapa = new Map<string, number>();
    for (const fila of (porDia.values ?? [])) {
      mapa.set(String(fila.fecha), Number(fila.total) || 0);
    }

    return construirHistorialDiezmos({
      hoyISO: hoy,
      primeraVentaISO: primera,
      ventasPorDia: mapa
    });
  }

  private async contarFilasTabla(
    conexion: SQLiteDBConnection,
    tabla: string
  ): Promise<number> {
    const r = await conexion.query(`SELECT COUNT(*) AS total FROM ${tabla}`);
    return Number(r.values?.[0]?.total) || 0;
  }

  private async obtenerConteosDesdeConexion(
    conexion: SQLiteDBConnection
  ): Promise<ConteosRespaldo> {
    const counts = {} as ConteosRespaldo;
    for (const tabla of TABLAS_RESPALDO) {
      counts[tabla] = await this.contarFilasTabla(conexion, tabla);
    }
    return counts;
  }

  private async asegurarEsquemaEnConexion(
    conexion: SQLiteDBConnection
  ): Promise<void> {
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT NOT NULL DEFAULT '',
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        mililitros INTEGER NOT NULL CHECK (mililitros IN (60, 120)),
        costo_referencia_centavos INTEGER NOT NULL
          CHECK (costo_referencia_centavos >= 0),
        precio_venta_centavos INTEGER NOT NULL
          CHECK (precio_venta_centavos >= 0),
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS compras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL CHECK (cantidad > 0),
        costo_unitario_centavos INTEGER NOT NULL
          CHECK (costo_unitario_centavos > 0),
        fecha TEXT NOT NULL,
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
      );
    `);
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS abonos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        importe_centavos INTEGER NOT NULL CHECK(importe_centavos > 0),
        fecha TEXT NOT NULL,
        concepto TEXT NOT NULL DEFAULT 'Abono',
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS operaciones_venta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        fecha TEXT NOT NULL,
        abono_id INTEGER REFERENCES abonos(id),
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        cantidad INTEGER NOT NULL CHECK(cantidad > 0),
        precio_unitario_centavos INTEGER NOT NULL CHECK(precio_unitario_centavos > 0),
        fecha TEXT NOT NULL,
        creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        operacion_id INTEGER REFERENCES operaciones_venta(id)
      );
    `);
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS venta_consumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER NOT NULL REFERENCES ventas(id),
        compra_id INTEGER NOT NULL REFERENCES compras(id),
        cantidad INTEGER NOT NULL CHECK(cantidad > 0),
        costo_unitario_centavos INTEGER NOT NULL CHECK(costo_unitario_centavos > 0),
        UNIQUE(venta_id, compra_id)
      );
    `);

    const info = await conexion.query('PRAGMA table_info(ventas)');
    const columnas = (info.values ?? []).map(
      (columna: { name: string }) => columna.name
    );
    if (!columnas.includes('operacion_id')) {
      await conexion.execute(`
        ALTER TABLE ventas
        ADD COLUMN operacion_id INTEGER REFERENCES operaciones_venta(id)
      `);
    }

    // Esquema ampliado para restauración temporal (mismas tablas que la viva).
    const prev = this.conexion;
    this.conexion = conexion;
    try {
      await this.migrarCatalogoEncargosPromociones();
    } finally {
      this.conexion = prev;
    }
  }

  private async vaciarTablasNegocio(
    conexion: SQLiteDBConnection,
    dentroDeTransaccion: boolean
  ): Promise<void> {
    for (const tabla of ORDEN_BORRADO_RESTAURACION) {
      await conexion.run(`DELETE FROM ${tabla}`, [], !dentroDeTransaccion);
    }
  }

  private async insertarPayloadEnConexion(
    conexion: SQLiteDBConnection,
    payload: RespaldoPayload,
    dentroDeTransaccion: boolean
  ): Promise<void> {
    for (const tabla of ORDEN_INSERCION_RESTAURACION) {
      const filas = payload.tables[tabla];
      for (const fila of filas) {
        const { sql, valores } = construirInsertSql(tabla, fila);
        await conexion.run(sql, valores, !dentroDeTransaccion);
      }
      const maxId = maxIdDeTabla(filas);
      if (maxId > 0) {
        try {
          await conexion.run(
            `DELETE FROM sqlite_sequence WHERE name = ?`,
            [tabla],
            !dentroDeTransaccion
          );
          await conexion.run(
            `INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)`,
            [tabla, maxId],
            !dentroDeTransaccion
          );
        } catch {
          // sqlite_sequence puede no existir aún en algunos motores web.
        }
      }
    }
  }

  private async validarIntegridadPostCarga(
    conexion: SQLiteDBConnection,
    esperado: ConteosRespaldo
  ): Promise<void> {
    const obtenido = await this.obtenerConteosDesdeConexion(conexion);
    const desfases = conteosCoinciden(esperado, obtenido);
    if (desfases.length) {
      throw new Error(
        `La verificación de restauración falló: ${desfases.join('; ')}`
      );
    }

    const huerfanas = await conexion.query(`
      SELECT COUNT(*) AS total FROM ventas WHERE operacion_id IS NULL
    `);
    if ((Number(huerfanas.values?.[0]?.total) || 0) > 0) {
      throw new Error('Hay ventas sin operación tras la restauración.');
    }

    const consumosRotos = await conexion.query(`
      SELECT COUNT(*) AS total
      FROM venta_consumos vc
      LEFT JOIN ventas v ON v.id = vc.venta_id
      LEFT JOIN compras c ON c.id = vc.compra_id
      WHERE v.id IS NULL OR c.id IS NULL
    `);
    if ((Number(consumosRotos.values?.[0]?.total) || 0) > 0) {
      throw new Error('Consumos FIFO inconsistentes tras la restauración.');
    }
  }

  /**
   * Carga el payload en una BD temporal, valida y la elimina.
   * No modifica la base viva.
   */
  async verificarRespaldoEnBaseTemporal(
    payload: RespaldoPayload
  ): Promise<{ counts: ConteosRespaldo }> {
    await this.iniciar();
    const nombreTmp = `perfumescontrol_restore_tmp_${Date.now()}`;
    let abierta = false;

    try {
      const conexionTmp = await this.sqlite.createConnection(
        nombreTmp, false, 'no-encryption', 1, false
      );
      await conexionTmp.open();
      abierta = true;
      await this.asegurarEsquemaEnConexion(conexionTmp);
      await this.vaciarTablasNegocio(conexionTmp, false);
      await this.insertarPayloadEnConexion(conexionTmp, payload, false);
      await this.validarIntegridadPostCarga(conexionTmp, payload.counts);
      const counts = await this.obtenerConteosDesdeConexion(conexionTmp);
      await conexionTmp.close();
      abierta = false;
      await this.sqlite.closeConnection(nombreTmp, false);
      try {
        await CapacitorSQLite.deleteDatabase({ database: nombreTmp });
      } catch {
        // En algunos entornos web el borrado físico puede fallar; ya cerramos.
      }
      return { counts };
    } catch (error) {
      try {
        if (abierta) {
          const conn = await this.sqlite.retrieveConnection(nombreTmp, false);
          await conn.close();
        }
      } catch { /* ignore */ }
      try {
        await this.sqlite.closeConnection(nombreTmp, false);
      } catch { /* ignore */ }
      try {
        await CapacitorSQLite.deleteDatabase({ database: nombreTmp });
      } catch { /* ignore */ }
      throw error;
    }
  }

  /**
   * Restaura el payload en la BD viva dentro de UNA transacción.
   * Si falla, hace rollback y conserva los datos anteriores.
   * Debe llamarse solo después de verificarEnBaseTemporal + confirmación.
   */
  async restaurarDesdePayload(payload: RespaldoPayload): Promise<void> {
    await this.iniciar();
    await this.conexion!.beginTransaction();
    try {
      await this.vaciarTablasNegocio(this.conexion!, true);
      await this.insertarPayloadEnConexion(this.conexion!, payload, true);
      await this.validarIntegridadPostCarga(this.conexion!, payload.counts);
      await this.conexion!.commitTransaction();
    } catch (error) {
      await this.conexion!.rollbackTransaction();
      throw error;
    }
    await this.persistirWeb();
  }

  // --- Encargos ---

  async listarEncargos(soloActivos = false): Promise<Encargo[]> {
    await this.iniciar();
    const sql = `
      SELECT e.id, e.cliente_id, c.nombre AS cliente, e.nombre_perfume,
        e.mililitros, e.concentracion, e.cantidad, e.fecha_solicitud,
        e.notas, e.estado, e.compra_id, e.operacion_venta_id, e.producto_id
      FROM encargos e
      JOIN clientes c ON c.id = e.cliente_id
      ${soloActivos ? `WHERE e.estado IN ('pendiente','pedido','conseguido')` : ''}
      ORDER BY e.fecha_solicitud DESC, e.id DESC
    `;
    const r = await this.conexion!.query(sql);
    return (r.values ?? []) as Encargo[];
  }

  async crearEncargo(datos: {
    clienteId: number;
    nombrePerfume: string;
    mililitros: number;
    concentracion: string;
    cantidad: number;
    fechaSolicitud: string;
    notas: string;
  }): Promise<number> {
    await this.iniciar();
    const insertado = await this.conexion!.run(
      `INSERT INTO encargos (
         cliente_id, nombre_perfume, mililitros, concentracion,
         cantidad, fecha_solicitud, notas, estado
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
      [
        datos.clienteId,
        datos.nombrePerfume.trim(),
        datos.mililitros,
        datos.concentracion,
        datos.cantidad,
        datos.fechaSolicitud,
        datos.notas.trim()
      ]
    );
    await this.persistirWeb();
    const id = insertado.changes?.lastId;
    if (typeof id !== 'number' || id <= 0) {
      throw new Error('No se pudo crear el encargo.');
    }
    return id;
  }

  async actualizarEstadoEncargo(
    encargoId: number,
    estado: EstadoEncargo
  ): Promise<void> {
    await this.iniciar();
    await this.conexion!.run(
      'UPDATE encargos SET estado = ? WHERE id = ?',
      [estado, encargoId]
    );
    await this.persistirWeb();
  }

  /**
   * Marca encargo como conseguido y registra compra si aún no tiene compra_id.
   * Idempotente: no duplica compra.
   */
  async registrarCompraDesdeEncargo(
    encargoId: number,
    productoId: number,
    costoUnitarioCentavos: number,
    fecha: string
  ): Promise<number> {
    await this.iniciar();
    await this.conexion!.beginTransaction();
    try {
      const r = await this.conexion!.query(
        'SELECT * FROM encargos WHERE id = ?',
        [encargoId]
      );
      if (!r.values?.length) {
        throw new Error('Encargo no encontrado.');
      }
      const encargo = r.values[0];
      if (encargo.compra_id != null) {
        await this.conexion!.commitTransaction();
        return Number(encargo.compra_id);
      }
      const compra = await this.conexion!.run(
        `INSERT INTO compras
         (producto_id, cantidad, costo_unitario_centavos, fecha)
         VALUES (?, ?, ?, ?)`,
        [
          productoId,
          Number(encargo.cantidad),
          costoUnitarioCentavos,
          fecha
        ],
        false
      );
      const compraId = compra.changes?.lastId;
      if (typeof compraId !== 'number' || compraId <= 0) {
        throw new Error('No se pudo registrar la compra del encargo.');
      }
      await this.conexion!.run(
        `UPDATE encargos
         SET estado = 'conseguido', compra_id = ?, producto_id = ?
         WHERE id = ? AND compra_id IS NULL`,
        [compraId, productoId, encargoId],
        false
      );
      await this.conexion!.commitTransaction();
      await this.persistirWeb();
      return compraId;
    } catch (error) {
      await this.conexion!.rollbackTransaction();
      throw error;
    }
  }

  async vincularVentaEncargo(
    encargoId: number,
    operacionVentaId: number
  ): Promise<void> {
    await this.iniciar();
    const r = await this.conexion!.query(
      'SELECT operacion_venta_id FROM encargos WHERE id = ?',
      [encargoId]
    );
    if (!r.values?.length) {
      throw new Error('Encargo no encontrado.');
    }
    if (r.values[0].operacion_venta_id != null) {
      return; // idempotente
    }
    await this.conexion!.run(
      `UPDATE encargos
       SET operacion_venta_id = ?, estado = 'entregado'
       WHERE id = ? AND operacion_venta_id IS NULL`,
      [operacionVentaId, encargoId]
    );
    await this.persistirWeb();
  }

  // --- Promociones / ruleta (modo prueba) ---

  async emitirCodigoPremio(datos: {
    clienteId: number;
    tipoPremio: string;
    etiqueta: string;
    porcentaje: number | null;
  }): Promise<CodigoPremio> {
    await this.iniciar();
    const { generarCodigoPremioUnico } = await import('./promociones.util');
    let codigo = '';
    for (let i = 0; i < 8; i++) {
      codigo = generarCodigoPremioUnico();
      const existe = await this.conexion!.query(
        'SELECT id FROM promocion_codigos WHERE codigo = ?',
        [codigo]
      );
      if (!(existe.values?.length)) {
        break;
      }
      codigo = '';
    }
    if (!codigo) {
      throw new Error('No se pudo generar un código único.');
    }
    const insertado = await this.conexion!.run(
      `INSERT INTO promocion_codigos
       (codigo, cliente_id, tipo_premio, etiqueta, porcentaje, estado)
       VALUES (?, ?, ?, ?, ?, 'disponible')`,
      [
        codigo,
        datos.clienteId,
        datos.tipoPremio,
        datos.etiqueta,
        datos.porcentaje
      ]
    );
    await this.persistirWeb();
    const id = insertado.changes?.lastId;
    if (typeof id !== 'number' || id <= 0) {
      throw new Error('No se pudo guardar el código.');
    }
    const cliente = await this.conexion!.query(
      'SELECT nombre FROM clientes WHERE id = ?',
      [datos.clienteId]
    );
    return {
      id,
      codigo,
      cliente_id: datos.clienteId,
      cliente: String(cliente.values?.[0]?.nombre ?? ''),
      tipo_premio: datos.tipoPremio,
      etiqueta: datos.etiqueta,
      porcentaje: datos.porcentaje,
      estado: 'disponible',
      creado_en: new Date().toISOString(),
      utilizado_en: null,
      sorpresa_entregada: 0
    };
  }

  async registrarGiroRuleta(datos: {
    clienteId: number | null;
    tipoPremio: string;
    etiqueta: string;
    codigoId: number | null;
    ticket: number;
  }): Promise<number> {
    await this.iniciar();
    const insertado = await this.conexion!.run(
      `INSERT INTO ruleta_giros
       (cliente_id, tipo_premio, etiqueta, codigo_id, ticket)
       VALUES (?, ?, ?, ?, ?)`,
      [
        datos.clienteId,
        datos.tipoPremio,
        datos.etiqueta,
        datos.codigoId,
        datos.ticket
      ]
    );
    await this.persistirWeb();
    const id = insertado.changes?.lastId;
    if (typeof id !== 'number' || id <= 0) {
      throw new Error('No se pudo registrar el giro.');
    }
    return id;
  }

  async listarCodigosPremio(clienteId?: number): Promise<CodigoPremio[]> {
    await this.iniciar();
    const r = await this.conexion!.query(
      clienteId
        ? `SELECT pc.*, c.nombre AS cliente
           FROM promocion_codigos pc
           JOIN clientes c ON c.id = pc.cliente_id
           WHERE pc.cliente_id = ?
           ORDER BY pc.id DESC`
        : `SELECT pc.*, c.nombre AS cliente
           FROM promocion_codigos pc
           JOIN clientes c ON c.id = pc.cliente_id
           ORDER BY pc.id DESC`,
      clienteId ? [clienteId] : []
    );
    return (r.values ?? []) as CodigoPremio[];
  }

  async marcarSorpresaEntregada(codigoId: number): Promise<void> {
    await this.iniciar();
    await this.conexion!.run(
      `UPDATE promocion_codigos SET sorpresa_entregada = 1 WHERE id = ?`,
      [codigoId]
    );
    await this.persistirWeb();
  }

  async anularCodigoPremio(codigoId: number): Promise<void> {
    await this.iniciar();
    await this.conexion!.run(
      `UPDATE promocion_codigos SET estado = 'anulado'
       WHERE id = ? AND estado = 'disponible'`,
      [codigoId]
    );
    await this.persistirWeb();
  }
}
