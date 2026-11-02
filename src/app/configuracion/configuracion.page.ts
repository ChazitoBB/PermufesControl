import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar
} from '@ionic/angular';
import { BackupService } from '../services/backup.service';
import type { RespaldoPayload, VistaPreviaRespaldo } from '../services/backup.types';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  templateUrl: 'configuracion.page.html',
  styleUrls: ['configuracion.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar
  ]
})
export class ConfiguracionPage implements OnInit {
  passwordExportar = '';
  passwordConfirmar = '';
  passwordRestaurar = '';
  passwordCopiaPrevia = '';

  archivoSeleccionado: File | null = null;
  preview: VistaPreviaRespaldo | null = null;
  payloadValidado: RespaldoPayload | null = null;
  confirmarReemplazo = false;

  ultimoRespaldoIso: string | null = null;

  ocupado = false;
  mensaje = '';
  error = '';

  readonly restauracionAplicadaHabilitada =
    this.backup.restauracionAplicadaHabilitada;
  readonly restauracionAndroidPendiente =
    this.backup.restauracionAndroidPendiente;

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
    this.payloadValidado = null;
    this.confirmarReemplazo = false;
    this.error = '';
    this.mensaje = '';
  }

  async validarRespaldo(): Promise<void> {
    if (this.ocupado) return;
    this.error = '';
    this.mensaje = '';
    this.preview = null;
    this.payloadValidado = null;
    this.confirmarReemplazo = false;

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
      const { payload, preview } = await this.backup.abrirYValidarRespaldo(
        this.archivoSeleccionado,
        this.passwordRestaurar
      );
      this.preview = preview;
      this.payloadValidado = payload;
      this.mensaje =
        'Respaldo válido. Revisa la vista previa. ' +
        (this.restauracionAplicadaHabilitada
          ? 'Puedes restaurar tras confirmar el reemplazo.'
          : 'La restauración aplicada sigue deshabilitada en esta plataforma.');
    } catch (e) {
      console.error('Error al validar respaldo:', e);
      this.preview = null;
      this.payloadValidado = null;
      this.error = e instanceof Error ? e.message : 'No se pudo validar el respaldo.';
    } finally {
      this.ocupado = false;
      this.cdr.detectChanges();
    }
  }

  async intentarRestaurar(): Promise<void> {
    if (this.ocupado) return;
    this.error = '';
    this.mensaje = '';

    if (!this.restauracionAplicadaHabilitada) {
      this.error =
        this.restauracionAndroidPendiente
          ? 'Restauración deshabilitada en Android hasta verificación nativa. Usa Chrome/web para pruebas.'
          : 'La restauración aplicada está deshabilitada en esta plataforma.';
      return;
    }
    if (!this.payloadValidado) {
      this.error = 'Primero valida el respaldo para obtener la vista previa.';
      return;
    }
    if (!this.confirmarReemplazo) {
      this.error = 'Marca la casilla de confirmación para reemplazar los datos actuales.';
      return;
    }
    if (this.passwordCopiaPrevia.length < 8) {
      this.error =
        'Ingresa una contraseña (≥8) para la copia PRE-RESTORE del estado actual.';
      return;
    }

    this.ocupado = true;
    this.cdr.detectChanges();
    try {
      const resultado = await this.backup.aplicarRestauracion(
        this.payloadValidado,
        this.passwordCopiaPrevia
      );
      this.ultimoRespaldoIso = this.backup.obtenerFechaUltimoRespaldo();
      this.passwordRestaurar = '';
      this.passwordCopiaPrevia = '';
      this.confirmarReemplazo = false;
      this.mensaje =
        `Restauración completada. ` +
        `Copia de seguridad previa: ${resultado.copiaSeguridadNombre}. ` +
        `Clientes ${resultado.counts.clientes}, ventas ${resultado.counts.ventas}, ` +
        `abonos ${resultado.counts.abonos}. ` +
        'Recarga Inicio para ver saldos, inventario y diezmo.';
    } catch (e) {
      console.error('Error al restaurar:', e);
      this.error =
        (e instanceof Error ? e.message : 'No se pudo restaurar.') +
        ' Los datos anteriores debieron conservarse por rollback.';
    } finally {
      this.ocupado = false;
      this.cdr.detectChanges();
    }
  }
}
