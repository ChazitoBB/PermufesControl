import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  APP_ID_RESTORE_TEST,
  AppIdentityService
} from './app-identity.service';
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
  normalizarPayloadRespaldo,
  type ConteosRespaldo,
  type RespaldoPayload,
  type VistaPreviaRespaldo
} from './backup.types';
import {
  calcularMetricasDesdePayload,
  contarTablasDesdePayload,
  rutaPreRestorePersistente
} from './backup-restore.util';

const CLAVE_ULTIMO_RESPALDO = 'perfumescontrol_ultimo_respaldo_iso';
const CLAVE_ULTIMO_PRE_RESTORE = 'perfumescontrol_ultimo_pre_restore';

@Injectable({ providedIn: 'root' })
export class BackupService {
  constructor(
    private database: DatabaseService,
    private identidad: AppIdentityService
  ) {}

  /**
   * Web, APK de distribución y variante restoretest.
   * La aplicación sigue exigiendo vista previa, base temporal,
   * copia PRE-RESTORE verificada y una sola transacción.
   */
  get restauracionAplicadaHabilitada(): boolean {
    if (Capacitor.getPlatform() === 'web') {
      return true;
    }
    return this.identidad.esProduccionAndroid || this.identidad.esRestoreTest;
  }

  get restauracionAndroidPendiente(): boolean {
    return (
      Capacitor.getPlatform() === 'android' &&
      !this.identidad.esProduccionAndroid &&
      !this.identidad.esRestoreTest
    );
  }

  get esApkRestoreTest(): boolean {
    return this.identidad.esRestoreTest;
  }

  get applicationIdActual(): string {
    return this.identidad.id;
  }

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

