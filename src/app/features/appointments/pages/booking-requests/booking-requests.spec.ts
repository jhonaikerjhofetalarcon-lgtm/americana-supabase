import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BookingRequestApiService } from '../../data-access/booking-request-api.service';
import { BookingRequest } from '../../models/booking-request.models';
import { BookingRequests } from './booking-requests';

describe('BookingRequests: registrar contacto', () => {
  const request: BookingRequest = {
    id: 12, fullName: 'Ana Torres', mobile: '999999999', service: 'Evaluación',
    preferredShift: 'INDIFERENTE', status: 'PENDIENTE',
    createdAt: '2026-09-13T10:00:00', updatedAt: '2026-09-13T10:00:00', version: 2,
  };
  let page: BookingRequests;
  let manage: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    manage = vi.fn(() => of(request));
    list = vi.fn(() => of([]));
    await TestBed.configureTestingModule({
      imports: [BookingRequests],
      providers: [
        provideRouter([]),
        { provide: BookingRequestApiService, useValue: { manage, list } },
      ],
    }).compileComponents();
    page = TestBed.createComponent(BookingRequests).componentInstance;
  });

  afterEach(() => vi.restoreAllMocks());

  it('no modifica la solicitud cuando se cancela la observación', () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    page.manage(request, 'CONTACTADO');

    expect(manage).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(page.saving()).toBe(false);
    expect(page.success()).toBe('');
  });

  it('permite confirmar un contacto sin observación', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    page.manage(request, 'CONTACTADO');

    expect(manage).toHaveBeenCalledWith(request.id, 'CONTACTADO', request.version, undefined);
    expect(page.success()).toBe('Solicitud actualizada.');
  });

  it('conserva la observación confirmada sin espacios sobrantes', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('  Paciente contactado por teléfono.  ');
    page.manage(request, 'CONTACTADO');

    expect(manage).toHaveBeenCalledWith(
      request.id, 'CONTACTADO', request.version, 'Paciente contactado por teléfono.',
    );
  });
});
