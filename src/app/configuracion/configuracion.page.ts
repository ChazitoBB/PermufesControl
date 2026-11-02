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
import { AppIdentityService } from '../services/app-identity.service';
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
  nombreArchivoSeleccionado = '';
  preview: VistaPreviaRespaldo | null = null;
  payloadValidado: RespaldoPayload | null = null;
  confirmarReemplazo = false;

  ultimoRespaldoIso: string | null = null;
  rutaPreRestore: string | null = null;

  ocupado = false;
  mensaje = '';
  error = '';
  identidadLista = false;

  constructor(
    private backup: BackupService,
    private identidad: AppIdentityService,
    private cdr: ChangeDetectorRef
  ) {}

  get restauracionAplicadaHabilitada(): boolean {
    return this.identidadLista && this.backup.restauracionAplicadaHabilitada;
  }

  get restauracionAndroidPendiente(): boolean {
    return this.identidadLista && this.backup.restauracionAndroidPendiente;
  }

  get esApkRestoreTest(): boolean {
    return this.identidadLista && this.backup.esApkRestoreTest;
  }

  get applicationIdActual(): string {
    return this.backup.applicationIdActual;
  }

  async ngOnInit(): Promise<void> {
    await this.identidad.inicializar();
    this.identidadLista = true;
    this.ultimoRespaldoIso = this.backup.obtenerFechaUltimoRespaldo();
    this.rutaPreRestore = this.backup.obtenerRutaUltimoPreRestore();
    this.cdr.detectChanges();
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

  formatoCentavos(centavos: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
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
      const destino =
        resultado.modo === 'nativo-compartir'
          ? 'Usa el menú Compartir para guardarlo en Drive, Archivos u otra app.'
          : 'Guárdalo fuera del teléfono y recuerda la contraseña.';
      this.mensaje =
        `Respaldo creado: ${resultado.nombreArchivo}. ` +
        `Clientes ${resultado.counts.clientes}, ` +
        `productos ${resultado.counts.productos}, ` +
        `ventas ${resultado.counts.ventas}, ` +
        `abonos ${resultado.counts.abonos}. ` +
        destino;
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
    this.nombreArchivoSeleccionado = file?.name ?? '';
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
        'Respaldo válido (incluye verificación en BD temporal). ' +
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
          ? 'La restauración aplicada está deshabilitada en esta compilación.'
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
      this.rutaPreRestore = resultado.copiaSeguridadRuta;
      this.passwordRestaurar = '';
      this.passwordCopiaPrevia = '';
      this.confirmarReemplazo = false;
      this.mensaje =
        `Restauración completada. ` +
        `PRE-RESTORE: ${resultado.copiaSeguridadNombre} ` +
        `(${resultado.copiaSeguridadRuta}). ` +
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

  async compartirPreRestore(): Promise<void> {
    if (this.ocupado) return;
    this.error = '';
    this.mensaje = '';
    this.ocupado = true;
    this.cdr.detectChanges();
    try {
      await this.backup.compartirUltimoPreRestore();
      this.mensaje = 'Menú Compartir abierto para la copia PRE-RESTORE.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo compartir PRE-RESTORE.';
    } finally {
      this.ocupado = false;
      this.cdr.detectChanges();
    }
  }
}
