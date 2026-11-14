import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  ChangeStatusRequest,
  ClaimPipeline,
  ClaimResponse,
  ClaimStatus,
  CreateClaimRequest,
  UpdateClaimRequest,
  Uuid,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class ClaimsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/claims`;

  pipeline(): Observable<ClaimPipeline> {
    return this.http.get<ClaimPipeline>(`${this.baseUrl}/pipeline`);
  }

  list(filter: { status?: ClaimStatus; patientId?: Uuid } = {}): Observable<ClaimResponse[]> {
    let params = new HttpParams();
    if (filter.status) params = params.set('status', filter.status);
    if (filter.patientId) params = params.set('patientId', filter.patientId);
    return this.http.get<ClaimResponse[]>(this.baseUrl, { params });
  }

  get(id: Uuid): Observable<ClaimResponse> {
    return this.http.get<ClaimResponse>(`${this.baseUrl}/${id}`);
  }

  create(request: CreateClaimRequest): Observable<ClaimResponse> {
    return this.http.post<ClaimResponse>(this.baseUrl, request);
  }

  update(id: Uuid, request: UpdateClaimRequest): Observable<ClaimResponse> {
    return this.http.put<ClaimResponse>(`${this.baseUrl}/${id}`, request);
  }

  changeStatus(id: Uuid, request: ChangeStatusRequest): Observable<ClaimResponse> {
    return this.http.patch<ClaimResponse>(`${this.baseUrl}/${id}/status`, request);
  }

  delete(id: Uuid): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
