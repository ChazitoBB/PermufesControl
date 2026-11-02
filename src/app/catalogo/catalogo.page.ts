import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton
} from '@ionic/angular';
import {
  DatabaseService, Producto, ExistenciaProducto
} from '../services/database.service';
import {
  CATEGORIAS_PRODUCTO,
  CONCENTRACIONES,
  DEFAULTS_PERFUME_ESTANDAR,
  etiquetaCategoria,
  type CategoriaProducto
} from '../services/catalogo.constants';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  templateUrl: 'catalogo.page.html',
  styleUrls: ['catalogo.page.scss'],
  imports: [
    CommonModule, FormsModule, RouterLink,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton
  ]
})
export class CatalogoPage {
  productos: Producto[] = [];
  existencias: ExistenciaProducto[] = [];

  filtroNombre = '';
  filtroCategoria: CategoriaProducto | '' = '';
  filtroMl: number | '' = '';
  filtroConcentracion = '';

  // Alta rápida
  nombre = '';
  categoria: CategoriaProducto = 'mujer';
  mililitros = DEFAULTS_PERFUME_ESTANDAR.mililitros;
  concentracion = 'EDT';
  costo = (DEFAULTS_PERFUME_ESTANDAR.costoCentavos / 100).toFixed(2);
  precio = (DEFAULTS_PERFUME_ESTANDAR.precioCentavos / 100).toFixed(2);
  piezas = DEFAULTS_PERFUME_ESTANDAR.piezasIniciales;
  fecha = this.hoy();
  mostrarAvanzado = false;
  mostrarAlta = false;

  // Resurtido
  productoResurtir: Producto | null = null;
  piezasResurtir = 1;
  costoResurtir = '';
  fechaResurtir = this.hoy();

  ocupado = false;
  error = '';
  mensaje = '';
  categorias = CATEGORIAS_PRODUCTO;
  concentraciones = CONCENTRACIONES;
  etiquetaCategoria = etiquetaCategoria;

  constructor(
    private database: DatabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async ionViewWillEnter(): Promise<void> {
    await this.recargar();
  }

  private async recargar(): Promise<void> {
    this.productos = await this.database.listarProductos();
    this.existencias = await this.database.listarExistencias();
    this.cdr.markForCheck();
  }

  unidadesDe(productoId: number): number {
    return this.existencias.find(e => e.producto_id === productoId)?.unidades ?? 0;
  }

  get filtrados(): Producto[] {
    const q = this.filtroNombre.trim().toLowerCase();
    return this.productos.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      if (this.filtroCategoria && p.categoria !== this.filtroCategoria) return false;
      if (this.filtroMl !== '' && p.mililitros !== this.filtroMl) return false;
      if (this.filtroConcentracion && p.concentracion !== this.filtroConcentracion) {
        return false;
      }
      return true;
    });
  }

  alCambiarCategoria(): void {
    if (this.categoria === 'hombre' || this.categoria === 'mujer') {
      this.mililitros = 60;
      this.costo = (DEFAULTS_PERFUME_ESTANDAR.costoCentavos / 100).toFixed(2);
      this.precio = (DEFAULTS_PERFUME_ESTANDAR.precioCentavos / 100).toFixed(2);
      this.piezas = 1;
    }
  }

  formatoMXN(centavos: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN'
    }).format((Number(centavos) || 0) / 100);
  }

  async crearPerfume(): Promise<void> {
    if (this.ocupado) return;
    this.error = '';
    this.mensaje = '';
    const costoCentavos = Math.round(Number(this.costo) * 100);
    const precioCentavos = Math.round(Number(this.precio) * 100);
    this.ocupado = true;
    try {
      await this.database.crearProductoConCompraInicial({
        nombre: this.nombre,
        mililitros: Number(this.mililitros),
        costoCentavos,
        precioCentavos,
        categoria: this.categoria,
        concentracion: this.concentracion,
        piezas: Number(this.piezas),
        fecha: this.fecha
      });
      this.mensaje = 'Perfume creado con compra inicial (operación atómica).';
      this.nombre = '';
      this.mostrarAlta = false;
      await this.recargar();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo crear.';
    } finally {
      this.ocupado = false;
      this.cdr.markForCheck();
    }
  }

  abrirResurtir(p: Producto): void {
    this.productoResurtir = p;
    this.piezasResurtir = 1;
    this.costoResurtir = (p.costo_referencia_centavos / 100).toFixed(2);
    this.fechaResurtir = this.hoy();
    this.error = '';
    this.mensaje = '';
  }

  async confirmarResurtir(): Promise<void> {
    if (!this.productoResurtir || this.ocupado) return;
    this.ocupado = true;
    this.error = '';
    try {
      await this.database.registrarCompra(
        this.productoResurtir.id,
        Number(this.piezasResurtir),
        Math.round(Number(this.costoResurtir) * 100),
        this.fechaResurtir
      );
      this.mensaje = `Compra agregada a ${this.productoResurtir.nombre} (sin duplicar producto).`;
      this.productoResurtir = null;
      await this.recargar();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo comprar.';
    } finally {
      this.ocupado = false;
      this.cdr.markForCheck();
    }
  }
}
