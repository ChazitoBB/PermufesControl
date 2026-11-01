import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import {
  DatabaseService, Cliente, Producto, ExistenciaProducto,
  Abono, SaldoCliente, OperacionVentaResumen, OperacionVentaDetalle
} from '../services/database.service';

type Vista = 'venta' | 'abono' | 'historial';

interface LineaCarrito {
  productoId: number;
  nombre: string;
  mililitros: number;
  cantidad: number;
  precioTexto: string;
}

@Component({
  selector: 'app-tab4',
  standalone: true,
  templateUrl: 'tab4.page.html',
  styleUrls: ['tab4.page.scss'],
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent]
})
export class Tab4Page {
  vista: Vista = 'venta';
  clientes: Cliente[] = [];
  productos: Producto[] = [];
  existencias: ExistenciaProducto[] = [];
  operaciones: OperacionVentaResumen[] = [];
  abonos: Abono[] = [];
  saldos: SaldoCliente[] = [];

  clienteVentaId: number | null = null;
  productoAgregarId: number | null = null;
  cantidadAgregar = 1;
  precioAgregar = '';
  carrito: LineaCarrito[] = [];
  pagoInicial = '0';
  fechaVenta = this.hoyLocal();

  clienteAbonoId: number | null = null;
  importeAbono = '';
  fechaAbono = this.hoyLocal();

  operacionDetalleId: number | null = null;
  detalleOperacion: OperacionVentaDetalle | null = null;
  cargandoDetalle = false;

  cargando = true;
  guardando = false;
  error = '';
  mensaje = '';

  constructor(
    private database: DatabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  private hoyLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async ionViewWillEnter(): Promise<void> {
    this.cargando = true;
    this.error = '';
    try {
      await this.actualizar();
    } catch (e) {
      console.error('Error al cargar ventas:', e);
      this.error = 'No se pudieron cargar los datos de SQLite.';
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  private async actualizar(): Promise<void> {
    this.clientes = await this.database.listarClientes();
    this.productos = await this.database.listarProductos();
    this.existencias = await this.database.listarExistencias();
    this.operaciones = await this.database.listarOperacionesVenta();
    this.abonos = await this.database.listarAbonos();
    this.saldos = await this.database.listarSaldosClientes();
    if (this.operacionDetalleId !== null) {
      this.detalleOperacion = await this.database.obtenerDetalleOperacion(
        this.operacionDetalleId
      );
    }
  }

  cambiarVista(vista: Vista): void {
    this.vista = vista;
    this.error = '';
    this.mensaje = '';
  }

  stock(id: number): number {
    return this.existencias.find(x => x.producto_id === id)?.unidades ?? 0;
  }

  /** Existencias libres descontando lo ya puesto en el carrito. */
  stockDisponiblePara(productoId: number): number {
    const enCarrito = this.carrito
      .filter(l => l.productoId === productoId)
      .reduce((suma, l) => suma + l.cantidad, 0);
    return Math.max(0, this.stock(productoId) - enCarrito);
  }

  get productosParaAgregar(): Producto[] {
    return this.productos.filter(p => this.stockDisponiblePara(p.id) > 0);
  }

  seleccionarProductoAgregar(id: number | null): void {
    this.productoAgregarId = id;
    const producto = this.productos.find(p => p.id === id);
    this.precioAgregar = producto
      ? (producto.precio_venta_centavos / 100).toFixed(2)
      : '';
    this.cantidadAgregar = 1;
  }

  private aCentavos(texto: string): number | null {
    if (!/^\d+(\.\d{1,2})?$/.test(texto.trim())) return null;
    const centavos = Math.round(Number(texto) * 100);
    return Number.isSafeInteger(centavos) ? centavos : null;
  }

  precioLineaCentavos(linea: LineaCarrito): number {
    return this.aCentavos(linea.precioTexto) ?? 0;
  }

  subtotalLinea(linea: LineaCarrito): number {
    const precio = this.precioLineaCentavos(linea);
    return Number.isSafeInteger(linea.cantidad) ? precio * linea.cantidad : 0;
  }

  get totalCentavos(): number {
    return this.carrito.reduce((suma, linea) => suma + this.subtotalLinea(linea), 0);
  }

  get pagoCentavos(): number {
    return this.aCentavos(this.pagoInicial) ?? 0;
  }

  saldoCliente(id: number | null): number {
    return this.saldos.find(s => s.cliente_id === id)?.saldo_centavos ?? 0;
  }

  formatoMXN(centavos: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN'
    }).format((Number(centavos) || 0) / 100);
  }

  get totalPorCobrar(): number {
    return this.saldos.reduce((suma, s) => suma + s.saldo_centavos, 0);
  }

  agregarAlCarrito(): void {
    this.error = '';
    this.mensaje = '';
    const precio = this.aCentavos(this.precioAgregar);
    if (!this.productoAgregarId ||
        !Number.isSafeInteger(this.cantidadAgregar) ||
        this.cantidadAgregar <= 0 ||
        !precio || precio <= 0) {
      this.error = 'Selecciona perfume, cantidad y precio válidos.';
      return;
    }

    const disponible = this.stockDisponiblePara(this.productoAgregarId);
    if (this.cantidadAgregar > disponible) {
      this.error = `Solo hay ${disponible} unidad(es) disponibles para agregar.`;
      return;
    }

    const producto = this.productos.find(p => p.id === this.productoAgregarId);
    if (!producto) {
      this.error = 'El perfume seleccionado ya no existe.';
      return;
    }

    const existente = this.carrito.find(l => l.productoId === producto.id);
    if (existente) {
      const nuevaCantidad = existente.cantidad + this.cantidadAgregar;
      if (nuevaCantidad > this.stock(producto.id)) {
        this.error = 'No hay suficientes existencias para esa cantidad.';
        return;
      }
      existente.cantidad = nuevaCantidad;
      existente.precioTexto = (precio / 100).toFixed(2);
    } else {
      this.carrito = [
        ...this.carrito,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          mililitros: producto.mililitros,
          cantidad: this.cantidadAgregar,
          precioTexto: (precio / 100).toFixed(2)
        }
      ];
    }

    this.productoAgregarId = null;
    this.cantidadAgregar = 1;
    this.precioAgregar = '';
  }

