import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { DatabaseService } from './database.service';
import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  BACKUP_PAYLOAD_MAGIC,
  cifrarRespaldo,
  descifrarRespaldo,
  esArchivoRespaldoCifrado,
  type RespaldoCifradoArchivo
} from './backup-crypto';
import {
  TABLAS_RESPALDO,
  type ConteosRespaldo,
  type RespaldoPayload,
  type VistaPreviaRespaldo
} from './backup.types';

const CLAVE_ULTIMO_RESPALDO = 'perfumescontrol_ultimo_respaldo_iso';

@Injectable({ providedIn: 'root' })
export class BackupService {
  /**
   * Restauración segura habilitada en web (transacción + BD temporal).
   * En Android permanece deshabilitada hasta prueba nativa explícita.
   */
  get restauracionAplicadaHabilitada(): boolean {
    return Capacitor.getPlatform() === 'web';
  }

  get restauracionAndroidPendiente(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  constructor(private database: DatabaseService) {}

  obtenerFechaUltimoRespaldo(): string | null {
    try {
      const valor = localStorage.getItem(CLAVE_ULTIMO_RESPALDO);
      if (!valor || Number.isNaN(Date.parse(valor))) {
        return null;
      }
      return valor;
    } catch {
      return null;
    }
  }

  private registrarUltimoRespaldo(iso: string): void {
    try {
      localStorage.setItem(CLAVE_ULTIMO_RESPALDO, iso);
    } catch {
      // localStorage puede fallar en modos restringidos; no bloquear la exportación.
    }
  }

  async crearPayloadRespaldo(): Promise<RespaldoPayload> {
    const tables = await this.database.exportarTablasRespaldo();
    for (const nombre of TABLAS_RESPALDO) {
      if (!Array.isArray(tables[nombre])) {
        throw new Error(`Falta la tabla requerida en el respaldo: ${nombre}`);
      }
    }

    const counts = this.contarTablas(tables as RespaldoPayload['tables']);
    const createdAt = new Date().toISOString();

    const payload: RespaldoPayload = {
      magic: BACKUP_PAYLOAD_MAGIC,
      formatVersion: BACKUP_FORMAT_VERSION,
      app: BACKUP_APP_ID,
      createdAt,
      databaseName: 'perfumescontrol',
      tables: tables as RespaldoPayload['tables'],
      counts
    };

    this.validarPayload(payload);
    return payload;
  }

  private contarTablas(tables: RespaldoPayload['tables']): ConteosRespaldo {
    return {
      clientes: tables.clientes.length,
      productos: tables.productos.length,
      compras: tables.compras.length,
      abonos: tables.abonos.length,
      operaciones_venta: tables.operaciones_venta.length,
      ventas: tables.ventas.length,
      venta_consumos: tables.venta_consumos.length
    };
  }

  validarPayload(payload: RespaldoPayload): void {
    if (
      payload.magic !== BACKUP_PAYLOAD_MAGIC ||
      payload.app !== BACKUP_APP_ID ||
      payload.formatVersion !== BACKUP_FORMAT_VERSION ||
      payload.databaseName !== 'perfumescontrol'
    ) {
      throw new Error('El contenido del respaldo no corresponde a PerfumesControl.');
    }

    for (const nombre of TABLAS_RESPALDO) {
      if (!Array.isArray(payload.tables[nombre])) {
        throw new Error(`El respaldo no incluye la tabla ${nombre}.`);
      }
    }

    const idsClientes = new Set(payload.tables.clientes.map(f => Number(f['id'])));
    const idsProductos = new Set(payload.tables.productos.map(f => Number(f['id'])));
    const idsCompras = new Set(payload.tables.compras.map(f => Number(f['id'])));
    const idsVentas = new Set(payload.tables.ventas.map(f => Number(f['id'])));
    const idsAbonos = new Set(payload.tables.abonos.map(f => Number(f['id'])));
    const idsOperaciones = new Set(
      payload.tables.operaciones_venta.map(f => Number(f['id']))
    );

    for (const compra of payload.tables.compras) {
      if (!idsProductos.has(Number(compra['producto_id']))) {
        throw new Error('Respaldo inconsistente: compra sin producto.');
      }
    }
    for (const venta of payload.tables.ventas) {
      if (!idsClientes.has(Number(venta['cliente_id'])) ||
          !idsProductos.has(Number(venta['producto_id']))) {
        throw new Error('Respaldo inconsistente: venta sin cliente o producto.');
      }
      const operacionId = venta['operacion_id'];
      if (operacionId != null && !idsOperaciones.has(Number(operacionId))) {
        throw new Error('Respaldo inconsistente: venta sin operación.');
      }
    }
    for (const consumo of payload.tables.venta_consumos) {
      if (!idsVentas.has(Number(consumo['venta_id'])) ||
          !idsCompras.has(Number(consumo['compra_id']))) {
        throw new Error('Respaldo inconsistente: consumo FIFO inválido.');
      }
    }
    for (const abono of payload.tables.abonos) {
      if (!idsClientes.has(Number(abono['cliente_id']))) {
        throw new Error('Respaldo inconsistente: abono sin cliente.');
      }
    }
    for (const operacion of payload.tables.operaciones_venta) {
      if (!idsClientes.has(Number(operacion['cliente_id']))) {
        throw new Error('Respaldo inconsistente: operación sin cliente.');
      }
      const abonoId = operacion['abono_id'];
      if (abonoId != null && !idsAbonos.has(Number(abonoId))) {
        throw new Error('Respaldo inconsistente: operación con abono inexistente.');
      }
    }
  }

  async crearArchivoCifrado(password: string): Promise<{
    archivo: RespaldoCifradoArchivo;
    payload: RespaldoPayload;
    nombreArchivo: string;
  }> {
    const payload = await this.crearPayloadRespaldo();
    const archivo = await cifrarRespaldo(
      JSON.stringify(payload),
      password,
      payload.createdAt
    );
    const fecha = payload.createdAt.slice(0, 10);
    const nombreArchivo = `PerfumesControl-respaldo-${fecha}.pcbak`;
    return { archivo, payload, nombreArchivo };
  }

  async guardarArchivoRespaldo(
    archivo: RespaldoCifradoArchivo,
    nombreArchivo: string
  ): Promise<void> {
    const texto = JSON.stringify(archivo, null, 2);
    const blob = new Blob([texto], { type: 'application/json' });

    const picker = (window as Window & {
      showSaveFilePicker?: (options?: unknown) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }).showSaveFilePicker;

    if (typeof picker === 'function') {
      try {
        const handle = await picker({
          suggestedName: nombreArchivo,
          types: [{
            description: 'Respaldo PerfumesControl',
            accept: { 'application/json': ['.pcbak', '.json'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        this.registrarUltimoRespaldo(archivo.createdAt);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Exportación cancelada.');
        }
      }
    }

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.rel = 'noopener';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    this.registrarUltimoRespaldo(archivo.createdAt);

    if (Capacitor.getPlatform() === 'android') {
      console.info(
        'Respaldo generado en Android vía descarga webview; ' +
        'pendiente validar almacenamiento nativo.'
      );
    }
  }

  async exportarRespaldoCifrado(password: string): Promise<{
    nombreArchivo: string;
    counts: ConteosRespaldo;
    createdAt: string;
  }> {
    const { archivo, payload, nombreArchivo } =
      await this.crearArchivoCifrado(password);
    await this.guardarArchivoRespaldo(archivo, nombreArchivo);
    return {
      nombreArchivo,
      counts: payload.counts,
      createdAt: payload.createdAt
    };
  }

  async leerArchivoComoTexto(file: File): Promise<string> {
    return file.text();
  }

  parsearArchivoCifrado(texto: string): RespaldoCifradoArchivo {
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new Error('El archivo no es JSON válido o está dañado.');
    }
    if (!esArchivoRespaldoCifrado(json)) {
      throw new Error(
        'Formato incompatible: no es un respaldo cifrado de PerfumesControl.'
      );
    }
    if (json.formatVersion > BACKUP_FORMAT_VERSION) {
      throw new Error(
        'Este respaldo requiere una versión más reciente de PerfumesControl.'
      );
    }
    return json;
  }

  async abrirYValidarRespaldo(
    file: File,
    password: string
  ): Promise<{ payload: RespaldoPayload; preview: VistaPreviaRespaldo }> {
    const texto = await this.leerArchivoComoTexto(file);
    const cifrado = this.parsearArchivoCifrado(texto);
    const plano = await descifrarRespaldo(cifrado, password);

    let payload: RespaldoPayload;
    try {
      payload = JSON.parse(plano) as RespaldoPayload;
    } catch {
      throw new Error('El contenido descifrado está dañado.');
    }

    this.validarPayload(payload);

    const advertencias: string[] = [];
    if (payload.counts.ventas > 0 && payload.counts.venta_consumos === 0) {
      advertencias.push(
        'Hay ventas sin consumos FIFO; revisa el origen del respaldo.'
      );
    }

    const preview: VistaPreviaRespaldo = {
      createdAt: payload.createdAt,
      formatVersion: payload.formatVersion,
      counts: payload.counts,
      valido: true,
      advertencias
    };

    return { payload, preview };
  }

  /**
   * Flujo seguro:
   * 1) Verifica el payload en BD temporal (sin tocar la viva).
   * 2) Exporta estado actual cifrado (copia PRE-RESTORE recuperable).
   * 3) Aplica en la viva dentro de una transacción con rollback.
   */
  async aplicarRestauracion(
    payload: RespaldoPayload,
    passwordCopiaSeguridad: string
  ): Promise<{
    counts: ConteosRespaldo;
    copiaSeguridadNombre: string;
  }> {
    if (!this.restauracionAplicadaHabilitada) {
      throw new Error(
        'La restauración aplicada está deshabilitada en esta plataforma. ' +
        'En Android falta verificación nativa antes de habilitarla.'
      );
    }
    if (passwordCopiaSeguridad.length < 8) {
      throw new Error(
        'Define una contraseña (mín. 8) para la copia de seguridad previa a restaurar.'
      );
    }

    this.validarPayload(payload);

    // Fallar antes de tocar la viva ni generar PRE-RESTORE innecesario.
    await this.database.verificarRespaldoEnBaseTemporal(payload);

    const { archivo, nombreArchivo } = await this.crearArchivoCifrado(
      passwordCopiaSeguridad
    );
    await this.guardarArchivoRespaldo(archivo, `PRE-RESTORE-${nombreArchivo}`);

    await this.database.restaurarDesdePayload(payload);

    return {
      counts: payload.counts,
      copiaSeguridadNombre: `PRE-RESTORE-${nombreArchivo}`
    };
  }
}
