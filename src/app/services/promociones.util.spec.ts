import { describe, expect, it } from 'vitest';
import {
  PREMIOS_RULETA_DEFAULT,
  PROBABILIDAD_ESCALA,
  aplicarPremioALineas,
  assertTotalesConsistentes,
  codigoPuedeCanjearse,
  contarUnidades,
  probabilidadAPuntos,
  sectoresAngularesRuleta,
  seleccionarPremioPorTicket,
  seleccionarPremioPonderado,
  subtotalLineas,
  sumarPuntosProbabilidad,
  sumarProbabilidades,
  validarProbabilidades
} from './promociones.util';

const U280 = 28000;

describe('promociones.util — probabilidades experimentales', () => {
  it('distribución definitiva suma 100% (10_000 puntos)', () => {
    expect(sumarProbabilidades(PREMIOS_RULETA_DEFAULT)).toBeCloseTo(100, 10);
    expect(sumarPuntosProbabilidad(PREMIOS_RULETA_DEFAULT)).toBe(PROBABILIDAD_ESCALA);
    expect(() => validarProbabilidades(PREMIOS_RULETA_DEFAULT)).not.toThrow();
    expect(probabilidadAPuntos(0.25)).toBe(25);
    expect(probabilidadAPuntos(1.5)).toBe(150);
    expect(probabilidadAPuntos(72)).toBe(7200);
  });

  it('sectores angulares proporcionales (no iguales)', () => {
    const sectores = sectoresAngularesRuleta();
    expect(sectores[0]!.inicioDeg).toBe(0);
    expect(sectores.at(-1)!.finDeg).toBeCloseTo(360, 5);
    const desc5 = sectores.find(s => s.tipo === 'desc_5')!;
    const raro = sectores.find(s => s.tipo === 'desc_50')!;
    expect(desc5.finDeg - desc5.inicioDeg).toBeCloseTo(72 * 3.6, 5);
    expect(raro.finDeg - raro.inicioDeg).toBeCloseTo(0.25 * 3.6, 5);
    expect(desc5.finDeg - desc5.inicioDeg).toBeGreaterThan(
      raro.finDeg - raro.inicioDeg
    );
  });

  it('F: selección determinista por ticket y límites de rango', () => {
    // Primer premio (5%): tickets 0..7199
    expect(seleccionarPremioPorTicket(0).tipo).toBe('desc_5');
    expect(seleccionarPremioPorTicket(7199).tipo).toBe('desc_5');
    // 10%: 7200..9099
    expect(seleccionarPremioPorTicket(7200).tipo).toBe('desc_10');
    expect(seleccionarPremioPorTicket(9099).tipo).toBe('desc_10');
    // 15%: 9100..9599
    expect(seleccionarPremioPorTicket(9100).tipo).toBe('desc_15');
    // 20%: 9600..9799
    expect(seleccionarPremioPorTicket(9600).tipo).toBe('desc_20');
    // 50%: 9800..9824
    expect(seleccionarPremioPorTicket(9800).tipo).toBe('desc_50');
    expect(seleccionarPremioPorTicket(9824).tipo).toBe('desc_50');
    // 3x2: 9825..9849
    expect(seleccionarPremioPorTicket(9825).tipo).toBe('promo_3x2');
    expect(seleccionarPremioPorTicket(9849).tipo).toBe('promo_3x2');
    // sorpresa: 9850..9999
    expect(seleccionarPremioPorTicket(9850).tipo).toBe('sorpresa');
    expect(seleccionarPremioPorTicket(9999).tipo).toBe('sorpresa');

    expect(() => seleccionarPremioPorTicket(-1)).toThrow(/Ticket/);
    expect(() => seleccionarPremioPorTicket(PROBABILIDAD_ESCALA)).toThrow(/Ticket/);
  });

  it('selección aleatoria solo produce tipos conocidos', () => {
    const tipos = new Set(PREMIOS_RULETA_DEFAULT.map(p => p.tipo));
    for (let i = 0; i < 50; i++) {
      expect(tipos.has(seleccionarPremioPonderado().tipo)).toBe(true);
    }
  });
});

