import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideAlertTriangle, LucideChevronLeft, LucideChevronRight, LucideFileSearch,
  LucideFilter, LucidePlus, LucideRotateCcw, LucideSearch, LucideSlidersHorizontal,
} from '@lucide/angular';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { PatientApiService } from '../../data-access/patient-api.service';
import { PageResponse, PatientSex, PatientSummary } from '../../models/patient.models';

@Component({
  selector: 'app-patient-list',
  imports: [RouterLink, DatePipe, LucideAlertTriangle, LucideChevronLeft, LucideChevronRight,
    LucideFileSearch, LucideFilter, LucidePlus, LucideRotateCcw, LucideSearch,
    LucideSlidersHorizontal],
  templateUrl: './patient-list.html',
  styleUrl: './patient-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientList implements OnInit {
  private readonly api = inject(PatientApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);
  readonly result = signal<PageResponse<PatientSummary> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly filtersOpen = signal(false);
  readonly query = signal('');
  readonly active = signal<'all' | 'true' | 'false'>('true');
  readonly sex = signal<PatientSex | ''>('');
  readonly minAge = signal<number | undefined>(undefined);
  readonly maxAge = signal<number | undefined>(undefined);
  readonly page = signal(0);
  readonly canWrite = signal(this.auth.hasPermission('PACIENTE_ESCRIBIR'));
  private searchTimer?: ReturnType<typeof setTimeout>;
  private loadRequestId = 0;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
    const q = this.route.snapshot.queryParamMap.get('q') ?? '';
    this.query.set(q);
    this.load();
  }

  updateSearch(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(0); this.load(); }, 300);
  }

  applyFilters(active: string, sex: string, minAge: string, maxAge: string): void {
    this.active.set(active as 'all' | 'true' | 'false');
    this.sex.set(sex as PatientSex | '');
    this.minAge.set(minAge ? Number(minAge) : undefined);
    this.maxAge.set(maxAge ? Number(maxAge) : undefined);
    this.page.set(0); this.load();
  }

  reset(): void {
    this.query.set(''); this.active.set('true'); this.sex.set('');
    this.minAge.set(undefined); this.maxAge.set(undefined); this.page.set(0); this.load();
  }

  goTo(page: number): void {
    const total = this.result()?.totalPages ?? 1;
    if (page < 0 || page >= total || page === this.page()) return;
    this.page.set(page); this.load();
  }

  load(): void {
    const requestId = ++this.loadRequestId;
    this.loading.set(true); this.error.set('');
    this.api.search({
      q: this.query().trim() || undefined,
      active: this.active() === 'all' ? undefined : this.active() === 'true',
      sex: this.sex(), minAge: this.minAge(), maxAge: this.maxAge(),
      page: this.page(), size: 20, sort: 'fullName', direction: 'asc',
    }).pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (requestId !== this.loadRequestId) return;
        this.result.set(response);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (requestId !== this.loadRequestId) return;
        this.error.set(this.errors.toUserMessage(
          error,
          'No pudimos cargar los pacientes. Intenta nuevamente.',
        ));
        this.loading.set(false);
      },
    });
  }

  initials(name: string): string { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
}
