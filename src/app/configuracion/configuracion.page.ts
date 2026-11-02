import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton
} from '@ionic/angular';
import { BackupService } from '../services/backup.service';
import type { VistaPreviaRespaldo } from '../services/backup.types';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  templateUrl: 'configuracion.page.html',
  styleUrls: ['configuracion.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton
  ]
})
export class ConfiguracionPage implements OnInit {
  passwordExportar = '';
  passwordConfirmar = '';
  passwordRestaurar = '';

  archivoSeleccionado: File | null = null;
  preview: VistaPreviaRespaldo | null = null;

  ultimoRespaldoIso: string | null = null;

  ocupado = false;
  mensaje = '';
  error = '';

  readonly restauracionAplicadaHabilitada =
    this.backup.restauracionAplicadaHabilitada;

  constructor(
    private backup: BackupService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.ultimoRespaldoIso = this.backup.obtenerFechaUltimoRespaldo();
  }

  formatoFecha(iso: string | null): string {
    if (!iso) return 'Sin respaldos registrados en este dispositivo';
    try {
      return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  async crearRespaldo(): Promise<void> {
    if (this.ocupado) return;
    this.error = '';
    this.mensaje = '';

    if (this.passwordExportar.length < 8) {
      this.error = 'La contraseña debe tener al menos 8 caracteres.';
      return;
    }
    if (this.passwordExportar !== this.passwordConfirmar) {
      this.error = 'La confirmación de contraseña no coincide.';
      return;
    }

    this.ocupado = true;
    this.cdr.detectChanges();
    try {
      const resultado = await this.backup.exportarRespaldoCifrado(
        this.passwordExportar
      );
      this.ultimoRespaldoIso = resultado.createdAt;
      this.passwordExportar = '';
      this.passwordConfirmar = '';
      this.mensaje =
        `Respaldo creado: ${resultado.nombreArchivo}. ` +
        `Clientes ${resultado.counts.clientes}, ` +
        `productos ${resultado.counts.productos}, ` +
        `ventas ${resultado.counts.ventas}, ` +
        `abonos ${resultado.counts.abonos}. ` +
        'Guárdalo fuera del teléfono y recuerda la contraseña.';
    } catch (e) {
      console.error('Error al crear respaldo:', e);
      this.error = e instanceof Error ? e.message : 'No se pudo crear el respaldo.';
    } finally {
      this.ocupado = false;
      this.cdr.detectChanges();
    }
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.archivoSeleccionado = file;
    this.preview = null;
    this.error = '';
    this.mensaje = '';
  }

  async validarRespaldo(): Promise<void> {
    if (this.ocupado) return;
    this.error = '';
    this.mensaje = '';
    this.preview = null;

    if (!this.archivoSeleccionado) {
      this.error = 'Selecciona un archivo .pcbak primero.';
      return;
    }
    if (!this.passwordRestaurar) {
      this.error = 'Ingresa la contraseña del respaldo.';
      return;
    }

    this.ocupado = true;
    this.cdr.detectChanges();
    try {
      const { preview } = await this.backup.abrirYValidarRespaldo(
        this.archivoSeleccionado,
        this.passwordRestaurar
      );
      this.preview = preview;
      this.mensaje =
        'Respaldo válido. Vista previa lista. ' +
        'La restauración que reemplaza datos aún no está habilitada.';
    } catch (e) {
      console.error('Error al validar respaldo:', e);
      this.preview = null;
      this.error = e instanceof Error ? e.message : 'No se pudo validar el respaldo.';
    } finally {
      this.ocupado = false;
      this.cdr.detectChanges();
    }
  }

  async intentarRestaurar(): Promise<void> {
    this.error =
      'La restauración aplicada está deshabilitada para proteger tus datos. ' +
      'Puedes exportar y validar respaldos; la importación segura llegará en una fase posterior.';
    this.mensaje = '';
  }
}
