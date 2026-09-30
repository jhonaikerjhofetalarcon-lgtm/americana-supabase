import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, Subject } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { PatientApiService } from '../../../patients/data-access/patient-api.service';
import { PatientSummary } from '../../../patients/models/patient.models';
import { MessagingApiService } from '../../data-access/messaging-api.service';
import { WhatsAppSession } from '../../models/messaging.models';
import { FollowUpCenter } from './follow-up-center';

describe('FollowUpCenter: ciclo de vida de los diálogos', () => {
  let fixture: ComponentFixture<FollowUpCenter>;
  let page: FollowUpCenter;
  let response: Subject<WhatsAppSession>;
  let connect: ReturnType<typeof vi.fn>;
  let sendResponse: Subject<unknown>;
  let updateAutomationSetting: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    response = new Subject<WhatsAppSession>();
    connect = vi.fn(() => response.asObservable());
    updateAutomationSetting = vi.fn((key: string, active: boolean, version: number) =>
      of({ key, value: String(active), description: 'Control de prueba', version: version + 1 }),
    );
    sendResponse = new Subject();
    await TestBed.configureTestingModule({
      imports: [FollowUpCenter],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: PatientApiService, useValue: {} },
        {
          provide: MessagingApiService,
          useValue: {
            connect,
            send: () => sendResponse.asObservable(),
            conversationsPage: () => of({ items: [], hasMore: false }),
            followUps: () => of([]),
            session: () => of({ status: 'DESCONECTADO' }),
            automationSettings: () =>
              of([
                {
                  key: 'whatsapp.automatizacion.activa',
                  value: 'false',
                  description: '',
                  version: 1,
                },
                {
                  key: 'whatsapp.automatizacion.citas',
                  value: 'false',
                  description: '',
                  version: 1,
                },
              ]),
            updateAutomationSetting,
            realtime: () => NEVER,
          },
        },
      ],
    }).compileComponents();
    // Exercise dialog actions without starting the inbox's polling/subscriptions in ngOnInit.
    fixture = TestBed.createComponent(FollowUpCenter);
    page = fixture.componentInstance;
    page.connectionDialog.set(true);
  });

  afterEach(() => {
    page.closeConnectionDialog();
    fixture.destroy();
    vi.useRealTimers();
  });

  it('evita solicitudes de QR simultáneas', () => {
    page.connect();
    page.connect();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(page.saving()).toBe(true);
  });

  it('no reabre una ventana cerrada cuando llega una respuesta tardía', () => {
    page.connect();
    page.closeConnectionDialog();
    response.next({ status: 'CONECTANDO', qrCode: 'data:image/png;base64,test' });
    expect(page.connectionDialog()).toBe(false);
    expect(page.saving()).toBe(false);
    expect(page.session().qrCode).toBe('data:image/png;base64,test');
  });

  it('desuscribe la petición al salir del módulo', () => {
    page.connect();
    expect(response.observed).toBe(true);
    fixture.destroy();
    expect(response.observed).toBe(false);
    response.next({ status: 'CONECTADO' });
    expect(page.session().status).toBe('CONECTANDO');
  });

  it('mantiene visible el mensaje mientras se procesa su envío', () => {
    page.composeDialog.set(true);
    page.saving.set(true);
    page.closeComposeDialog();
    expect(page.composeDialog()).toBe(true);
    page.saving.set(false);
    page.closeComposeDialog();
    expect(page.composeDialog()).toBe(false);
  });

  it('reanuda la renovación del QR al volver a abrir la conexión', () => {
    vi.useFakeTimers();
    page.connect();
    response.next({ status: 'CONECTANDO', qrCode: 'data:image/png;base64,test' });
    response.complete();
    page.closeConnectionDialog();
    vi.advanceTimersByTime(30_000);
    expect(connect).toHaveBeenCalledTimes(1);

    page.openConnectionDialog();
    vi.advanceTimersByTime(25_000);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('pospone la renovación si hay una operación en curso sin perderla', () => {
    vi.useFakeTimers();
    page.session.set({ status: 'CONECTANDO', qrCode: 'data:image/png;base64/test' });
    page.openConnectionDialog();
    page.saving.set(true);
    vi.advanceTimersByTime(25_000);
    expect(connect).not.toHaveBeenCalled();
    page.saving.set(false);
    vi.advanceTimersByTime(25_000);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('muestra el rechazo del envío dentro del diálogo y conserva el borrador', () => {
    page.closeConnectionDialog();
    fixture.detectChanges();
    page.openComposeDialog();
    page.selectedPatient.set({
      id: 8,
      mobile: '999999999',
      whatsappConsent: true,
    } as PatientSummary);
    page.composeForm.controls.content.setValue('Mensaje de prueba sin datos reales.');
    page.sendNew();
    sendResponse.error(new Error('WhatsApp no está conectado.'));
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector(
      '.compose-dialog [role="alert"]',
    ) as HTMLElement;
    expect(alert.textContent).toContain('WhatsApp no está conectado.');
    expect(page.composeDialog()).toBe(true);
    expect(page.composeForm.controls.content.value).toBe('Mensaje de prueba sin datos reales.');
    expect(page.saving()).toBe(false);
  });

  it('explica dentro del formulario que el paciente no autorizó WhatsApp', () => {
    page.closeConnectionDialog();
    fixture.detectChanges();
    page.openComposeDialog();
    page.selectPatient({ id: 8, mobile: '999999999', whatsappConsent: false } as PatientSummary);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector(
      '.compose-dialog [role="alert"]',
    ) as HTMLElement;
    expect(alert.textContent).toContain('El paciente no autorizó WhatsApp.');
    expect(page.selectedPatient()).toBeNull();
  });

  it('guarda el interruptor general de automatizaciones', () => {
    page.openAutomations();
    expect(page.automationEnabled('whatsapp.automatizacion.activa')).toBe(false);

    page.toggleAutomation('whatsapp.automatizacion.activa');

    expect(updateAutomationSetting).toHaveBeenCalledWith('whatsapp.automatizacion.activa', true, 1);
    expect(page.automationEnabled('whatsapp.automatizacion.activa')).toBe(true);
  });

  it('permite preparar un flujo sin activarlo hasta encender el interruptor general', () => {
    page.openAutomations();
    page.toggleAutomation('whatsapp.automatizacion.citas');

    expect(page.automationState('whatsapp.automatizacion.citas')).toBe('Preparada');
    expect(page.activeAutomationCount()).toBe(0);
    page.toggleAutomation('whatsapp.automatizacion.activa');
    expect(page.automationState('whatsapp.automatizacion.citas')).toBe('Activa');
    expect(page.activeAutomationCount()).toBe(1);
  });
});
