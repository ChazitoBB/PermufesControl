export type CategoriaProducto = 'hombre' | 'mujer' | 'sin_clasificar';
export type ConcentracionProducto = 'EDT' | 'EDP' | 'Parfum' | 'Otro' | '';

export const CATEGORIAS_PRODUCTO: CategoriaProducto[] = [
  'hombre',
  'mujer',
  'sin_clasificar'
];

export const CONCENTRACIONES: ConcentracionProducto[] = [
  'EDT',
  'EDP',
  'Parfum',
  'Otro',
  ''
];

/** Valores predeterminados para perfumes estándar Hombre/Mujer 60 ml. */
export const DEFAULTS_PERFUME_ESTANDAR = {
  mililitros: 60 as const,
  costoCentavos: 13700,
  precioCentavos: 28000,
  piezasIniciales: 1
};

export function etiquetaCategoria(c: CategoriaProducto): string {
  switch (c) {
    case 'hombre': return 'Hombre';
    case 'mujer': return 'Mujer';
    default: return 'Sin clasificar';
  }
}
