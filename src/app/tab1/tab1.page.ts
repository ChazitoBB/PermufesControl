import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent
} from '@ionic/angular';
import {
  DatabaseService,
  ResumenInicio
} from '../services/database.service';

@Component({
  selector: 'app-tab1',
  standalone: true,
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent
  ],
})
export class Tab1Page {
  resumen: ResumenInicio | null = null;
  cargando = true;
  error = '';

  constructor(
    private database: DatabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.cargarResumen();
  }

  private async cargarResumen(): Promise<void> {
    this.cargando = true;
    this.error = '';
    this.cdr.detectChanges();

    try {
      this.resumen = await this.database.obtenerResumenInicio();
    } catch (error) {
      console.error('Error al cargar resumen de inicio:', error);
      this.resumen = null;
      this.error = 'No se pudieron cargar los indicadores desde SQLite.';
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  formatoMXN(centavos: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format((Number(centavos) || 0) / 100);
  }

  textoInventario(unidades: number): string {
    const n = Number(unidades) || 0;
    return n === 1 ? '1 perfume' : `${n} perfumes`;
  }
}