describe('promociones.util — contabilidad A/B/C', () => {
  it('A: 3×$280 con 3x2 → total $560, 3 unidades inventario', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 3, precioUnitarioCentavos: U280 }],
      'promo_3x2',
      null
    );
    expect(r.subtotalCentavos).toBe(84000);
    expect(r.descuentoCentavos).toBe(28000);
    expect(r.totalCentavos).toBe(56000);
    expect(r.unidadesInventario).toBe(3);
    expect(contarUnidades(r.lineasAjustadas)).toBe(3);
    assertTotalesConsistentes(r);
    // FIFO: costos unitarios históricos no se alteran en este util (solo precios venta).
    expect(r.lineasAjustadas.every(l => l.productoId === 1)).toBe(true);
  });

  it('B: 2×$280 con 50% → descuento $140, total $420', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 2, precioUnitarioCentavos: U280 }],
      'desc_50',
      50
    );
    expect(r.descuentoCentavos).toBe(14000);
    expect(r.totalCentavos).toBe(42000);
    expect(r.unidadesInventario).toBe(2);
    assertTotalesConsistentes(r);
  });

  it('C: 3×$280 con 20% → descuento $56, total $784', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 3, precioUnitarioCentavos: U280 }],
      'desc_20',
      20
    );
    expect(r.descuentoCentavos).toBe(5600);
    expect(r.totalCentavos).toBe(78400);
    expect(r.unidadesInventario).toBe(3);
    assertTotalesConsistentes(r);
  });

  it('% aplica a una sola unidad (10 piezas)', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 10, precioUnitarioCentavos: U280 }],
      'desc_20',
      20
    );
    expect(r.descuentoCentavos).toBe(5600);
    expect(r.totalCentavos).toBe(280000 - 5600);
  });

  it('50% exige ≥2 unidades; 3x2 exige ≥3 de 60 ml', () => {
    expect(() =>
      aplicarPremioALineas(
        [{ productoId: 1, mililitros: 60, cantidad: 1, precioUnitarioCentavos: U280 }],
        'desc_50',
        50
      )
    ).toThrow(/2 unidades/);
    expect(() =>
      aplicarPremioALineas(
        [{ productoId: 1, mililitros: 120, cantidad: 5, precioUnitarioCentavos: 40000 }],
        'promo_3x2',
        null
      )
    ).toThrow(/3 unidades/);
  });

  it('3x2 bonifica solo la más barata y no se repite', () => {
    const r = aplicarPremioALineas(
      [
        { productoId: 1, mililitros: 60, cantidad: 2, precioUnitarioCentavos: U280 },
        { productoId: 2, mililitros: 60, cantidad: 2, precioUnitarioCentavos: 20000 }
      ],
      'promo_3x2',
      null
    );
    expect(r.descuentoCentavos).toBe(20000);
    expect(r.totalCentavos).toBe(U280 * 2 + 20000);
    expect(r.unidadesInventario).toBe(4);
  });

  it('no resta el descuento dos veces (líneas = total neto)', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 3, precioUnitarioCentavos: U280 }],
      'desc_20',
      20
    );
    expect(subtotalLineas(r.lineasAjustadas)).toBe(r.totalCentavos);
    expect(r.subtotalCentavos - r.descuentoCentavos).toBe(r.totalCentavos);
    // Si se restara otra vez sobre líneas ya netas, fallaría:
    expect(r.totalCentavos - r.descuentoCentavos).not.toBe(r.totalCentavos);
  });
});

describe('promociones.util — cupones D/E', () => {
  it('D: fallo de existencias no consume código (simulación de TX)', () => {
    let estadoCodigo = 'disponible';
    const inventario = 1;
    const lineas = [
      { productoId: 1, mililitros: 60, cantidad: 3, precioUnitarioCentavos: U280 }
    ];
    try {
      const aplicado = aplicarPremioALineas(lineas, 'promo_3x2', null);
      expect(aplicado.unidadesInventario).toBe(3);
      if (aplicado.unidadesInventario > inventario) {
        throw new Error('No hay suficientes existencias.');
      }
      // Canje (solo si la venta completa OK):
      if (!codigoPuedeCanjearse(estadoCodigo)) {
        throw new Error('código no disponible');
      }
      estadoCodigo = 'utilizado';
    } catch (e) {
      expect((e as Error).message).toMatch(/existencias/);
      // Rollback: el código permanece disponible
    }
    expect(estadoCodigo).toBe('disponible');
    expect(codigoPuedeCanjearse(estadoCodigo)).toBe(true);
  });

  it('E: mismo código dos veces → un solo canje exitoso', () => {
    let estado = 'disponible';
    let canjes = 0;
    const intentarCanje = () => {
      if (!codigoPuedeCanjearse(estado)) {
        throw new Error('El código ya fue utilizado o anulado.');
      }
      // UPDATE ... WHERE estado='disponible' → un solo éxito
      estado = 'utilizado';
      canjes += 1;
    };
    expect(() => intentarCanje()).not.toThrow();
    expect(() => intentarCanje()).toThrow(/utilizado|anulado/);
    expect(canjes).toBe(1);
    expect(codigoPuedeCanjearse('utilizado')).toBe(false);
    expect(codigoPuedeCanjearse('anulado')).toBe(false);
  });

  it('sorpresa no altera totales ni se auto-descuenta', () => {
    const r = aplicarPremioALineas(
      [{ productoId: 1, mililitros: 60, cantidad: 2, precioUnitarioCentavos: U280 }],
      'sorpresa',
      null
    );
    expect(r.descuentoCentavos).toBe(0);
    expect(r.totalCentavos).toBe(56000);
  });
});