  actualizarCantidad(linea: LineaCarrito, valor: number | string): void {
    const cantidad = Number(valor);
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
      linea.cantidad = 1;
      return;
    }
    const maximo = this.stock(linea.productoId);
    linea.cantidad = Math.min(cantidad, maximo);
  }

  quitarDelCarrito(productoId: number): void {
    this.carrito = this.carrito.filter(l => l.productoId !== productoId);
  }

  private limpiarCarrito(): void {
    this.carrito = [];
    this.productoAgregarId = null;
    this.cantidadAgregar = 1;
    this.precioAgregar = '';
    this.pagoInicial = '0';
    this.fechaVenta = this.hoyLocal();
  }

  async guardarVenta(): Promise<void> {
    if (this.guardando || this.cargando) return;
    this.error = '';
    this.mensaje = '';

    const pago = this.aCentavos(this.pagoInicial);
    if (!this.clienteVentaId || this.carrito.length === 0 ||
        pago === null || pago < 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(this.fechaVenta)) {
      this.error = 'Selecciona cliente, agrega perfumes, revisa pago y fecha.';
      return;
    }

    const lineas = [];
    for (const linea of this.carrito) {
      const precio = this.aCentavos(linea.precioTexto);
      if (!precio || precio <= 0 ||
          !Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) {
        this.error = 'Revisa cantidad y precio de cada perfume del carrito.';
        return;
      }
      if (linea.cantidad > this.stock(linea.productoId)) {
        this.error = `Inventario insuficiente para ${linea.nombre}.`;
        return;
      }
      if (!Number.isSafeInteger(linea.cantidad * precio)) {
        this.error = 'El importe de una línea es demasiado grande.';
        return;
      }
      lineas.push({
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        precioCentavos: precio
      });
    }

    const total = lineas.reduce((s, l) => s + l.cantidad * l.precioCentavos, 0);
    if (pago > total) {
      this.error = 'El pago inicial no puede superar el total de la venta.';
      return;
    }

    this.guardando = true;
    try {
      await this.database.registrarVentaMultiple({
        clienteId: this.clienteVentaId,
        lineas,
        abonoInicialCentavos: pago,
        fecha: this.fechaVenta
      });
      await this.actualizar();
      this.limpiarCarrito();
      this.mensaje = 'Venta multiproducto guardada. Inventario y cuenta actualizados.';
    } catch (e) {
      console.error('Error al registrar venta:', e);
      this.error = e instanceof Error ? e.message : 'No se pudo guardar la venta.';
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  async guardarAbono(): Promise<void> {
    if (this.guardando || this.cargando) return;
    this.error = '';
    this.mensaje = '';
    const importe = this.aCentavos(this.importeAbono);
    if (!this.clienteAbonoId || !importe || importe <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(this.fechaAbono)) {
      this.error = 'Selecciona un cliente, fecha e importe válidos.';
      return;
    }
    if (importe > this.saldoCliente(this.clienteAbonoId)) {
      this.error = 'El abono no puede superar la deuda del cliente.';
      return;
    }

    this.guardando = true;
    try {
      await this.database.registrarAbono(
        this.clienteAbonoId, importe, this.fechaAbono
      );
      await this.actualizar();
      this.importeAbono = '';
      this.mensaje = 'Abono registrado y descontado de la cuenta global.';
    } catch (e) {
      console.error('Error al registrar abono:', e);
      this.error = e instanceof Error ? e.message : 'No se pudo guardar el abono.';
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  async verDetalleOperacion(operacionId: number): Promise<void> {
    if (this.operacionDetalleId === operacionId) {
      this.operacionDetalleId = null;
      this.detalleOperacion = null;
      return;
    }
    this.cargandoDetalle = true;
    this.error = '';
    try {
      this.detalleOperacion = await this.database.obtenerDetalleOperacion(operacionId);
      this.operacionDetalleId = operacionId;
    } catch (e) {
      console.error('Error al cargar detalle:', e);
      this.error = e instanceof Error ? e.message : 'No se pudo cargar el detalle.';
      this.operacionDetalleId = null;
      this.detalleOperacion = null;
    } finally {
      this.cargandoDetalle = false;
      this.cdr.markForCheck();
    }
  }
}
