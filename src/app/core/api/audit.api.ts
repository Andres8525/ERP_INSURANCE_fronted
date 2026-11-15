import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  AiInsightResponse,
  AiStatusResponse,
  AnomalyQuery,
  AnomalyResponse,
  AuditSummaryResponse,
  PageResponse,
  ResolveBatchRequest,
  ResolveBatchResponse,
  ScanResponse,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/audit`;

  anomalies(query: AnomalyQuery = {}): Observable<PageResponse<AnomalyResponse>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params = params.set(key, String(value));
    }
    return this.http.get<PageResponse<AnomalyResponse>>(`${this.baseUrl}/anomalies`, { params });
  }

  summary(): Observable<AuditSummaryResponse> {
    return this.http.get<AuditSummaryResponse>(`${this.baseUrl}/summary`);
  }

  scan(): Observable<ScanResponse> {
    return this.http.post<ScanResponse>(`${this.baseUrl}/scan`, {});
  }

  aiStatus(): Observable<AiStatusResponse> {
    return this.http.get<AiStatusResponse>(`${this.baseUrl}/ai/status`);
  }

  aiInsights(refresh = false): Observable<AiInsightResponse> {
    const params = refresh ? new HttpParams().set('refresh', 'true') : undefined;
    return this.http.post<AiInsightResponse>(`${this.baseUrl}/ai/insights`, {}, { params });
  }

  aiExplanation(anomalyId: string): Observable<AiInsightResponse> {
    return this.http.post<AiInsightResponse>(`${this.baseUrl}/anomalies/${encodeURIComponent(anomalyId)}/ai-explanation`, {});
  }

  resolveBatch(request: ResolveBatchRequest): Observable<ResolveBatchResponse> {
    return this.http.post<ResolveBatchResponse>(`${this.baseUrl}/resolve-batch`, request);
  }
}
