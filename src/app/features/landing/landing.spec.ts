import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BookingRequestApiService } from '../appointments/data-access/booking-request-api.service';
import { BookingRequest } from '../appointments/models/booking-request.models';
import { Landing } from './landing';

describe('Landing pública', () => {
  const publicCreate = vi.fn(() => of({ id: 42 } as BookingRequest));

  beforeEach(async () => {
    publicCreate.mockClear();
    await TestBed.configureTestingModule({
      imports: [Landing],
      providers: [
        provideRouter([]),
        { provide: BookingRequestApiService, useValue: { publicCreate } },
      ],
    }).compileComponents();
  });

  it('preselecciona el servicio al abrir la solicitud desde su tarjeta', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.service-link') as HTMLAnchorElement;
    link.click();

    expect(fixture.componentInstance.booking.controls.service.value).toBe('Profilaxis y prevención');
  });

  it('muestra el número de solicitud devuelto al registrar una petición válida', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.componentInstance.booking.patchValue({
      fullName: 'Ana Torres', mobile: '999 999 999', service: 'Endodoncia', privacyConsent: true,
    });
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(publicCreate).toHaveBeenCalledWith(expect.objectContaining({ service: 'Endodoncia' }));
    expect(fixture.nativeElement.textContent).toContain('#42');
    expect(fixture.nativeElement.textContent).toContain('Tu cita aún no está confirmada');
  });
});
