
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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
  Cliente
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
export class Tab2Page implements OnInit {

  clientes: Cliente[] = [];

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
  ) { }



  async ngOnInit(): Promise<void> {
    try {
      this.clientes = await this.database.listarClientes();

      console.log(
        'Clientes recuperados de SQLite:',
        this.clientes
      );

    } catch (error) {
      console.error('Error al cargar clientes:', error);

      this.errorCarga =
        'No se pudo abrir la base de datos.';

    } finally {
      this.cargando = false;

      // Notificar a Angular que los datos cambiaron
      this.cdr.markForCheck();
    }
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

      this.clientes = await this.database.listarClientes();

      this.cancelarFormulario();

    } catch (error) {
      console.error('Error al guardar cliente:', error);
      this.error = 'No se pudo guardar el cliente.';

    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }

  }
}
