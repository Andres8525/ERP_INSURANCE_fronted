import { Component, Input } from '@angular/core';
import { CloudArchiveCandidate } from './cloud-archive.data';

@Component({
  selector: 'app-cloud-archive',
  standalone: true,
  templateUrl: './cloud-archive.component.html',
})
export class CloudArchiveComponent {
  @Input({ required: true }) archiveCandidates: CloudArchiveCandidate[] = [];
}
