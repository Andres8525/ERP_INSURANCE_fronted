import { Component } from '@angular/core';
import { LabPollingPanelComponent } from './lab-polling-panel.component';
import { VitalsStreamPanelComponent } from './vitals-stream-panel.component';

export interface ProtocolCard {
  name: string;
  transport: string;
  direction: string;
  useCase: string;
  tradeOff: string;
}

export const PROTOCOLS: ProtocolCard[] = [
  {
    name: 'Short polling',
    transport: 'HTTP/1.1 petición-respuesta',
    direction: 'Cliente → servidor cada 3 s',
    useCase: 'Resultados de laboratorio y RIPS',
    tradeOff: 'Simple y cacheable, pero gasta peticiones (304) y añade hasta 3 s de retraso.',
  },
  {
    name: 'SSE',
    transport: 'HTTP persistente text/event-stream',
    direction: 'Servidor → cliente',
    useCase: 'Signos vitales de UCI y avisos de farmacia',
    tradeOff: 'Reconexión y Last-Event-ID nativos; no sirve para enviar datos del cliente.',
  },
  {
    name: 'WebSocket',
    transport: 'TCP persistente full-duplex',
    direction: 'Bidireccional',
    useCase: 'Telemedicina, historia clínica colaborativa, interconsultas y Código Azul',
    tradeOff: 'Latencia mínima con estado por conexión; exige heartbeat, fan-out y backplane para escalar.',
  },
];

@Component({
  selector: 'app-realtime-page',
  imports: [LabPollingPanelComponent, VitalsStreamPanelComponent],
  templateUrl: './realtime-page.component.html',
})
export class RealtimePageComponent {
  readonly protocols = PROTOCOLS;
}
