import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import {
  DatabaseService,
  Producto,
  Compra,
  ExistenciaProducto
} from '../services/database.service';

@Component({
  selector: 'app-tab3',
  standalone: true,
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent
  ]
})
export class Tab3Page implements OnInit {
  productos: Producto[] = [];
  compras: Compra[] = [];
  existencias: ExistenciaProducto[] = [];

  // Catálogo de perfumes
  nombre = '';
  mililitros = 60;
  costo = '';
  precio = '280';
  mostrarFormulario = false;
  guardando = false;
  cargando = true;
  error = '';
  errorCarga = '';
  mensaje = '';

  // Compra / entrada de inventario
  productoCompra: Producto | null = null;
  cantidadCompra = 1;
  costoCompra = '';
  fechaCompra = '';
  guardandoCompra = false;
  errorCompra = '';

  constructor(
    private database: DatabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.recargarCatalogoYCompras();
    } catch (error) {
      console.error('Error al cargar inventario:', error);
      this.productos = [];
      this.compras = [];
      this.existencias = [];
      this.errorCarga = 'No se pudo abrir el inventario de SQLite.';
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  async ionViewWillEnter(): Promise<void> {
    if (this.cargando) return;
    try {
      await this.recargarCatalogoYCompras();
    } catch (error) {
      console.error('Error al actualizar inventario:', error);
      this.errorCarga = 'No se pudo actualizar el inventario.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  private async recargarCatalogoYCompras(): Promise<void> {
    const productos = await this.database.listarProductos();
    const compras = await this.database.listarCompras();
    const existencias = await this.database.listarExistencias();
    this.productos = Array.isArray(productos) ? productos : [];
    this.compras = Array.isArray(compras) ? compras : [];
    this.existencias = Array.isArray(existencias) ? existencias : [];
  }

  cambiarPresentacion(valor: number): void {
    this.mililitros = Number(valor);
    this.precio = this.mililitros === 60 ? '280' : '';
  }

  abrirFormulario(): void {
    this.cancelarCompra();
    this.error = '';
    this.mensaje = '';
    this.mostrarFormulario = true;
  }

  cancelarFormulario(): void {
    this.mostrarFormulario = false;
    this.error = '';
    this.nombre = '';
    this.costo = '';
    this.mililitros = 60;
    this.precio = '280';
  }

  formatoMXN(centavos: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN'
    }).format((Number(centavos) || 0) / 100);
  }

  private importeValido(valor: string): boolean {
    return /^\d+(\.\d{1,2})?$/.test(valor.trim()) &&
      Number(valor) > 0 &&
      Number.isSafeInteger(Math.round(Number(valor) * 100));
  }

  async guardarProducto(): Promise<void> {
    if (this.guardando || this.cargando || this.errorCarga) return;

    this.error = '';
    this.mensaje = '';
    const nombreLimpio = this.nombre.trim();

    if (!nombreLimpio) {
      this.error = 'Escribe el nombre del perfume.';
      return;
    }
    if (!this.importeValido(this.costo) || !this.importeValido(this.precio)) {
      this.error = 'Costo y precio deben ser mayores que cero (máximo 2 decimales).';
      return;
    }
    if (this.productos.some(p =>
      p.nombre.toLowerCase() === nombreLimpio.toLowerCase() &&
      p.mililitros === this.mililitros
    )) {
      this.error = 'Ese perfume ya existe en el catálogo.';
      return;
    }

    this.guardando = true;
    try {
      await this.database.agregarProducto(
        nombreLimpio,
        this.mililitros,
        Math.round(Number(this.costo) * 100),
        Math.round(Number(this.precio) * 100)
      );
      await this.recargarCatalogoYCompras();
      this.cancelarFormulario();
      this.mensaje = 'Perfume guardado correctamente.';
    } catch (error) {
      console.error('Error al guardar perfume:', error);
      this.error = 'No se pudo guardar el perfume.';
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  private hoyLocal(): string {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  abrirCompra(producto: Producto): void {
    this.cancelarFormulario();
    this.productoCompra = producto;
    this.cantidadCompra = 1;
    this.costoCompra = (producto.costo_referencia_centavos / 100).toFixed(2);
    this.fechaCompra = this.hoyLocal();
    this.errorCompra = '';
    this.mensaje = '';
  }

  cancelarCompra(): void {
    this.productoCompra = null;
    this.errorCompra = '';
  }

  obtenerUnidades(productoId: number): number {
    return this.existencias.find(x => x.producto_id === productoId)?.unidades ?? 0;
  }

  get totalUnidades(): number {
    return this.existencias.reduce((suma, x) => suma + x.unidades, 0);
  }

  get inversionTotal(): number {
    return this.existencias.reduce((suma, x) => suma + x.inversion_centavos, 0);
  }

  get ingresoPotencial(): number {
    return this.existencias.reduce((suma, x) => suma + x.ingreso_potencial_centavos, 0);
  }

  get gananciaPotencial(): number {
    return this.existencias.reduce((suma, x) => suma + x.ganancia_potencial_centavos, 0);
  }

  async guardarCompra(): Promise<void> {
    if (this.guardandoCompra || this.cargando || this.errorCarga || !this.productoCompra) return;
    this.errorCompra = '';
    this.mensaje = '';

    if (!Number.isSafeInteger(this.cantidadCompra) || this.cantidadCompra <= 0) {
      this.errorCompra = 'Ingresa una cantidad entera mayor que cero.';
      return;
    }
    if (!this.importeValido(this.costoCompra)) {
      this.errorCompra = 'Ingresa un costo unitario válido (máximo 2 decimales).';
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fechaCompra)) {
      this.errorCompra = 'Selecciona una fecha válida.';
      return;
    }

    const costoCentavos = Math.round(Number(this.costoCompra) * 100);
    if (!Number.isSafeInteger(costoCentavos * this.cantidadCompra)) {
      this.errorCompra = 'El importe total es demasiado grande.';
      return;
    }

    this.guardandoCompra = true;
    try {
      await this.database.registrarCompra(
        this.productoCompra.id,
        this.cantidadCompra,
        costoCentavos,
        this.fechaCompra
      );
      await this.recargarCatalogoYCompras();
      this.cancelarCompra();
      this.mensaje = 'Compra registrada correctamente.';
    } catch (error) {
      console.error('Error al guardar compra:', error);
      this.errorCompra = 'No se pudo completar la compra. Revisa la consola.';
    } finally {
      this.guardandoCompra = false;
      this.cdr.markForCheck();
    }
  }
}
