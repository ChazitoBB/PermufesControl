import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection
} from '@capacitor-community/sqlite';

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

    await this.persistirWeb();
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

  // Se inserta venta, consumo de existencias FIFO y pago inicial
  // dentro de una sola transacción, para evitar ventas incompletas.
  async registrarVenta(datos: {
    clienteId: number;
    productoId: number;
    cantidad: number;
    precioCentavos: number;
    abonoInicialCentavos: number;
    fecha: string;
  }): Promise<void> {
    await this.iniciar();
    const { clienteId, productoId, cantidad, precioCentavos,
            abonoInicialCentavos, fecha } = datos;
    const total = cantidad * precioCentavos;
    const enteroPositivo = (n: number) => Number.isSafeInteger(n) && n > 0;
    if (!enteroPositivo(clienteId) || !enteroPositivo(productoId) ||
        !enteroPositivo(cantidad) || !enteroPositivo(precioCentavos) ||
        !Number.isSafeInteger(total) ||
        !Number.isSafeInteger(abonoInicialCentavos) ||
        abonoInicialCentavos < 0 || abonoInicialCentavos > total ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Revisa los datos de la venta.');
    }

    await this.conexion!.beginTransaction();
    try {
      const clientes = await this.conexion!.query(
        'SELECT id FROM clientes WHERE id = ?', [clienteId]
      );
      const productos = await this.conexion!.query(
        'SELECT id FROM productos WHERE id = ?', [productoId]
      );
      if (!clientes.values?.length || !productos.values?.length) {
        throw new Error('El cliente o el perfume ya no existe.');
      }

      const lotes = await this.conexion!.query(`
        SELECT c.id, c.costo_unitario_centavos,
          c.cantidad - COALESCE((
            SELECT SUM(vc.cantidad) FROM venta_consumos vc
            WHERE vc.compra_id = c.id
          ), 0) AS disponibles
        FROM compras c WHERE c.producto_id = ?
        ORDER BY c.fecha ASC, c.id ASC
      `, [productoId]);
      let restante = cantidad;
      const consumos: {compraId: number; cantidad: number; costo: number}[] = [];
      for (const lote of (lotes.values ?? [])) {
        const tomar = Math.min(restante, Number(lote.disponibles));
        if (tomar > 0) {
          consumos.push({
            compraId: Number(lote.id), cantidad: tomar,
            costo: Number(lote.costo_unitario_centavos)
          });
          restante -= tomar;
        }
        if (restante === 0) break;
      }
      if (restante > 0) throw new Error('No hay suficientes existencias.');

      const insertado = await this.conexion!.run(`
        INSERT INTO ventas
          (cliente_id, producto_id, cantidad, precio_unitario_centavos, fecha)
        VALUES (?, ?, ?, ?, ?)
      `, [clienteId, productoId, cantidad, precioCentavos, fecha], false);
      const ventaId = insertado.changes?.lastId;
      if (typeof ventaId !== 'number' || !Number.isSafeInteger(ventaId) || ventaId <= 0) {
        throw new Error('No se pudo identificar la venta registrada.');
      }
      for (const consumo of consumos) {
        await this.conexion!.run(`
          INSERT INTO venta_consumos
            (venta_id, compra_id, cantidad, costo_unitario_centavos)
          VALUES (?, ?, ?, ?)
        `, [ventaId, consumo.compraId, consumo.cantidad, consumo.costo], false);
      }
      if (abonoInicialCentavos > 0) {
        await this.conexion!.run(`
          INSERT INTO abonos (cliente_id, importe_centavos, fecha, concepto)
          VALUES (?, ?, ?, 'Pago inicial')
        `, [clienteId, abonoInicialCentavos, fecha], false);
      }
      await this.conexion!.commitTransaction();
    } catch (error) {
      await this.conexion!.rollbackTransaction();
      throw error;
    }
    await this.persistirWeb();
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
        v.fecha
      FROM ventas v
      JOIN clientes c ON c.id = v.cliente_id
      JOIN productos p ON p.id = v.producto_id
      ORDER BY v.fecha DESC, v.id DESC
    `);
    return (r.values ?? []) as Venta[];
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
}
