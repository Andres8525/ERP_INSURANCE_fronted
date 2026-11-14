import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { ClientSummary, Uuid } from './api.models';

@Injectable({ providedIn: 'root' })
export class ClientsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/clients`;

  list(query = ''): Observable<ClientSummary[]> {
    const q = query.trim();
    const params = q ? new HttpParams().set('q', q) : undefined;
    return this.http.get<ClientSummary[]>(this.baseUrl, { params });
  }

  get(id: Uuid): Observable<ClientSummary> {
    return this.http.get<ClientSummary>(`${this.baseUrl}/${id}`);
  }

  pdf(id: Uuid): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/pdf`, { responseType: 'blob' });
  }
}
