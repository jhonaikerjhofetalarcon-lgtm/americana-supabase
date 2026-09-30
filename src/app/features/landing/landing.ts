import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAlertTriangle,
  LucideArrowRight,
  LucideCalendarCheck,
  LucideCheck,
  LucideLoaderCircle,
  LucideMapPin,
  LucidePhone,
  LucideShieldCheck,
  LucideSparkles,
  LucideStethoscope,
} from '@lucide/angular';
import { finalize } from 'rxjs';
import { SupabaseErrorService } from '../../core/supabase/supabase-error.service';
import { BookingRequestApiService } from '../appointments/data-access/booking-request-api.service';

@Component({
  selector: 'app-landing',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    LucideAlertTriangle,
    LucideArrowRight,
    LucideCalendarCheck,
    LucideCheck,
    LucideLoaderCircle,
    LucideMapPin,
    LucidePhone,
    LucideShieldCheck,
    LucideSparkles,
    LucideStethoscope,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(BookingRequestApiService);
  private readonly errors = inject(SupabaseErrorService);

  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly error = signal('');
  readonly requestId = signal<number | null>(null);
  readonly today = this.localDateKey(new Date());
  readonly currentYear = new Date().getFullYear();
  readonly whatsappFollowUpLink = computed(() => {
    const id = this.requestId();
    const message = id
      ? `Hola, envié la solicitud de cita #${id} desde la página web. ¿Podrían ayudarme?`
      : 'Hola, quisiera solicitar una cita en Dental Americana.';
    return `https://wa.me/51940577075?text=${encodeURIComponent(message)}`;
  });
  readonly services = [
    { title: 'Profilaxis y prevención', description: 'Limpieza profesional y orientación para cuidar tu salud bucal.', value: 'Profilaxis y prevención', category: 'Prevención' },
    { title: 'Restauraciones', description: 'Evaluación de piezas dañadas para recuperar su función y apariencia.', value: 'Restauración', category: 'Restauración' },
    { title: 'Endodoncia', description: 'Tratamiento indicado después de una evaluación para conservar la pieza.', value: 'Endodoncia', category: 'Conservación' },
    { title: 'Prótesis y coronas', description: 'Opciones personalizadas para recuperar comodidad y función.', value: 'Prótesis o corona', category: 'Rehabilitación' },
    { title: 'Blanqueamiento', description: 'Alternativas estéticas con evaluación y supervisión profesional.', value: 'Blanqueamiento', category: 'Estética' },
    { title: 'Extracciones', description: 'Atención y orientación cuando una pieza requiere extracción.', value: 'Extracción', category: 'Cirugía' },
  ] as const;
  readonly booking = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    documentNumber: ['', [Validators.maxLength(20), Validators.pattern(/^[a-zA-Z0-9-]*$/)]],
    mobile: ['', [Validators.required, Validators.pattern(/^\+?[\d\s()-]{9,20}$/)]],
    email: ['', [Validators.email, Validators.maxLength(150)]],
    service: ['Evaluación general', [Validators.required, Validators.maxLength(120)]],
    preferredDate: [''],
    preferredShift: ['INDIFERENTE', Validators.required],
    message: ['', Validators.maxLength(800)],
    privacyConsent: [false, Validators.requiredTrue],
  });

  selectService(service: string): void {
    this.sent.set(false);
    this.requestId.set(null);
    this.booking.controls.service.setValue(service);
  }

  submit(): void {
    if (this.sending()) return;
    this.error.set('');
    if (this.booking.invalid) {
      this.booking.markAllAsTouched();
      this.error.set('Revisa los datos marcados y acepta el contacto para enviar la solicitud.');
      return;
    }

    const value = this.booking.getRawValue();
    this.sending.set(true);
    this.api.publicCreate({
      fullName: value.fullName.trim(),
      documentNumber: value.documentNumber.trim() || null,
      mobile: value.mobile.trim(),
      email: value.email.trim() || null,
      service: value.service.trim(),
      preferredDate: value.preferredDate || null,
      preferredShift: value.preferredShift,
      message: value.message.trim() || null,
      privacyConsent: value.privacyConsent,
    }).pipe(finalize(() => this.sending.set(false))).subscribe({
      next: (request) => {
        this.requestId.set(request.id);
        this.sent.set(true);
        this.booking.reset({
          service: 'Evaluación general',
          preferredShift: 'INDIFERENTE',
          privacyConsent: false,
        });
      },
      error: (error: unknown) => this.error.set(this.errors.toUserMessage(
        error,
        'No pudimos registrar tu solicitud. También puedes escribirnos por WhatsApp.',
      )),
    });
  }

  private localDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