  obtenerRutaUltimoPreRestore(): string | null {
    try {
      return localStorage.getItem(CLAVE_ULTIMO_PRE_RESTORE);
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

  private registrarUltimoPreRestore(ruta: string): void {
    try {
      localStorage.setItem(CLAVE_ULTIMO_PRE_RESTORE, ruta);
    } catch {
      // no bloquear
    }
  }

  async crearPayloadRespaldo(): Promise<RespaldoPayload> {
    const tables = await this.database.exportarTablasRespaldo();
    for (const nombre of TABLAS_RESPALDO) {
      if (!Array.isArray(tables[nombre])) {
        throw new Error(`Falta la tabla requerida en el respaldo: ${nombre}`);
      }
    }

    const tablesNorm = tables as RespaldoPayload['tables'];
    const counts = contarTablasDesdePayload(tablesNorm);
    const createdAt = new Date().toISOString();

    const payload: RespaldoPayload = {
      magic: BACKUP_PAYLOAD_MAGIC,
      formatVersion: BACKUP_FORMAT_VERSION,
      app: BACKUP_APP_ID,
      createdAt,
      databaseName: 'perfumescontrol',
      tables: tablesNorm,
      counts
    };

    this.validarPayload(payload);
    return payload;
  }

  validarPayload(payloadIn: RespaldoPayload): void {
    if (
      payloadIn.magic !== BACKUP_PAYLOAD_MAGIC ||
      payloadIn.app !== BACKUP_APP_ID ||
      payloadIn.databaseName !== 'perfumescontrol'
    ) {
      throw new Error('El contenido del respaldo no corresponde a PerfumesControl.');
    }
    if (
      payloadIn.formatVersion < 1 ||
      payloadIn.formatVersion > BACKUP_FORMAT_VERSION
    ) {
      throw new Error('Versión de respaldo incompatible.');
    }

    const payload = normalizarPayloadRespaldo(payloadIn);
    Object.assign(payloadIn, payload);

    for (const nombre of TABLAS_RESPALDO) {
      if (!Array.isArray(payload.tables[nombre])) {
        throw new Error(`El respaldo no incluye la tabla ${nombre}.`);
      }
      if (payload.counts[nombre] !== payload.tables[nombre].length) {
        throw new Error(
          `Conteos inconsistentes en ${nombre}: counts vs filas.`
        );
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
    const idsCodigos = new Set(
      payload.tables.promocion_codigos.map(f => Number(f['id']))
    );

    const idOpcional = (valor: unknown): number | null => {
      if (valor == null || valor === '') {
        return null;
      }
      const n = Number(valor);
      return Number.isFinite(n) ? n : -1;
    };

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
      const abonoId = idOpcional(operacion['abono_id']);
      if (abonoId != null && !idsAbonos.has(abonoId)) {
        throw new Error('Respaldo inconsistente: operación con abono inexistente.');
      }
      const codigoId = idOpcional(operacion['promocion_codigo_id']);
      if (codigoId != null && !idsCodigos.has(codigoId)) {
        throw new Error('Respaldo inconsistente: operación con código promocional inexistente.');
      }
    }
    for (const encargo of payload.tables.encargos) {
      if (!idsClientes.has(Number(encargo['cliente_id']))) {
        throw new Error('Respaldo inconsistente: encargo sin cliente.');
      }
      const productoId = idOpcional(encargo['producto_id']);
      const compraId = idOpcional(encargo['compra_id']);
      const operacionId = idOpcional(encargo['operacion_venta_id']);
      if (productoId != null && !idsProductos.has(productoId)) {
        throw new Error('Respaldo inconsistente: encargo con producto inexistente.');
      }
      if (compraId != null && !idsCompras.has(compraId)) {
        throw new Error('Respaldo inconsistente: encargo con compra inexistente.');
      }
      if (operacionId != null && !idsOperaciones.has(operacionId)) {
        throw new Error('Respaldo inconsistente: encargo con operación inexistente.');
      }
    }
    for (const codigo of payload.tables.promocion_codigos) {
      if (!idsClientes.has(Number(codigo['cliente_id']))) {
        throw new Error('Respaldo inconsistente: código promocional sin cliente.');
      }
      const operacionId = idOpcional(codigo['operacion_venta_id']);
      if (operacionId != null && !idsOperaciones.has(operacionId)) {
        throw new Error('Respaldo inconsistente: código promocional sin operación.');
      }
    }
    for (const canje of payload.tables.promocion_canjes) {
      if (!idsCodigos.has(Number(canje['codigo_id'])) ||
          !idsOperaciones.has(Number(canje['operacion_venta_id']))) {
        throw new Error('Respaldo inconsistente: canje sin código u operación.');
      }
    }
    for (const giro of payload.tables.ruleta_giros) {
      const clienteId = idOpcional(giro['cliente_id']);
      const codigoId = idOpcional(giro['codigo_id']);
      if (clienteId != null && !idsClientes.has(clienteId)) {
        throw new Error('Respaldo inconsistente: giro de ruleta sin cliente.');
      }
      if (codigoId != null && !idsCodigos.has(codigoId)) {
        throw new Error('Respaldo inconsistente: giro de ruleta sin código.');
      }
    }

    const metricas = calcularMetricasDesdePayload(payload.tables);
    if (metricas.inventario_unidades < 0) {
      throw new Error(
        'Respaldo inconsistente: inventario negativo (consumos FIFO > compras).'
      );
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

  /**
   * En Android/iOS: escribe en caché y abre el menú nativo Compartir.
   * En web: File System Access API o descarga del navegador.
   */
  async guardarArchivoRespaldo(
    archivo: RespaldoCifradoArchivo,
    nombreArchivo: string
  ): Promise<{ modo: 'nativo-compartir' | 'web-guardar' }> {
    const texto = JSON.stringify(archivo, null, 2);

    if (Capacitor.isNativePlatform()) {
      await this.compartirRespaldoNativo(texto, nombreArchivo);
      this.registrarUltimoRespaldo(archivo.createdAt);
      return { modo: 'nativo-compartir' };
    }

    await this.guardarRespaldoWeb(texto, nombreArchivo);
    this.registrarUltimoRespaldo(archivo.createdAt);
    return { modo: 'web-guardar' };
  }

  private async compartirRespaldoNativo(
    texto: string,
    nombreArchivo: string
  ): Promise<void> {
    const rutaCache = `respaldos/${nombreArchivo}`;
    await Filesystem.writeFile({
      path: rutaCache,
      data: texto,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true
    });

    const { uri } = await Filesystem.getUri({
      path: rutaCache,
      directory: Directory.Cache
    });

    const puedeCompartir = await Share.canShare();
    if (!puedeCompartir.value) {
      throw new Error(
        'Este dispositivo no permite compartir archivos. ' +
        'El respaldo quedó en la caché de la app.'
      );
    }

    await Share.share({
      title: 'Respaldo PerfumesControl',
      text: nombreArchivo,
      files: [uri],
      dialogTitle: 'Guardar o enviar respaldo'
    });
  }

  private async guardarRespaldoWeb(
    texto: string,
    nombreArchivo: string
  ): Promise<void> {
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
  }

  /**
   * Guarda PRE-RESTORE en almacenamiento persistente de la app (Directory.Data),
   * verifica lectura y formato. No depende del menú Compartir.
   */
  async guardarCopiaPreRestoreVerificada(
    archivo: RespaldoCifradoArchivo,
    nombreArchivo: string
  ): Promise<{ ruta: string; nombreArchivo: string }> {
    const nombre = nombreArchivo.startsWith('PRE-RESTORE-')
      ? nombreArchivo
      : `PRE-RESTORE-${nombreArchivo}`;
    const texto = JSON.stringify(archivo, null, 2);

    if (Capacitor.isNativePlatform()) {
      const ruta = rutaPreRestorePersistente(nombre);
      await Filesystem.writeFile({
        path: ruta,
        data: texto,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true
      });

      const leido = await Filesystem.readFile({
        path: ruta,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
      const contenido =
        typeof leido.data === 'string'
          ? leido.data
          : new TextDecoder().decode(leido.data as unknown as ArrayBuffer);

      if (!contenido || contenido.length < 32) {
        throw new Error(
          'La copia PRE-RESTORE no se pudo verificar (archivo vacío).'
        );
      }

      const parseado = this.parsearArchivoCifrado(contenido);
      if (parseado.ciphertext !== archivo.ciphertext) {
        throw new Error(
          'La copia PRE-RESTORE no coincide con el respaldo generado.'
        );
      }
      if (parseado.createdAt !== archivo.createdAt) {
        throw new Error(
          'La copia PRE-RESTORE tiene metadatos incorrectos.'
        );
      }

      this.registrarUltimoPreRestore(ruta);
      this.registrarUltimoRespaldo(archivo.createdAt);
      return { ruta, nombreArchivo: nombre };
    }

    await this.guardarRespaldoWeb(texto, nombre);
    this.registrarUltimoPreRestore(nombre);
    this.registrarUltimoRespaldo(archivo.createdAt);
    return { ruta: nombre, nombreArchivo: nombre };
  }

  /** Reexporta la última copia PRE-RESTORE vía Compartir (Android). */
  async compartirUltimoPreRestore(): Promise<void> {
    const ruta = this.obtenerRutaUltimoPreRestore();
    if (!ruta) {
      throw new Error('No hay copia PRE-RESTORE registrada en este dispositivo.');
    }
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Compartir PRE-RESTORE solo aplica en Android/iOS.');
    }

    const leido = await Filesystem.readFile({
      path: ruta,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
    const contenido =
      typeof leido.data === 'string'
        ? leido.data
        : new TextDecoder().decode(leido.data as unknown as ArrayBuffer);
    this.parsearArchivoCifrado(contenido);

    const nombre = ruta.split('/').pop() || 'PRE-RESTORE.pcbak';
    await this.compartirRespaldoNativo(contenido, nombre);
  }

  async exportarRespaldoCifrado(password: string): Promise<{
    nombreArchivo: string;
    counts: ConteosRespaldo;
    createdAt: string;
    modo: 'nativo-compartir' | 'web-guardar';
  }> {
    const { archivo, payload, nombreArchivo } =
      await this.crearArchivoCifrado(password);
    const { modo } = await this.guardarArchivoRespaldo(archivo, nombreArchivo);
    return {
      nombreArchivo,
      counts: payload.counts,
      createdAt: payload.createdAt,
      modo
    };
  }

  /**
   * Lee texto de un File (SAF / input file / Drive content:// vía WebView).
   * Si falla File.text(), intenta lectura nativa por content URI.
   */
  async leerArchivoComoTexto(file: File): Promise<string> {
    try {
      const texto = await file.text();
      if (texto && texto.trim().length > 0) {
        return texto;
      }
    } catch {
      // Continuar con rutas nativas.
    }

    const anyFile = file as File & { path?: string };
    const candidatos = [anyFile.path].filter(
      (v): v is string => typeof v === 'string' && v.length > 0
    );

    if (Capacitor.isNativePlatform()) {
      for (const candidato of candidatos) {
        try {
          const leido = await Filesystem.readFile({
            path: candidato,
            encoding: Encoding.UTF8
          });
          const data =
            typeof leido.data === 'string'
              ? leido.data
              : new TextDecoder().decode(leido.data as unknown as ArrayBuffer);
          if (data?.trim()) {
            return data;
          }
        } catch {
          // probar siguiente
        }
      }
    }

    throw new Error(
      'No se pudo leer el archivo seleccionado. ' +
      'Elige un .pcbak desde Descargas, Archivos o Drive (SAF).'
    );
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
    await this.database.verificarRespaldoEnBaseTemporal(payload);

    const advertencias: string[] = [];
    if (payload.counts.ventas > 0 && payload.counts.venta_consumos === 0) {
      advertencias.push(
        'Hay ventas sin consumos FIFO; revisa el origen del respaldo.'
      );
    }
    if (payload.formatVersion < BACKUP_FORMAT_VERSION) {
      advertencias.push(
        'Respaldo v1: se completarán vacías las tablas de encargos, códigos y ruleta.'
      );
    }
    if (this.identidad.esRestoreTest) {
      advertencias.push(
        `APK de prueba (${APP_ID_RESTORE_TEST}): restauración habilitada solo para datos ficticios.`
      );
    }

    const metricas = calcularMetricasDesdePayload(payload.tables);
    const preview: VistaPreviaRespaldo = {
      createdAt: payload.createdAt,
      formatVersion: payload.formatVersion,
      counts: payload.counts,
      valido: true,
      advertencias,
      metricas
    };

    return { payload, preview };
  }

  /**
   * Flujo seguro:
   * 1) Valida y verifica en BD temporal (sin tocar la viva).
   * 2) Guarda PRE-RESTORE persistente y lo verifica.
   * 3) Aplica en la viva dentro de una transacción con rollback.
   */
  async aplicarRestauracion(
    payload: RespaldoPayload,
    passwordCopiaSeguridad: string
  ): Promise<{
    counts: ConteosRespaldo;
    copiaSeguridadNombre: string;
    copiaSeguridadRuta: string;
  }> {
    if (!this.restauracionAplicadaHabilitada) {
      throw new Error(
        'La restauración aplicada está deshabilitada en esta aplicación.'
      );
    }
    if (passwordCopiaSeguridad.length < 8) {
      throw new Error(
        'Define una contraseña (mín. 8) para la copia de seguridad previa a restaurar.'
      );
    }

    this.validarPayload(payload);
    await this.database.verificarRespaldoEnBaseTemporal(payload);

    const { archivo, nombreArchivo } = await this.crearArchivoCifrado(
      passwordCopiaSeguridad
    );
    const pre = await this.guardarCopiaPreRestoreVerificada(
      archivo,
      `PRE-RESTORE-${nombreArchivo}`
    );

    if (Capacitor.isNativePlatform()) {
      try {
        await this.compartirUltimoPreRestore();
      } catch {
        // La copia ya está verificada en Directory.Data.
      }
    }

    await this.database.restaurarDesdePayload(payload);

    return {
      counts: payload.counts,
      copiaSeguridadNombre: pre.nombreArchivo,
      copiaSeguridadRuta: pre.ruta
    };
  }
}
