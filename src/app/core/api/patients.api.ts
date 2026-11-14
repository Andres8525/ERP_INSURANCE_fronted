import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  AccountStatus,
  CreatePatientRequest,
  CreatePolicyRequest,
  PageResponse,
  PatientResponse,
  PolicyResponse,
  UpdatePatientRequest,
  UpdatePolicyRequest,
  Uuid,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class PatientsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/patients`;

  list(page = 0, size = 100, accountStatus?: AccountStatus): Observable<PageResponse<PatientResponse>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (accountStatus) params = params.set('accountStatus', accountStatus);
    return this.http.get<PageResponse<PatientResponse>>(this.baseUrl, { params });
  }

  get(id: Uuid): Observable<PatientResponse> {
    return this.http.get<PatientResponse>(`${this.baseUrl}/${id}`);
  }

  create(request: CreatePatientRequest): Observable<PatientResponse> {
    return this.http.post<PatientResponse>(this.baseUrl, request);
  }

  update(id: Uuid, request: UpdatePatientRequest): Observable<PatientResponse> {
    return this.http.put<PatientResponse>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: Uuid): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  policies(patientId: Uuid): Observable<PolicyResponse[]> {
    return this.http.get<PolicyResponse[]>(`${this.baseUrl}/${patientId}/policies`);
  }

  createPolicy(patientId: Uuid, request: CreatePolicyRequest): Observable<PolicyResponse> {
    return this.http.post<PolicyResponse>(`${this.baseUrl}/${patientId}/policies`, request);
  }

  updatePolicy(patientId: Uuid, policyId: Uuid, request: UpdatePolicyRequest): Observable<PolicyResponse> {
    return this.http.put<PolicyResponse>(`${this.baseUrl}/${patientId}/policies/${policyId}`, request);
  }

  deletePolicy(patientId: Uuid, policyId: Uuid): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${patientId}/policies/${policyId}`);
  }
}
