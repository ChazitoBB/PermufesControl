import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton
} from '@ionic/angular';
import { Cliente, CodigoPremio, DatabaseService } from '../services/database.service';
import {
  PREMIOS_RULETA_DEFAULT,
  PROBABILIDAD_ESCALA,
  enteroAleatorioSeguro,
  sectoresAngularesRuleta,
  seleccionarPremioPorTicket,
  type PremioConfig
} from '../services/promociones.util';

@Component({
  selector: 'app-ruleta',
  standalone: true,
  templateUrl: 'ruleta.page.html',
  styleUrls: ['ruleta.page.scss'],
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton
  ]
})
export class RuletaPage {
  clientes: Cliente[] = [];
  codigos: CodigoPremio[] = [];
  clienteId: number | null = null;

  premios = PREMIOS_RULETA_DEFAULT;
  sectores = sectoresAngularesRuleta();
  rotacionDeg = 0;
  girando = false;
  ultimoPremio: PremioConfig | null = null;
  ultimoCodigo: CodigoPremio | null = null;
  error = '';
  mensaje = '';
  /** Evita re-giro por recarga: se guarda el id de giro en sessionStorage. */
  giroSesionId: string | null = null;

  constructor(
    private database: DatabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ionViewWillEnter(): Promise<void> {
    this.clientes = await this.database.listarClientes();
    this.codigos = await this.database.listarCodigosPremio();
    this.giroSesionId = sessionStorage.getItem('pc_ruleta_giro_sesion');
    this.cdr.markForCheck();
  }

  conicGradient(): string {
    const colores = [
      '#4caf50', '#2196f3', '#ff9800', '#9c27b0',
      '#f44336', '#00bcd4', '#795548'
    ];
    const parts: string[] = [];
    this.sectores.forEach((s, i) => {
      parts.push(`${colores[i % colores.length]} ${s.inicioDeg}deg ${s.finDeg}deg`);
    });
    return `conic-gradient(${parts.join(', ')})`;
  }

  async girar(): Promise<void> {
    if (this.girando) return;
    if (this.clienteId == null) {
      this.error = 'Selecciona un cliente de prueba.';
      return;
    }
    if (this.giroSesionId) {
      this.error =
        'Ya registraste un giro en esta sesión. Recarga no permite repetir el mismo intento; cierra la pestaña o usa otro cliente en una sesión nueva tras limpiar sessionStorage solo en pruebas.';
      return;
    }

    this.girando = true;
    this.error = '';
    this.mensaje = '';
    try {
      // Un solo ticket: anima y registra el mismo resultado (escala 10_000).
      const ticket = enteroAleatorioSeguro(PROBABILIDAD_ESCALA);
      const premio = seleccionarPremioPorTicket(ticket, this.premios);
      const sector = this.sectores.find(s => s.tipo === premio.tipo)!;
      const centro = (sector.inicioDeg + sector.finDeg) / 2;
      // Apuntar el puntero superior (0°) al centro del sector elegido.
      const vueltas = 5;
      this.rotacionDeg = vueltas * 360 + (360 - centro);

      await new Promise(r => setTimeout(r, 2800));

      const codigo = await this.database.emitirCodigoPremio({
        clienteId: this.clienteId,
        tipoPremio: premio.tipo,
        etiqueta: premio.etiqueta,
        porcentaje: premio.porcentaje
      });
      const giroId = await this.database.registrarGiroRuleta({
        clienteId: this.clienteId,
        tipoPremio: premio.tipo,
        etiqueta: premio.etiqueta,
        codigoId: codigo.id,
        ticket
      });
      this.giroSesionId = String(giroId);
      sessionStorage.setItem('pc_ruleta_giro_sesion', this.giroSesionId);
      this.ultimoPremio = premio;
      this.ultimoCodigo = codigo;
      this.codigos = await this.database.listarCodigosPremio();
      this.mensaje =
        `Premio: ${premio.etiqueta}. Código ${codigo.codigo} (sin vencimiento).`;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo girar.';
    } finally {
      this.girando = false;
      this.cdr.markForCheck();
    }
  }

  textoWhatsApp(c: CodigoPremio): string {
    return encodeURIComponent(
      `¡Felicidades ${c.cliente}! Tu premio PerfumesControl: ${c.etiqueta}. ` +
      `Código: ${c.codigo} (sin vencimiento, un solo uso).`
    );
  }

  telefonoCliente(clienteId: number): string {
    const c = this.clientes.find(x => x.id === clienteId);
    return (c?.telefono || '').replace(/\D/g, '');
  }

  async marcarSorpresa(c: CodigoPremio): Promise<void> {
    await this.database.marcarSorpresaEntregada(c.id);
    this.codigos = await this.database.listarCodigosPremio();
    this.mensaje = 'Sorpresa marcada como entregada.';
    this.cdr.markForCheck();
  }
}
