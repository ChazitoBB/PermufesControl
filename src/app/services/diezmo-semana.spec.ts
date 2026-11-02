import { describe, expect, it } from 'vitest';
import {
  calcularDiezmoCentavos,
  construirHistorialDiezmos,
  diaSemanaMexico,
  limitesSemanaDomingoSabado,
  sumarDiasISO
} from './diezmo-semana';

describe('diezmo-semana', () => {
  it('ventas de $2,800 → diezmo $280', () => {
    // 2800 MXN = 280_000 centavos; 10% = 28_000
    expect(calcularDiezmoCentavos(280_000)).toBe(28_000);
  });

  it('abonos no afectan el cálculo (solo usa ventas brutas)', () => {
    const ventas = 150_000;
    const diezmoSinAbonos = calcularDiezmoCentavos(ventas);
    // Simula que hubo cobros: el diezmo sigue derivado solo de ventas.
    expect(diezmoSinAbonos).toBe(15_000);
    expect(calcularDiezmoCentavos(ventas)).toBe(diezmoSinAbonos);
  });

  it('varias líneas de una operación se suman sin duplicar', () => {
    // Tres líneas: 100 + 80 + 50 = 230 MXN = 23_000 centavos → diezmo 2_300
    const totalLineas = 10_000 + 8_000 + 5_000;
    expect(calcularDiezmoCentavos(totalLineas)).toBe(2_300);
  });

  it('sábado y domingo pertenecen a semanas distintas', () => {
    // 2026-10-31 fue sábado; 2026-11-01 domingo (America/Mexico_City)
    const sabado = limitesSemanaDomingoSabado('2026-10-31');
    const domingo = limitesSemanaDomingoSabado('2026-11-01');
    expect(diaSemanaMexico('2026-10-31')).toBe(6);
    expect(diaSemanaMexico('2026-11-01')).toBe(0);
    expect(sabado.inicio).toBe('2026-10-25');
    expect(sabado.fin).toBe('2026-10-31');
    expect(domingo.inicio).toBe('2026-11-01');
    expect(domingo.fin).toBe('2026-11-07');
    expect(sabado.inicio).not.toBe(domingo.inicio);
  });

  it('cambia de mes y de año correctamente', () => {
    // 2025-12-31 miércoles → semana 2025-12-28 .. 2026-01-03
    const cruzada = limitesSemanaDomingoSabado('2025-12-31');
    expect(cruzada.inicio).toBe('2025-12-28');
    expect(cruzada.fin).toBe('2026-01-03');
    expect(sumarDiasISO('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('semana sin ventas → diezmo $0', () => {
    expect(calcularDiezmoCentavos(0)).toBe(0);
    const historial = construirHistorialDiezmos({
      hoyISO: '2026-11-01',
      primeraVentaISO: null,
      ventasPorDia: {}
    });
    expect(historial).toHaveLength(1);
    expect(historial[0].ventas_centavos).toBe(0);
    expect(historial[0].diezmo_centavos).toBe(0);
    expect(historial[0].es_actual).toBe(true);
  });

  it('consulta una semana anterior en el historial', () => {
    const historial = construirHistorialDiezmos({
      hoyISO: '2026-11-04', // miércoles de la semana que inicia 2026-11-01
      primeraVentaISO: '2026-10-26',
      ventasPorDia: {
        '2026-10-26': 100_000, // semana anterior
        '2026-11-02': 50_000   // semana actual
      }
    });
    expect(historial.length).toBeGreaterThanOrEqual(2);
    expect(historial[0].es_actual).toBe(true);
    expect(historial[0].inicio).toBe('2026-11-01');
    expect(historial[0].ventas_centavos).toBe(50_000);
    expect(historial[0].diezmo_centavos).toBe(5_000);

    const anterior = historial.find(s => s.inicio === '2026-10-25');
    expect(anterior).toBeTruthy();
    expect(anterior!.ventas_centavos).toBe(100_000);
    expect(anterior!.diezmo_centavos).toBe(10_000);
    expect(anterior!.es_actual).toBe(false);
  });

  it('venta con fecha histórica actualiza la semana correspondiente', () => {
    const historial = construirHistorialDiezmos({
      hoyISO: '2026-11-04',
      primeraVentaISO: '2026-10-28',
      ventasPorDia: {
        // Registrada después, pero con fecha del sábado anterior
        '2026-10-31': 350_000
      }
    });
    const semanaHistorica = historial.find(s => s.inicio === '2026-10-25');
    expect(semanaHistorica).toBeTruthy();
    expect(semanaHistorica!.fin).toBe('2026-10-31');
    expect(semanaHistorica!.ventas_centavos).toBe(350_000);
    expect(semanaHistorica!.diezmo_centavos).toBe(35_000);
  });

  it('redondea correctamente a centavos', () => {
    // 15 centavos → 10% = 1.5 → 2
    expect(calcularDiezmoCentavos(15)).toBe(2);
    // 14 centavos → 1.4 → 1
    expect(calcularDiezmoCentavos(14)).toBe(1);
    // 350_000 → exactamente 35_000
    expect(calcularDiezmoCentavos(350_000)).toBe(35_000);
  });

  it('incluye semanas intermedias en cero dentro del período histórico', () => {
    const historial = construirHistorialDiezmos({
      hoyISO: '2026-11-08', // domingo nueva semana
      primeraVentaISO: '2026-10-26',
      ventasPorDia: {
        '2026-10-26': 10_000
        // semana 2026-11-01..07 sin ventas
      }
    });
    const vacia = historial.find(s => s.inicio === '2026-11-01');
    expect(vacia).toBeTruthy();
    expect(vacia!.ventas_centavos).toBe(0);
    expect(vacia!.diezmo_centavos).toBe(0);
  });
});
