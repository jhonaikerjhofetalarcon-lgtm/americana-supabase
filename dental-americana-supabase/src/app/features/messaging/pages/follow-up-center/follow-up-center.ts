import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAlertTriangle,
  LucideCalendar,
  LucideCheck,
  LucideCheckCheck,
  LucideClock3,
  LucideLoaderCircle,
  LucideMessageCircle,
  LucidePhone,
  LucidePlus,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSearch,
  LucideSend,
  LucideUser,
  LucideWifi,
  LucideWifiOff,
  LucideX,
} from '@lucide/angular';
import { finalize, forkJoin, fromEvent, interval, of, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { AuthService } from '../../../../core/auth/auth.service';
import { ModalDirective } from '../../../../shared/ui/modal/modal.directive';
import { PatientApiService } from '../../../patients/data-access/patient-api.service';
import { PatientSummary } from '../../../patients/models/patient.models';
import { MessagingApiService } from '../../data-access/messaging-api.service';
import {
  AutomationSetting,
  Conversation,
  FollowUp,
  Message,
  WhatsAppSession,
} from '../../models/messaging.models';

type View = 'chat' | 'followups' | 'automations';
@Component({
  selector: 'app-follow-up-center',
  imports: [
    ModalDirective,
    RouterLink,
    ReactiveFormsModule,
    DatePipe,
    LucideAlertTriangle,
    LucideCalendar,
    LucideCheck,
    LucideCheckCheck,
    LucideClock3,
    LucideLoaderCircle,
    LucideMessageCircle,
    LucidePhone,
    LucidePlus,
    LucideRefreshCw,
    LucideRotateCcw,
    LucideSearch,
    LucideSend,
    LucideUser,
    LucideWifi,
    LucideWifiOff,
    LucideX,
  ],
  templateUrl: './follow-up-center.html',
  styleUrl: './follow-up-center.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FollowUpCenter implements OnInit {
  @ViewChild('messageViewport') private messageViewport?: ElementRef<HTMLDivElement>;
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(MessagingApiService);
  private readonly patientApi = inject(PatientApiService);
  private readonly auth = inject(AuthService);
  readonly conversations = signal<Conversation[]>([]);
  readonly hasMoreConversations = signal(false);
  readonly loadingMoreConversations = signal(false);
  readonly searchingConversations = signal(false);
  readonly messages = signal<Message[]>([]);
  readonly hasOlderMessages = signal(false);
  readonly loadingOlderMessages = signal(false);
  readonly followups = signal<FollowUp[]>([]);
  readonly selected = signal<Conversation | null>(null);
  readonly session = signal<WhatsAppSession>({ status: 'DESCONECTADO' });
  readonly loading = signal(true);
  readonly loadingMessages = signal(false);
  readonly saving = signal(false);
  readonly syncing = signal(false);
  readonly refreshing = signal(false);
  readonly error = signal('');
  readonly composeError = signal('');
  readonly success = signal('');
  readonly view = signal<View>('chat');
  readonly connectionDialog = signal(false);
  readonly composeDialog = signal(false);
  readonly results = signal<PatientSummary[]>([]);
  readonly selectedPatient = signal<PatientSummary | null>(null);
  readonly canWrite = signal(this.auth.hasPermission('SEGUIMIENTO_ESCRIBIR'));
  readonly canConfigureAutomations = signal(this.auth.hasPermission('AJUSTE_ESCRIBIR'));
  readonly automationSettings = signal<AutomationSetting[]>([]);
  readonly automationLoading = signal(false);
  readonly automationError = signal('');
  readonly automationSavingKey = signal<string | null>(null);
  readonly automationDefinitions = [
    {
      key: 'whatsapp.automatizacion.activa',
      name: 'Control general',
      description: 'Enciende o pausa el asistente y los flujos que hayas seleccionado.',
    },
    {
      key: 'whatsapp.automatizacion.citas',
      name: 'Confirmaciones y recordatorios',
      description: 'Avisa al paciente de su cita y le recuerda cuándo asistir.',
    },
    {
      key: 'whatsapp.automatizacion.reservas',
      name: 'Reserva por horarios',
      description: 'Permite elegir un turno disponible desde la conversación.',
    },
    {
      key: 'whatsapp.automatizacion.postconsulta',
      name: 'Seguimiento postconsulta',
      description: 'Pregunta al paciente cómo se siente después de su atención.',
    },
  ] as const;
  readonly activeAutomationCount = computed(
    () =>
      this.automationDefinitions.slice(1).filter((item) => this.automationEffective(item.key))
        .length,
  );
  readonly alerts = computed(() => this.followups().filter((item) => item.status === 'ALERTA'));
  private conversationSearchTimer?: ReturnType<typeof setTimeout>;
  private patientSearchTimer?: ReturnType<typeof setTimeout>;
  private qrRefreshTimer?: ReturnType<typeof setTimeout>;
  private refreshQueued = false;
  private conversationQueryVersion = 0;
  private messageContextVersion = 0;
  private latestMessageRequestVersion = 0;
  private messageScrollFrame?: number;
  private patientSearchVersion = 0;
  private readonly markingRead = new Set<number>();
  readonly searchForm = this.fb.group({ query: [''] });
  readonly messageForm = this.fb.group({
    content: ['', [Validators.required, Validators.maxLength(4000)]],
  });
  readonly composeForm = this.fb.group({ search: [''], content: ['', Validators.required] });

  ngOnInit() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.conversationSearchTimer);
      clearTimeout(this.patientSearchTimer);
      clearTimeout(this.qrRefreshTimer);
      if (this.messageScrollFrame !== undefined) cancelAnimationFrame(this.messageScrollFrame);
    });
    this.loadAll();
    this.api
      .realtime()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.syncing()) this.refreshQuietly();
      });
    interval(30000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!document.hidden && !this.saving() && !this.syncing()) this.refreshQuietly();
      });
    fromEvent(window, 'online')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshQuietly());
    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!document.hidden) this.refreshQuietly();
      });
  }
  loadAll() {
    this.loading.set(true);
    this.error.set('');
    const queryVersion = this.conversationQueryVersion;
    forkJoin({
      conversations: this.api.conversationsPage(this.searchForm.controls.query.value),
      followups: this.api.followUps(),
      session: this.api.session(),
    })
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          if (queryVersion === this.conversationQueryVersion) {
            this.conversations.set(data.conversations.items);
            this.hasMoreConversations.set(data.conversations.hasMore);
          }
          this.followups.set(data.followups);
          this.applySessionState(data.session);
          this.reconcileSelection();
          this.loading.set(false);
          if (
            queryVersion === this.conversationQueryVersion &&
            !this.searchForm.controls.query.value &&
            this.canWrite() &&
            data.session.status === 'CONECTADO' &&
            !data.conversations.items.length
          ) {
            this.syncChats(false);
          }
        },
        error: (error) => {
          this.loading.set(false);
          this.error.set(
            error?.name === 'TimeoutError'
              ? 'La carga de WhatsApp tardó demasiado. Pulsa Actualizar para reintentar.'
              : error.message || 'No se pudo cargar WhatsApp.',
          );
        },
      });
  }
  openAutomations() {
    this.view.set('automations');
    this.loadAutomationSettings();
  }
  automationEnabled(key: string): boolean {
    return this.automationSettings().find((setting) => setting.key === key)?.value === 'true';
  }
  automationSettingAvailable(key: string): boolean {
    return this.automationSettings().some((setting) => setting.key === key);
  }
  automationEffective(key: string): boolean {
    return this.automationEnabled('whatsapp.automatizacion.activa') && this.automationEnabled(key);
  }
  automationState(key: string): string {
    if (key === 'whatsapp.automatizacion.activa')
      return this.automationEnabled(key) ? 'Activa' : 'Pausada';
    if (!this.automationEnabled(key)) return 'Pausada';
    return this.automationEffective(key) ? 'Activa' : 'Preparada';
  }
  toggleAutomation(key: string) {
    if (!this.canConfigureAutomations() || this.automationSavingKey() || this.automationLoading())
      return;
    if (!this.automationDefinitions.some((item) => item.key === key)) return;
    const setting = this.automationSettings().find((item) => item.key === key);
    if (!setting) return;
    this.automationSavingKey.set(key);
    this.automationError.set('');
    this.success.set('');
    this.api
      .updateAutomationSetting(key, !this.automationEnabled(key), setting.version)
      .pipe(
        finalize(() => this.automationSavingKey.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.automationSettings.update((items) =>
            items.map((item) => (item.key === updated.key ? updated : item)),
          );
          this.success.set(
            `${this.automationDefinitions.find((item) => item.key === key)?.name ?? 'Automatización'} actualizada.`,
          );
        },
        error: (error) => {
          this.automationError.set(error.message || 'No se pudo actualizar la automatización.');
          this.automationSavingKey.set(null);
          this.loadAutomationSettings(true);
        },
      });
  }
  loadAutomationSettings(keepError = false) {
    if (!this.canConfigureAutomations() || this.automationLoading() || this.automationSavingKey())
      return;
    this.automationLoading.set(true);
    if (!keepError) this.automationError.set('');
    this.api
      .automationSettings()
      .pipe(
        timeout({ first: READ_REQUEST_TIMEOUT_MS }),
        finalize(() => this.automationLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.automationSettings.set(settings);
          if (settings.length < this.automationDefinitions.length)
            this.automationError.set(
              'Falta configuración de WhatsApp. Actualiza e inténtalo de nuevo.',
            );
        },
        error: (error) =>
          this.automationError.set(
            error?.name === 'TimeoutError'
              ? 'La configuración tardó demasiado en cargar. Inténtalo de nuevo.'
              : error.message || 'No se pudo cargar la configuración de automatizaciones.',
          ),
      });
  }
  refreshQuietly() {
    if (this.refreshing()) {
      this.refreshQueued = true;
      return;
    }
    this.refreshing.set(true);
    const queryVersion = this.conversationQueryVersion;
    forkJoin({
      conversations: this.api.conversationsPage(this.searchForm.controls.query.value),
      session: this.api.session(),
      followups: this.view() === 'followups' ? this.api.followUps() : of(null),
    })
      .pipe(
        timeout({ first: READ_REQUEST_TIMEOUT_MS }),
        finalize(() => {
          this.refreshing.set(false);
          if (this.refreshQueued) {
            this.refreshQueued = false;
            this.refreshQuietly();
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ conversations, session, followups }) => {
          if (queryVersion === this.conversationQueryVersion) {
            this.conversations.set(
              this.mergeConversations(conversations.items, this.conversations()),
            );
            if (this.conversations().length <= conversations.items.length) {
              this.hasMoreConversations.set(conversations.hasMore);
            }
          }
          this.applySessionState(session);
          if (this.view() === 'automations' && !this.automationSavingKey())
            this.loadAutomationSettings();
          if (followups) this.followups.set(followups);
          this.reconcileSelection();
          const current = this.selected();
          if (this.view() === 'chat' && current) {
            this.loadMessages(current.id, false);
            if (current.unreadCount) this.markConversationRead(current.id);
          }
        },
        error: () => {
          this.error.set('No se pudo actualizar WhatsApp. Vuelve a intentarlo.');
        },
      });
  }
  filterConversations() {
    clearTimeout(this.conversationSearchTimer);
    const queryVersion = ++this.conversationQueryVersion;
    const query = this.searchForm.controls.query.value;
    this.conversations.set([]);
    this.hasMoreConversations.set(false);
    this.loadingMoreConversations.set(false);
    this.searchingConversations.set(true);
    this.conversationSearchTimer = setTimeout(() => {
      this.api
        .conversationsPage(query)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (page) => {
            if (queryVersion !== this.conversationQueryVersion) return;
            this.conversations.set(page.items);
            this.hasMoreConversations.set(page.hasMore);
            this.searchingConversations.set(false);
            this.reconcileSelection();
          },
          error: (error) => {
            if (queryVersion === this.conversationQueryVersion) {
              this.searchingConversations.set(false);
              this.error.set(error.message);
            }
          },
        });
    }, 250);
  }
  loadMoreConversations() {
    if (!this.hasMoreConversations() || this.loadingMoreConversations()) return;
    const last = this.conversations().at(-1);
    if (!last?.lastMessageAt) return;
    const queryVersion = this.conversationQueryVersion;
    this.loadingMoreConversations.set(true);
    this.api
      .conversationsPage(this.searchForm.controls.query.value, {
        at: last.lastMessageAt,
        id: last.id,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (queryVersion !== this.conversationQueryVersion) return;
          this.loadingMoreConversations.set(false);
          this.conversations.set(this.mergeConversations(this.conversations(), page.items));
          this.hasMoreConversations.set(page.hasMore);
        },
        error: (error) => {
          if (queryVersion === this.conversationQueryVersion) {
            this.loadingMoreConversations.set(false);
            this.error.set(error.message);
          }
        },
      });
  }
  openConversation(conversation: Conversation) {
    this.messageContextVersion++;
    this.selected.set(conversation);
    this.messages.set([]);
    this.hasOlderMessages.set(false);
    this.loadingOlderMessages.set(false);
    this.loadMessages(conversation.id, true);
    if (conversation.unreadCount) this.markConversationRead(conversation.id);
  }
  loadMessages(id: number, showLoader = true) {
    if (showLoader) this.loadingMessages.set(true);
    const contextVersion = this.messageContextVersion;
    const requestVersion = ++this.latestMessageRequestVersion;
    this.api
      .conversationMessagesPage(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (
            contextVersion !== this.messageContextVersion ||
            requestVersion !== this.latestMessageRequestVersion ||
            this.selected()?.id !== id
          )
            return;
          const viewport = this.messageViewport?.nativeElement;
          const nearBottom =
            !viewport ||
            showLoader ||
            viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 80;
          const hadMessages = this.messages().length > 0;
          this.messages.set(
            showLoader ? page.items : this.mergeMessages(this.messages(), page.items),
          );
          if (showLoader || !hadMessages) this.hasOlderMessages.set(page.hasMore);
          this.loadingMessages.set(false);
          if (nearBottom) this.scrollToLatestMessage(id);
        },
        error: (error) => {
          if (
            contextVersion !== this.messageContextVersion ||
            requestVersion !== this.latestMessageRequestVersion ||
            this.selected()?.id !== id
          )
            return;
          this.loadingMessages.set(false);
          this.error.set(error.message);
        },
      });
  }
  loadOlderMessages() {
    const conversation = this.selected();
    const oldest = this.messages()[0];
    if (!conversation || !oldest || !this.hasOlderMessages() || this.loadingOlderMessages()) return;
    const contextVersion = this.messageContextVersion;
    this.loadingOlderMessages.set(true);
    this.api
      .conversationMessagesPage(conversation.id, {
        at: oldest.createdAt,
        id: oldest.id,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (
            contextVersion !== this.messageContextVersion ||
            this.selected()?.id !== conversation.id
          )
            return;
          this.loadingOlderMessages.set(false);
          const viewport = this.messageViewport?.nativeElement;
          const previousHeight = viewport?.scrollHeight ?? 0;
          const previousTop = viewport?.scrollTop ?? 0;
          this.messages.set(this.mergeMessages(page.items, this.messages()));
          this.hasOlderMessages.set(page.hasMore);
          requestAnimationFrame(() => {
            const currentViewport = this.messageViewport?.nativeElement;
            if (this.selected()?.id === conversation.id && currentViewport) {
              currentViewport.scrollTop =
                previousTop + currentViewport.scrollHeight - previousHeight;
            }
          });
        },
        error: (error) => {
          if (contextVersion === this.messageContextVersion) {
            this.loadingOlderMessages.set(false);
            this.error.set(error.message);
          }
        },
      });
  }
  onMessageScroll() {
    const viewport = this.messageViewport?.nativeElement;
    if (!viewport || viewport.scrollTop > 48 || this.loadingMessages()) return;
    this.loadOlderMessages();
  }
  send() {
    if (!this.canWrite() || this.saving()) return;
    const conversation = this.selected();
    const content = this.messageForm.controls.content.value.trim();
    if (!conversation?.patientId || !content || this.messageForm.invalid) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .send(conversation.patientId, content)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (message) => {
          this.saving.set(false);
          this.messageForm.reset();
          if (this.selected()?.id === conversation.id) this.showRecentMessage(message);
        },
        error: (error) => {
          this.saving.set(false);
          this.error.set(error.message || 'No se pudo enviar.');
        },
      });
  }
  handleEnter(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.send();
  }
  retry(message: Message) {
    if (!this.canWrite() || this.saving()) return;
    this.saving.set(true);
    this.api
      .retry(message.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          if (this.selected()?.id === updated.conversationId) this.showRecentMessage(updated);
        },
        error: (error) => {
          this.saving.set(false);
          this.error.set(error.message);
        },
      });
  }
  connect() {
    if (!this.canWrite() || this.saving()) return;
    this.saving.set(true);
    this.session.update((current) => ({ ...current, status: 'CONECTANDO', detail: undefined }));
    this.api
      .connect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.saving.set(false);
          this.session.set(state);
          if (this.connectionDialog() && (state.qrCode || state.pairingCode))
            this.scheduleQrRefresh();
        },
        error: (error) => {
          this.saving.set(false);
          this.session.set({ status: 'ERROR', detail: error.message });
          this.error.set(error.message);
        },
      });
  }
  openConnectionDialog(): void {
    this.connectionDialog.set(true);
    if (this.canWrite() && this.session().status === 'CONECTANDO') this.scheduleQrRefresh();
  }
  closeConnectionDialog(): void {
    this.connectionDialog.set(false);
    clearTimeout(this.qrRefreshTimer);
  }
  openComposeDialog(): void {
    this.composeError.set('');
    this.composeDialog.set(true);
  }
  closeComposeDialog(): void {
    if (!this.saving()) this.composeDialog.set(false);
  }
  syncChats(showMessage = true) {
    if (!this.canWrite() || this.syncing()) return;
    this.syncing.set(true);
    this.error.set('');
    this.api
      .sync()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          const queryVersion = this.conversationQueryVersion;
          this.api
            .conversationsPage(this.searchForm.controls.query.value)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (page) => {
                if (queryVersion === this.conversationQueryVersion) {
                  this.conversations.set(this.mergeConversations(page.items, this.conversations()));
                  this.hasMoreConversations.set(page.hasMore);
                }
                this.reconcileSelection();
                this.syncing.set(false);
                if (showMessage)
                  this.success.set(
                    `WhatsApp sincronizado: ${result.chats} chats y ${result.messages} mensajes revisados.`,
                  );
              },
              error: (error) => {
                this.syncing.set(false);
                this.error.set(
                  error.message || 'No se pudieron cargar las conversaciones sincronizadas.',
                );
              },
            });
        },
        error: (error) => {
          this.syncing.set(false);
          this.error.set(error.message || 'No se pudo sincronizar el historial de WhatsApp.');
        },
      });
  }
  searchPatients(query: string) {
    clearTimeout(this.patientSearchTimer);
    const searchVersion = ++this.patientSearchVersion;
    this.composeError.set('');
    this.results.set([]);
    this.selectedPatient.set(null);
    if (query.trim().length < 2) {
      this.results.set([]);
      return;
    }
    this.patientSearchTimer = setTimeout(() => {
      this.patientApi
        .search({ q: query.trim(), active: true, page: 0, size: 8 })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            if (searchVersion === this.patientSearchVersion) this.results.set(result.content);
          },
          error: (error) => {
            if (searchVersion === this.patientSearchVersion)
              this.composeError.set(error.message || 'No se pudo buscar al paciente.');
          },
        });
    }, 250);
  }
  selectPatient(patient: PatientSummary) {
    if (!patient.mobile || !patient.whatsappConsent) {
      this.selectedPatient.set(null);
      this.composeError.set(
        !patient.mobile ? 'El paciente no tiene celular.' : 'El paciente no autorizó WhatsApp.',
      );
      return;
    }
    this.composeError.set('');
    this.patientSearchVersion++;
    this.selectedPatient.set(patient);
    this.results.set([]);
    this.composeForm.controls.search.setValue(patient.fullName);
  }
  sendNew() {
    if (!this.canWrite() || this.saving()) return;
    const patient = this.selectedPatient();
    const content = this.composeForm.controls.content.value.trim();
    if (!patient || !content) return;
    this.composeError.set('');
    this.saving.set(true);
    this.api
      .send(patient.id, content)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.composeDialog.set(false);
          this.composeForm.reset();
          this.selectedPatient.set(null);
          this.loadAll();
        },
        error: (error) => {
          this.saving.set(false);
          this.composeError.set(
            error.message || 'No se pudo enviar el mensaje. Inténtalo nuevamente.',
          );
        },
      });
  }
  review(followup: FollowUp) {
    if (!this.canWrite()) return;
    if (!confirm('¿Confirmas que revisaste profesionalmente esta respuesta?')) return;
    this.api
      .review(followup.id, followup.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.loadAll(), error: (e) => this.error.set(e.message) });
  }
  statusLabel(value: string) {
    return value.replaceAll('_', ' ').toLowerCase();
  }
  initials(name: string) {
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  trackMessage(_index: number, message: Message) {
    return message.id;
  }
  private markConversationRead(id: number) {
    if (this.markingRead.has(id)) return;
    this.markingRead.add(id);
    this.api
      .markRead(id)
      .pipe(
        finalize(() => this.markingRead.delete(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.conversations.update((items) =>
            items.map((item) => (item.id === id ? { ...item, unreadCount: 0 } : item)),
          );
          this.selected.update((item) => (item?.id === id ? { ...item, unreadCount: 0 } : item));
        },
        error: (error) => this.error.set(error.message),
      });
  }
  private mergeConversations(first: Conversation[], second: Conversation[]): Conversation[] {
    const byId = new Map<number, Conversation>();
    for (const item of second) byId.set(item.id, item);
    for (const item of first) byId.set(item.id, item);
    return [...byId.values()].sort(
      (a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') || b.id - a.id,
    );
  }
  private mergeMessages(first: Message[], second: Message[]): Message[] {
    const byId = new Map<number, Message>();
    for (const item of first) byId.set(item.id, item);
    for (const item of second) byId.set(item.id, item);
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  }
  private showRecentMessage(message: Message) {
    this.messages.update((items) => this.mergeMessages(items, [message]));
    this.conversations.update((items) => {
      const conversation = items.find((item) => item.id === message.conversationId);
      if (!conversation) return items;
      const updated: Conversation = {
        ...conversation,
        lastMessage: message.content,
        lastMessageDirection: message.direction,
        lastMessageAt: message.createdAt,
      };
      return this.mergeConversations([updated], items);
    });
    this.selected.update((conversation) =>
      conversation?.id === message.conversationId
        ? {
            ...conversation,
            lastMessage: message.content,
            lastMessageDirection: message.direction,
            lastMessageAt: message.createdAt,
          }
        : conversation,
    );
    this.scrollToLatestMessage(message.conversationId);
  }
  private scrollToLatestMessage(conversationId: number, attempts = 2) {
    if (this.messageScrollFrame !== undefined) cancelAnimationFrame(this.messageScrollFrame);
    this.messageScrollFrame = requestAnimationFrame(() => {
      this.messageScrollFrame = undefined;
      if (this.selected()?.id !== conversationId) return;
      const viewport = this.messageViewport?.nativeElement;
      if (!viewport) {
        if (attempts > 0) this.scrollToLatestMessage(conversationId, attempts - 1);
        return;
      }
      viewport.scrollTop = viewport.scrollHeight;
    });
  }
  private applySessionState(state: WhatsAppSession) {
    const current = this.session();
    if (state.status === 'CONECTADO') clearTimeout(this.qrRefreshTimer);
    if (
      this.connectionDialog() &&
      current.qrCode &&
      state.status === 'CONECTANDO' &&
      !state.qrCode
    ) {
      this.session.set({
        ...state,
        qrCode: current.qrCode,
        pairingCode: current.pairingCode,
        code: current.code,
      });
      return;
    }
    this.session.set(state);
  }
  private scheduleQrRefresh() {
    clearTimeout(this.qrRefreshTimer);
    this.qrRefreshTimer = setTimeout(() => {
      if (!this.connectionDialog() || this.session().status !== 'CONECTANDO') return;
      if (this.saving()) this.scheduleQrRefresh();
      else this.connect();
    }, 25_000);
  }
  private reconcileSelection() {
    const current = this.selected();
    if (!current) return;
    const updated = this.conversations().find((item) => item.id === current.id);
    if (updated) this.selected.set(updated);
  }
}
