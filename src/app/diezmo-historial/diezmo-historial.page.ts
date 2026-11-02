import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton
} from '@ionic/angular';
import {
  DatabaseService,
  DiezmoSemanaResumen
} from '../services/database.service';

@Component({
  selector: 'app-diezmo-historial',
  standalone: true,
  templateUrl: 'diezmo-historial.page.html',
  styleUrls: ['diezmo-historial.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton
  ]
})
export class DiezmoHistorialPage {
  semanas: DiezmoSemanaResumen[] = [];
  cargando = true;
  error = '';

  constructor(
    private database: DatabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando = true;
    this.error = '';
    this.cdr.detectChanges();
    try {
      this.semanas = await this.database.listarHistorialDiezmos();
    } catch (e) {
      console.error('Error al cargar historial de diezmos:', e);
      this.semanas = [];
      this.error = 'No se pudo calcular el historial de diezmos.';
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

  formatoRango(inicio: string, fin: string): string {
    return `${this.formatoFechaCorta(inicio)} – ${this.formatoFechaCorta(fin)}`;
  }

  private formatoFechaCorta(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(fecha);
  }
}
