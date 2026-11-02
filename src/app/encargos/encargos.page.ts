import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar
} from '@ionic/angular';
import {
  Cliente, DatabaseService, Encargo, EstadoEncargo, Producto
} from '../services/database.service';
import { CONCENTRACIONES, DEFAULTS_PERFUME_ESTANDAR } from '../services/catalogo.constants';

@Component({
  selector: 'app-encargos',
  standalone: true,
  templateUrl: 'encargos.page.html',
  styleUrls: ['encargos.page.scss'],
  imports: [
    CommonModule, FormsModule, RouterLink,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonIcon
  ]
})
export class EncargosPage {
  encargos: Encargo[] = [];
  clientes: Cliente[] = [];
  productos: Producto[] = [];

  clienteId: number | null = null;
  nombrePerfume = '';
  mililitros = 60;
  concentracion = 'EDT';
  cantidad = 1;
  fecha = this.hoy();
  notas = '';

  concentraciones = CONCENTRACIONES;
  ocupado = false;
  listo = false;
  error = '';
  mensaje = '';

  constructor(
    private database: DatabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async ionViewWillEnter(): Promise<void> {
    this.clientes = await this.database.listarClientes();
    this.productos = await this.database.listarProductos();
    this.encargos = await this.database.listarEncargos();
    this.listo = true;
    this.cdr.markForCheck();
  }

  get pendientes(): Encargo[] {
    return this.encargos.filter(e =>
      e.estado === 'pendiente' || e.estado === 'pedido' || e.estado === 'conseguido'
    );
  }

  get listaResurtir(): Array<{ nombre: string; mililitros: number; piezas: number }> {
    const mapa = new Map<string, { nombre: string; mililitros: number; piezas: number }>();
    for (const e of this.pendientes) {
      if (e.estado === 'cancelado' || e.estado === 'entregado') continue;
      const clave = `${e.nombre_perfume}|${e.mililitros}|${e.concentracion}`;
      const prev = mapa.get(clave);
      if (prev) prev.piezas += e.cantidad;
      else {
        mapa.set(clave, {
          nombre: `${e.nombre_perfume} (${e.concentracion || '—'})`,
          mililitros: e.mililitros,
          piezas: e.cantidad
        });
      }
    }
    return [...mapa.values()];
  }

  async crear(): Promise<void> {
    if (this.ocupado || this.clienteId == null) return;
    this.ocupado = true;
    this.error = '';
    try {
      await this.database.crearEncargo({
        clienteId: this.clienteId,
        nombrePerfume: this.nombrePerfume,
        mililitros: this.mililitros,
        concentracion: this.concentracion,
        cantidad: this.cantidad,
        fechaSolicitud: this.fecha,
        notas: this.notas
      });
      this.mensaje = 'Encargo registrado (no afecta inventario ni deuda).';
      this.nombrePerfume = '';
      this.notas = '';
      this.encargos = await this.database.listarEncargos();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Error al crear encargo.';
    } finally {
      this.ocupado = false;
      this.cdr.markForCheck();
    }
  }

  async cambiarEstado(e: Encargo, estado: EstadoEncargo): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      await this.database.actualizarEstadoEncargo(e.id, estado);
      this.encargos = await this.database.listarEncargos();
      this.mensaje = `Estado → ${estado}`;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'No se pudo actualizar.';
    } finally {
      this.ocupado = false;
      this.cdr.markForCheck();
    }
  }

  async marcarConseguidoConCompra(e: Encargo): Promise<void> {
    if (this.ocupado) return;
    const producto = this.productos.find(
      p => p.nombre.toLowerCase() === e.nombre_perfume.toLowerCase()
        && p.mililitros === e.mililitros
    );
    if (!producto) {
      this.error =
        'Crea o elige primero el perfume en Catálogo para vincular la compra.';
      return;
    }
    this.ocupado = true;
    this.error = '';
    try {
      await this.database.registrarCompraDesdeEncargo(
        e.id,
        producto.id,
        producto.costo_referencia_centavos || DEFAULTS_PERFUME_ESTANDAR.costoCentavos,
        this.hoy()
      );
      this.mensaje = 'Compra registrada desde encargo (sin duplicar si ya existía).';
      this.encargos = await this.database.listarEncargos();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'No se pudo comprar.';
    } finally {
      this.ocupado = false;
      this.cdr.markForCheck();
    }
  }
}
