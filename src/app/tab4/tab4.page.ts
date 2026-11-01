import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import {
  DatabaseService, Cliente, Producto, ExistenciaProducto,
  Venta, Abono, SaldoCliente
} from '../services/database.service';

type Vista = 'venta' | 'abono' | 'historial';

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
  ventas: Venta[] = [];
  abonos: Abono[] = [];
  saldos: SaldoCliente[] = [];

  clienteVentaId: number | null = null;
  productoVentaId: number | null = null;
  cantidadVenta = 1;
  precioVenta = '';
  pagoInicial = '0';
  fechaVenta = this.hoyLocal();

  clienteAbonoId: number | null = null;
  importeAbono = '';
  fechaAbono = this.hoyLocal();

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
    this.ventas = await this.database.listarVentas();
    this.abonos = await this.database.listarAbonos();
    this.saldos = await this.database.listarSaldosClientes();
  }

  cambiarVista(vista: Vista): void {
    this.vista = vista;
    this.error = '';
    this.mensaje = '';
  }

  get disponibles(): Producto[] {
    return this.productos.filter(p => this.stock(p.id) > 0);
  }

  stock(id: number): number {
    return this.existencias.find(x => x.producto_id === id)?.unidades ?? 0;
  }

  seleccionarProducto(id: number | null): void {
    this.productoVentaId = id;
    const producto = this.productos.find(p => p.id === id);
    this.precioVenta = producto
      ? (producto.precio_venta_centavos / 100).toFixed(2) : '';
    this.cantidadVenta = 1;
  }

  get productoElegido(): Producto | undefined {
    return this.productos.find(p => p.id === this.productoVentaId);
  }

  private aCentavos(texto: string): number | null {
    if (!/^\d+(\.\d{1,2})?$/.test(texto.trim())) return null;
    const centavos = Math.round(Number(texto) * 100);
    return Number.isSafeInteger(centavos) ? centavos : null;
  }

  get totalCentavos(): number {
    const precio = this.aCentavos(this.precioVenta) ?? 0;
    return Number.isSafeInteger(this.cantidadVenta)
      ? precio * this.cantidadVenta : 0;
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

  async guardarVenta(): Promise<void> {
    if (this.guardando || this.cargando) return;
    this.error = '';
    this.mensaje = '';
    const precio = this.aCentavos(this.precioVenta);
    const pago = this.aCentavos(this.pagoInicial);
    if (!this.clienteVentaId || !this.productoVentaId ||
        !Number.isSafeInteger(this.cantidadVenta) || this.cantidadVenta <= 0 ||
        !precio || pago === null || pago < 0 ||
        !Number.isSafeInteger(this.cantidadVenta * precio) ||
        pago > this.cantidadVenta * precio ||
        !/^\d{4}-\d{2}-\d{2}$/.test(this.fechaVenta)) {
      this.error = 'Revisa cliente, perfume, cantidad, precio, pago y fecha.';
      return;
    }
    if (this.cantidadVenta > this.stock(this.productoVentaId)) {
      this.error = 'No hay suficientes perfumes en inventario.';
      return;
    }

    this.guardando = true;
    try {
      await this.database.registrarVenta({
        clienteId: this.clienteVentaId,
        productoId: this.productoVentaId,
        cantidad: this.cantidadVenta,
        precioCentavos: precio,
        abonoInicialCentavos: pago,
        fecha: this.fechaVenta
      });
      await this.actualizar();
      this.productoVentaId = null;
      this.cantidadVenta = 1;
      this.precioVenta = '';
      this.pagoInicial = '0';
      this.mensaje = 'Venta guardada. Inventario y cuenta actualizados.';
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
}
