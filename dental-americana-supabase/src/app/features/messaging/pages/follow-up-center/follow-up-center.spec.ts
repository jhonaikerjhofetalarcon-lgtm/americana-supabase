import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, Subject } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { PatientApiService } from '../../../patients/data-access/patient-api.service';
import { PatientSummary } from '../../../patients/models/patient.models';
import { MessagingApiService } from '../../data-access/messaging-api.service';
import { Conversation, Message, WhatsAppSession } from '../../models/messaging.models';
import { FollowUpCenter } from './follow-up-center';

describe('FollowUpCenter: ciclo de vida de los diálogos', () => {
  let fixture: ComponentFixture<FollowUpCenter>;
  let page: FollowUpCenter;
  let response: Subject<WhatsAppSession>;
  let connect: ReturnType<typeof vi.fn>;
  let sendResponse: Subject<unknown>;
  let updateAutomationSetting: ReturnType<typeof vi.fn>;
  let conversationMessagesPage: ReturnType<typeof vi.fn>;

  const conversation: Conversation = {
    id: 7,
    patientId: 21,
    patientName: 'Paciente Prueba',
    phone: '51999999999',
    status: 'ABIERTA',
    lastMessage: 'Mensaje reciente',
    lastMessageAt: '2026-10-01T12:00:00Z',
    unreadCount: 0,
  };
  const message = (id: number, createdAt: string): Message => ({
    id,
    conversationId: conversation.id,
    patientId: conversation.patientId,
    patientName: conversation.patientName,
    direction: 'ENTRANTE',
    type: 'ENTRANTE',
    content: `Mensaje ${id}`,
    status: 'RECIBIDO',
    reviewRequired: false,
    attempts: 0,
    maxAttempts: 3,
    createdAt,
  });

  beforeEach(async () => {
    response = new Subject<WhatsAppSession>();
    connect = vi.fn(() => response.asObservable());
    updateAutomationSetting = vi.fn((key: string, active: boolean, version: number) =>
      of({ key, value: String(active), description: 'Control de prueba', version: version + 1 }),
    );
    conversationMessagesPage = vi.fn(() => of({ items: [], hasMore: false }));
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
            conversationMessagesPage,
            conversationsPage: () => of({ items: [], hasMore: false }),
            followUps: () => of([]),
            markRead: () => of(undefined),
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
    vi.unstubAllGlobals();
  });

  it('evita solicitudes de QR simultáneas', () => {
    page.connect();
    page.connect();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(page.saving()).toBe(true);
  });

  it('explica la conexión de Meta sin ofrecer un código QR', () => {
    fixture.detectChanges();
    page.session.set({
      status: 'ERROR',
      provider: 'meta',
      detail: 'WhatsApp Cloud API todavía no está configurada',
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Meta Cloud API');
    expect(text).toContain('La conexión se configura');
    expect(text).not.toContain('Conectar y generar QR');
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

  it('muestra inmediatamente el mensaje que acaba de enviar', () => {
    const sent = message(11, '2026-10-01T12:05:00Z');
    sent.direction = 'SALIENTE';
    sent.type = 'MANUAL';
    sent.status = 'ENVIADO';
    sent.content = 'Mensaje recién enviado';
    page.selected.set(conversation);
    page.conversations.set([conversation]);
    page.messageForm.controls.content.setValue(sent.content);

    page.send();
    sendResponse.next(sent);

    expect(page.messages()).toEqual([sent]);
    expect(page.selected()?.lastMessage).toBe(sent.content);
    expect(page.conversations()[0].lastMessage).toBe(sent.content);
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

  it('abre la conversación en el mensaje más reciente aunque el panel todavía no exista', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    conversationMessagesPage.mockReturnValueOnce(
      of({ items: [message(10, '2026-10-01T12:00:00Z')], hasMore: true }),
    );

    page.openConversation(conversation);
    fixture.detectChanges();
    const viewport = fixture.nativeElement.querySelector('.messages') as HTMLDivElement;
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 640 });
    viewport.scrollTop = 0;
    frames.shift()?.(0);

    expect(viewport.scrollTop).toBe(640);
    expect(page.hasOlderMessages()).toBe(true);
  });

  it('carga mensajes anteriores al llegar arriba y mantiene el punto de lectura', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    page.selected.set(conversation);
    page.messages.set([message(10, '2026-10-01T12:00:00Z')]);
    page.hasOlderMessages.set(true);
    fixture.detectChanges();
    const viewport = fixture.nativeElement.querySelector('.messages') as HTMLDivElement;
    let scrollHeight = 400;
    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });
    viewport.scrollTop = 24;
    frames.length = 0;
    conversationMessagesPage.mockReturnValueOnce(
      of({ items: [message(2, '2026-09-01T09:00:00Z')], hasMore: false }),
    );

    page.onMessageScroll();
    expect(frames.length).toBeGreaterThan(0);
    scrollHeight = 620;
    for (const frame of frames.splice(0)) frame(0);

    expect(conversationMessagesPage).toHaveBeenCalledWith(conversation.id, {
      at: '2026-10-01T12:00:00Z',
      id: 10,
    });
    expect(page.messages().map((item) => item.id)).toEqual([2, 10]);
    expect(viewport.scrollTop).toBe(244);
    expect(page.hasOlderMessages()).toBe(false);
  });
});
