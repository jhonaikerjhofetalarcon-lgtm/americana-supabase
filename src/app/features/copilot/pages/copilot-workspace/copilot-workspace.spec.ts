import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { ClinicalApiService } from '../../../clinical/data-access/clinical-api.service';
import { ClinicalEncounter } from '../../../clinical/models/clinical.models';
import { CopilotApiService } from '../../data-access/copilot-api.service';
import { ChatReply } from '../../models/copilot.models';
import { CopilotWorkspace } from './copilot-workspace';

describe('DentalIA chat', () => {
  let fixture: ComponentFixture<CopilotWorkspace>;
  let page: CopilotWorkspace;
  let response: Subject<ChatReply>;
  let chat: ReturnType<typeof vi.fn>;
  const allowed = signal(true);
  const encounter = { id: 1, patientName: 'Paciente Uno', status: 'BORRADOR' } as ClinicalEncounter;

  beforeEach(async () => {
    allowed.set(true);
    response = new Subject<ChatReply>();
    chat = vi.fn(() => response.asObservable());
    await TestBed.configureTestingModule({
      imports: [CopilotWorkspace],
      providers: [
        { provide: AuthService, useValue: { hasPermission: () => allowed() } },
        { provide: ClinicalApiService, useValue: { search: () => of([encounter]) } },
        { provide: CopilotApiService, useValue: { chat, list: () => of([]) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CopilotWorkspace);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts without patient context and sends the conversation history', () => {
    expect(page.selected()).toBeNull();
    page.sendMessage(' Hola ');
    expect(chat).toHaveBeenCalledWith(null, [{ role: 'user', content: 'Hola' }]);
    response.next({ content: '¿En qué te ayudo?', mode: 'ai' });
    page.sendMessage('Resume la atención');
    expect(chat.mock.calls[1][1]).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¿En qué te ayudo?' },
      { role: 'user', content: 'Resume la atención' },
    ]);
  });

  it('rejects empty, oversized, duplicate and unauthorized sends', () => {
    page.sendMessage('   ');
    page.sendMessage('a'.repeat(4001));
    expect(chat).not.toHaveBeenCalled();
    page.sendMessage('Hola');
    page.sendMessage('Hola otra vez');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('does not send without IA_ESCRIBIR', () => {
    allowed.set(false);
    page.sendMessage('Hola');
    expect(chat).not.toHaveBeenCalled();
  });

  it('discards delayed responses when switching patients', () => {
    page.select(encounter);
    page.sendMessage('Resume la atención');
    expect(chat.mock.calls[0][0]).toBe(1);
    page.select({ ...encounter, id: 2 });
    response.next({ content: 'Datos del paciente anterior', mode: 'ai' });
    expect(page.messages()).toEqual([]);
    expect(page.chatting()).toBe(false);
  });

  it('clears patient context and ignores pending replies on a new conversation', () => {
    page.select(encounter);
    page.sendMessage('Resumen');
    page.generalChat();
    response.next({ content: 'Respuesta anterior', mode: 'basic' });
    expect(page.selected()).toBeNull();
    expect(page.messages()).toEqual([]);
    page.sendMessage('Hola');
    page.newChat();
    response.next({ content: 'Respuesta tardía', mode: 'basic' });
    expect(page.messages()).toEqual([]);
  });

  it('retries a failed request without duplicating the user message', () => {
    page.sendMessage('Hola');
    response.error(new Error('Sin conexión'));
    expect(page.chatError()).toBeTruthy();
    response = new Subject<ChatReply>();
    page.retryMessage();
    response.next({ content: 'Hola de nuevo', mode: 'basic' });
    expect(page.messages().length).toBe(2);
    expect(page.chatError()).toBe('');
    expect(page.chatMode()).toBe('basic');
  });

  it('renders assistant text safely and exposes the basic mode', () => {
    page.sendMessage('Hola');
    response.next({ content: '<img src=x onerror=alert(1)>', mode: 'basic' });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.chat-messages img')).toBeNull();
    expect(root.querySelector('.chat-messages')?.textContent).toContain('<img src=x');
    expect(root.querySelector('.basic-mode')?.textContent).toContain('Modo básico');
  });

  it('sends with Enter and leaves Shift+Enter for new lines', () => {
    page.messageText = 'Hola';
    const newline = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      cancelable: true,
    });
    page.onComposerKeydown(newline);
    expect(chat).not.toHaveBeenCalled();
    expect(newline.defaultPrevented).toBe(false);
    const send = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    page.onComposerKeydown(send);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(send.defaultPrevented).toBe(true);
  });
});
