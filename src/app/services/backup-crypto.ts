/**
 * Cifrado offline con Web Crypto:
 * PBKDF2-SHA-256 + AES-GCM-256.
 * La contraseña nunca se persiste; solo se usa en memoria.
 */

export const BACKUP_MAGIC = 'PERFUMESCONTROL_BACKUP';
export const BACKUP_PAYLOAD_MAGIC = 'PERFUMESCONTROL_BACKUP_PAYLOAD';
/** v2: incluye encargos y tablas de promociones; v1 sigue siendo restaurable. */
export const BACKUP_FORMAT_VERSION = 2;
export const BACKUP_APP_ID = 'PerfumesControl';

const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface RespaldoCifradoArchivo {
  magic: typeof BACKUP_MAGIC;
  formatVersion: number;
  app: typeof BACKUP_APP_ID;
  createdAt: string;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
  };
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) {
    binario += String.fromCharCode(b);
  }
  return btoa(binario);
}

function base64ToBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

function encoder(): TextEncoder {
  return new TextEncoder();
}

function decoder(): TextDecoder {
  return new TextDecoder();
}

async function derivarClave(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function cifrarRespaldo(
  payloadJson: string,
  password: string,
  createdAt = new Date().toISOString()
): Promise<RespaldoCifradoArchivo> {
  if (!password || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto no está disponible en este entorno.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const clave = await derivarClave(password, salt, PBKDF2_ITERATIONS);
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    clave,
    encoder().encode(payloadJson)
  );

  return {
    magic: BACKUP_MAGIC,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    createdAt,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt)
    },
    cipher: {
      name: 'AES-GCM',
      iv: bytesToBase64(iv)
    },
    ciphertext: bytesToBase64(new Uint8Array(cifrado))
  };
}

export function esArchivoRespaldoCifrado(valor: unknown): valor is RespaldoCifradoArchivo {
  if (!valor || typeof valor !== 'object') return false;
  const archivo = valor as RespaldoCifradoArchivo;
  return (
    archivo.magic === BACKUP_MAGIC &&
    archivo.app === BACKUP_APP_ID &&
    typeof archivo.formatVersion === 'number' &&
    archivo.formatVersion >= 1 &&
    typeof archivo.createdAt === 'string' &&
    archivo.kdf?.name === 'PBKDF2' &&
    archivo.kdf?.hash === 'SHA-256' &&
    typeof archivo.kdf?.iterations === 'number' &&
    typeof archivo.kdf?.salt === 'string' &&
    archivo.cipher?.name === 'AES-GCM' &&
    typeof archivo.cipher?.iv === 'string' &&
    typeof archivo.ciphertext === 'string'
  );
}

export async function descifrarRespaldo(
  archivo: RespaldoCifradoArchivo,
  password: string
): Promise<string> {
  if (!password) {
    throw new Error('Ingresa la contraseña del respaldo.');
  }
  if (!esArchivoRespaldoCifrado(archivo)) {
    throw new Error('El archivo no es un respaldo válido de PerfumesControl.');
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto no está disponible en este entorno.');
  }

  try {
    const salt = base64ToBytes(archivo.kdf.salt);
    const iv = base64ToBytes(archivo.cipher.iv);
    const datos = base64ToBytes(archivo.ciphertext);
    const clave = await derivarClave(password, salt, archivo.kdf.iterations);
    const plano = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      clave,
      datos.buffer as ArrayBuffer
    );
    return decoder().decode(plano);
  } catch {
    throw new Error(
      'No se pudo descifrar el respaldo. Contraseña incorrecta o archivo alterado.'
    );
  }
}
