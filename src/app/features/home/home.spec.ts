import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { Home } from './home';

describe('Mi jornada: abrir atención', () => {
  it('transporta el identificador de la cita y no obliga a buscar al paciente otra vez', async () => {
    await TestBed.configureTestingModule({ imports: [Home], providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { hasPermission: () => true, currentUser: signal(null) } },
      { provide: DashboardService, useValue: {
        load: vi.fn(), metrics: signal([]), pending: signal([]), loading: signal(false),
        error: signal(''), warnings: signal([]), appointments: signal([{
          id: 42, patientId: 8, patient: 'Paciente de prueba', initials: 'PP',
          time: '10:00', status: 'Confirmada', duration: '30 min', tone: 'blue',
        }]),
      } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.active-patient a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/sistema/atencion?appointmentId=42');
  });
});
