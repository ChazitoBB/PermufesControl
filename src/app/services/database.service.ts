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
  pago_inicial_centavos: number;
  lineas_count: number;
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
    await this.conexion.execute(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        cantidad INTEGER NOT NULL CHECK(cantidad > 0),
        precio_unitario_centavos INTEGER NOT NULL CHECK(precio_unitario_centavos > 0),
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

    await this.persistirWeb();
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
      await this.conexion!.rollbackTransaction();
      throw error;
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
             costo_referencia_centavos, precio_venta_centavos
      FROM productos ORDER BY id DESC
    `);
    return (resultado.values ?? []) as Producto[];
  }

  async agregarProducto(
    nombre: string,
    mililitros: number,
    costoCentavos: number,
    precioCentavos: number
  ): Promise<void> {
    await this.iniciar();
    await this.conexion!.run(
      `INSERT INTO productos
       (nombre, mililitros, costo_referencia_centavos, precio_venta_centavos)
       VALUES (?, ?, ?, ?)`,
      [nombre.trim(), mililitros, costoCentavos, precioCentavos]
    );
    await this.persistirWeb();
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
  async registrarVentaMultiple(datos: {
    clienteId: number;
    lineas: LineaVentaEntrada[];
    abonoInicialCentavos: number;
    fecha: string;
  }): Promise<number> {
    await this.iniciar();
    const { clienteId, lineas, abonoInicialCentavos, fecha } = datos;
    const enteroPositivo = (n: number) => Number.isSafeInteger(n) && n > 0;

    if (!enteroPositivo(clienteId) || !Array.isArray(lineas) || lineas.length === 0 ||
        !Number.isSafeInteger(abonoInicialCentavos) || abonoInicialCentavos < 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Revisa los datos de la venta.');
    }

    let totalOperacion = 0;
    const productosVistos = new Set<number>();
    for (const linea of lineas) {
      if (!enteroPositivo(linea.productoId) ||
          !enteroPositivo(linea.cantidad) ||
          !enteroPositivo(linea.precioCentavos)) {
        throw new Error('Revisa producto, cantidad y precio de cada línea.');
      }
      if (productosVistos.has(linea.productoId)) {
        throw new Error('El carrito no puede repetir el mismo perfume.');
      }
      productosVistos.add(linea.productoId);
      const subtotal = linea.cantidad * linea.precioCentavos;
      if (!Number.isSafeInteger(subtotal)) {
        throw new Error('El importe de una línea es demasiado grande.');
      }
      totalOperacion += subtotal;
      if (!Number.isSafeInteger(totalOperacion)) {
        throw new Error('El total de la operación es demasiado grande.');
      }
    }
    if (abonoInicialCentavos > totalOperacion) {
      throw new Error('El pago inicial no puede superar el total de la venta.');
    }

    let operacionId = 0;
    await this.conexion!.beginTransaction();
    try {
      const clientes = await this.conexion!.query(
        'SELECT id FROM clientes WHERE id = ?', [clienteId]
      );
      if (!clientes.values?.length) {
        throw new Error('El cliente ya no existe.');
      }

      const operacionInsertada = await this.conexion!.run(`
        INSERT INTO operaciones_venta (cliente_id, fecha)
        VALUES (?, ?)
      `, [clienteId, fecha], false);
      const nuevoOperacionId = operacionInsertada.changes?.lastId;
      if (
        typeof nuevoOperacionId !== 'number' ||
        !Number.isSafeInteger(nuevoOperacionId) ||
        nuevoOperacionId <= 0
      ) {
        throw new Error('No se pudo crear la operación de venta.');
      }
      operacionId = nuevoOperacionId;

      for (const linea of lineas) {
        const productos = await this.conexion!.query(
          'SELECT id FROM productos WHERE id = ?', [linea.productoId]
        );
        if (!productos.values?.length) {
          throw new Error('Un perfume del carrito ya no existe.');
        }

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
        COALESCE((
          SELECT SUM(v.cantidad * v.precio_unitario_centavos)
          FROM ventas v WHERE v.operacion_id = o.id
        ), 0) AS total_centavos,
        COALESCE(a.importe_centavos, 0) AS pago_inicial_centavos,
        COALESCE((
          SELECT COUNT(*) FROM ventas v WHERE v.operacion_id = o.id
        ), 0) AS lineas_count
      FROM operaciones_venta o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN abonos a ON a.id = o.abono_id
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
    const r = await this.conexion!.query(`
      SELECT c.id AS cliente_id, c.nombre,
        COALESCE(v.total, 0) AS total_ventas_centavos,
        COALESCE(a.total, 0) AS total_abonos_centavos,
        COALESCE(v.total, 0) - COALESCE(a.total, 0) AS saldo_centavos
      FROM clientes c
      LEFT JOIN (
        SELECT cliente_id,
          SUM(cantidad * precio_unitario_centavos) AS total
        FROM ventas GROUP BY cliente_id
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
          COALESCE((SELECT SUM(cantidad * precio_unitario_centavos)
            FROM ventas WHERE cliente_id = ?), 0) -
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
    const tablas = [
      'clientes',
      'productos',
      'compras',
      'abonos',
      'operaciones_venta',
      'ventas',
      'venta_consumos'
    ] as const;

    const resultado: Record<string, Record<string, unknown>[]> = {};
    for (const tabla of tablas) {
      const consulta = await this.conexion!.query(`SELECT * FROM ${tabla}`);
      resultado[tabla] = (consulta.values ?? []) as Record<string, unknown>[];
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
}
