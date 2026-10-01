import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { Router, RouterLink } from '@angular/router';
import {
  LucideAlertTriangle,
  LucideArrowLeft,
  LucideCalendarCheck,
  LucideCheck,
  LucideClock3,
  LucideLoaderCircle,
  LucideMail,
  LucideMessageSquare,
  LucidePhone,
  LucideRefreshCw,
  LucideTrash2,
  LucideUserCheck,
} from '@lucide/angular';
import { BookingRequestApiService } from '../../data-access/booking-request-api.service';
import { BookingRequest, BookingRequestStatus } from '../../models/booking-request.models';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
@Component({
  selector: 'app-booking-requests',
  imports: [
    RouterLink,
    DatePipe,
    LucideAlertTriangle,
    LucideArrowLeft,
    LucideCalendarCheck,
    LucideCheck,
    LucideClock3,
    LucideLoaderCircle,
    LucideMail,
    LucideMessageSquare,
    LucidePhone,
    LucideRefreshCw,
    LucideTrash2,
    LucideUserCheck,
  ],
  templateUrl: './booking-requests.html',
  styleUrl: './booking-requests.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingRequests implements OnInit {
  private readonly api = inject(BookingRequestApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);
  private loadRequestId = 0;
  readonly items = signal<BookingRequest[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly filter = signal<BookingRequestStatus | ''>('');
  readonly error = signal('');
  readonly success = signal('');
  ngOnInit() {
    this.load();
  }
  load() {
    const requestId = ++this.loadRequestId;
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.filter() || undefined)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        if (requestId !== this.loadRequestId) return;
        this.items.set(r);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (requestId !== this.loadRequestId) return;
        this.loading.set(false);
        this.error.set(this.errors.toUserMessage(
          error,
          'No se pudieron cargar las solicitudes web.',
        ));
      },
    });
  }
  setFilter(v: string) {
    this.filter.set(v as BookingRequestStatus | '');
    this.load();
  }
  manage(item: BookingRequest, status: BookingRequestStatus) {
    if (this.saving()) return;
    let observation: string | undefined;
    if (status === 'CONTACTADO') {
      const response = prompt('Observación del contacto:');
      if (response === null) return;
      observation = response.trim() || undefined;
    }
    if (status === 'DESCARTADO') {
      observation = prompt('Motivo para descartar:')?.trim();
      if (!observation) return;
    }
    this.saving.set(true);
    this.api.manage(item.id, status, item.version, observation)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set('Solicitud actualizada.');
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errors.toUserMessage(error, 'No se pudo actualizar la solicitud.'));
      },
    });
  }
  schedule(item: BookingRequest): void {
    void this.router.navigate(['/sistema/agenda'], {
      queryParams: { solicitud: item.id },
    });
  }
  label(v: string) {
    return v.replaceAll('_', ' ').toLowerCase();
  }
}
