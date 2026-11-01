import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent
} from '@ionic/angular';

import {
  DatabaseService,
  Cliente,
  SaldoCliente
} from '../services/database.service';

@Component({
  selector: 'app-tab2',
  standalone: true,
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent
  ]
})
export class Tab2Page {

  clientes: Cliente[] = [];
  saldosPorCliente = new Map<number, number>();

  nombre = '';
  telefono = '';
  busqueda = '';

  mostrarFormulario = false;
  guardando = false;
  cargando = true;

  error = '';
  errorCarga = '';

  constructor(
    private database: DatabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.cargarClientesYSaldos();
  }

  private async cargarClientesYSaldos(): Promise<void> {
    this.cargando = true;
    this.errorCarga = '';
    this.cdr.detectChanges();

    try {
      const [clientes, saldos] = await Promise.all([
        this.database.listarClientes(),
        this.database.listarSaldosClientes()
      ]);

      this.clientes = Array.isArray(clientes) ? clientes : [];
      this.saldosPorCliente = this.mapearSaldos(saldos);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      this.clientes = [];
      this.saldosPorCliente = new Map();
      this.errorCarga = 'No se pudo abrir la base de datos.';
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  private mapearSaldos(saldos: SaldoCliente[]): Map<number, number> {
    const mapa = new Map<number, number>();
    for (const saldo of saldos ?? []) {
      mapa.set(
        Number(saldo.cliente_id),
        Number(saldo.saldo_centavos) || 0
      );
    }
    return mapa;
  }

  saldoDe(clienteId: number): number {
    return this.saldosPorCliente.get(clienteId) ?? 0;
  }

  textoSaldo(clienteId: number): string {
    const saldo = this.saldoDe(clienteId);
    if (saldo > 0) {
      return `Saldo pendiente: ${this.formatoMXN(saldo)}`;
    }
    return 'Cuenta liquidada';
  }

  formatoMXN(centavos: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format((Number(centavos) || 0) / 100);
  }

  get clientesFiltrados(): Cliente[] {
    const texto = this.busqueda.trim().toLowerCase();

    return this.clientes.filter(cliente =>
      cliente.nombre.toLowerCase().includes(texto)
    );
  }

  abrirFormulario(): void {
    this.mostrarFormulario = true;
    this.error = '';
  }

  cancelarFormulario(): void {
    this.mostrarFormulario = false;
    this.nombre = '';
    this.telefono = '';
    this.error = '';
  }

  async guardarCliente(): Promise<void> {
    if (this.guardando) return;

    const nombre = this.nombre.trim();

    if (!nombre) {
      this.error = 'Ingresa el nombre del cliente.';
      return;
    }

    this.guardando = true;
    this.error = '';

    try {
      await this.database.agregarCliente(
        nombre,
        this.telefono
      );

      await this.cargarClientesYSaldos();
      this.cancelarFormulario();
    } catch (error) {
      console.error('Error al guardar cliente:', error);
      this.error = 'No se pudo guardar el cliente.';
    } finally {
      this.guardando = false;
      this.cdr.detectChanges();
    }
  }
}
