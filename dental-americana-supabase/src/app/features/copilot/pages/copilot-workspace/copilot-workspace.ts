import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
  afterEveryRender,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideAlertTriangle,
  LucideBot,
  LucideCheck,
  LucideClipboardCheck,
  LucideClock3,
  LucideFileHeart,
  LucideHistory,
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideShieldCheck,
  LucideSparkles,
  LucideStethoscope,
  LucideX,
  LucideSend,
  LucidePlus,
} from '@lucide/angular';
import { Observable, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { ClinicalApiService } from '../../../clinical/data-access/clinical-api.service';
import { ClinicalEncounter } from '../../../clinical/models/clinical.models';
import { CopilotApiService } from '../../data-access/copilot-api.service';
import { AiDraft, AiDraftType, ChatMessage } from '../../models/copilot.models';

@Component({
  selector: 'app-copilot-workspace',
  imports: [
    FormsModule,
    DatePipe,
    LucideAlertTriangle,
    LucideBot,
    LucideCheck,
    LucideClipboardCheck,
    LucideClock3,
    LucideFileHeart,
    LucideHistory,
    LucideLoaderCircle,
    LucideRefreshCw,
    LucideShieldCheck,
    LucideSparkles,
    LucideStethoscope,
    LucideX,
    LucideSend,
    LucidePlus,
  ],
  templateUrl: './copilot-workspace.html',
  styleUrl: './copilot-workspace.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopilotWorkspace implements OnInit {
  private readonly api = inject(CopilotApiService);
  private readonly clinical = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);
  private encountersRequestId = 0;
  private draftsRequestId = 0;
  private chatRequestId = 0;
  private scrollPending = false;
  private readonly messageList = viewChild<ElementRef<HTMLElement>>('messageList');
  readonly messages = signal<ChatMessage[]>([]);
  readonly chatting = signal(false);
  readonly chatError = signal('');
  readonly chatMode = signal<'ai' | 'basic' | null>(null);
  readonly showDrafts = signal(false);
  messageText = '';
  readonly suggestions = [
    'Resume la atención seleccionada',
    '¿Qué datos faltan completar?',
    'Muéstrame las indicaciones registradas',
    '¿Cómo puedes ayudarme?',
  ];

  constructor() {
    afterEveryRender(() => {
      const element = this.messageList()?.nativeElement;
      if (this.scrollPending && element) {
        element.scrollTop = element.scrollHeight;
        this.scrollPending = false;
      }
    });
  }

  newChat(): void {
    ++this.chatRequestId;
    this.messages.set([]);
    this.chatting.set(false);
    this.chatError.set('');
    this.chatMode.set(null);
    this.messageText = '';
  }

  generalChat(): void {
    ++this.draftsRequestId;
    this.selected.set(null);
    this.drafts.set([]);
    this.editing.set(null);
    this.loading.set(false);
    this.newChat();
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage(text = this.messageText): void {
    const content = text.trim();
    if (!content || content.length > 4000 || this.chatting() || !this.canGenerate()) return;
    const messages: ChatMessage[] = [...this.messages(), { role: 'user', content }];
    this.messages.set(messages);
    this.messageText = '';
    this.requestReply(messages);
  }

  retryMessage(): void {
    if (this.chatting() || !this.canGenerate() || this.messages().at(-1)?.role !== 'user') return;
    this.requestReply(this.messages());
  }

  private requestReply(messages: ChatMessage[]): void {
    const requestId = ++this.chatRequestId;
    this.chatting.set(true);
    this.chatError.set('');
    this.scrollPending = true;
    // Keep complete recent turns, starting with a user message.
    const recent = messages.slice(-19);
    if (recent[0]?.role === 'assistant') recent.shift();
    this.api
      .chat(this.selected()?.id ?? null, recent)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reply) => {
          if (requestId !== this.chatRequestId) return;
          this.messages.update((items) => [
            ...items,
            { role: 'assistant', content: reply.content },
          ]);
          this.chatMode.set(reply.mode);
          this.chatting.set(false);
          this.scrollPending = true;
        },
        error: (error: unknown) => {
          if (requestId !== this.chatRequestId) return;
          this.chatting.set(false);
          this.chatError.set(this.errors.toUserMessage(error, 'No se pudo obtener una respuesta.'));
          this.scrollPending = true;
        },
      });
  }
  readonly encounters = signal<ClinicalEncounter[]>([]);
  readonly selected = signal<ClinicalEncounter | null>(null);
  readonly drafts = signal<AiDraft[]>([]);
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly canGenerate = computed(() => this.auth.hasPermission('IA_ESCRIBIR'));
  readonly canApprove = computed(() => this.auth.hasPermission('IA_APROBAR'));
  readonly draftTypes: AiDraftType[] = [
    'RESUMEN_HISTORIA',
    'BORRADOR_EVOLUCION',
    'PLAN_TRATAMIENTO',
    'ALERTAS_CLINICAS',
    'INDICACIONES_POSTCONSULTA',
    'RESUMEN_PARA_PACIENTE',
    'VERIFICACION_CIERRE',
  ];
  readonly editing = signal<number | null>(null);
  editContent = '';
  startEdit(d: AiDraft): void {
    if (!this.canApprove() || d.status !== 'BORRADOR' || this.working()) return;
    this.editing.set(d.id);
    this.editContent = d.content;
  }
  saveEdit(d: AiDraft): void {
    const content = this.editContent.trim();
    if (!this.canApprove() || d.status !== 'BORRADOR' || this.working()) return;
    if (!content || content.length > 20_000) {
      this.error.set('El borrador debe contener entre 1 y 20 000 caracteres.');
      return;
    }
    this.run(
      this.api.edit(d.id, d.version, content),
      'Borrador corregido. Revísalo antes de aprobar.',
    );
  }
  ngOnInit(): void {
    this.loadEncounters();
  }
  loadEncounters(): void {
    const requestId = ++this.encountersRequestId;
    this.loading.set(true);
    this.error.set('');
    const to = new Date();
    to.setDate(to.getDate() + 1);
    const from = new Date();
    from.setDate(from.getDate() - 89);
    this.clinical
      .search(from.toISOString(), to.toISOString())
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (requestId !== this.encountersRequestId) return;
          this.encounters.set(r);
          this.loading.set(false);
          const selectedId = this.selected()?.id;
          if (selectedId) {
            const current = r.find((item) => item.id === selectedId);
            if (current) this.select(current);
            else this.generalChat();
          }
        },
        error: (error: unknown) => {
          if (requestId !== this.encountersRequestId) return;
          this.loading.set(false);
          this.error.set(
            this.errors.toUserMessage(error, 'No se pudieron cargar las atenciones recientes.'),
          );
        },
      });
  }
  select(e: ClinicalEncounter): void {
    const requestId = ++this.draftsRequestId;
    if (this.selected()?.id !== e.id) this.newChat();
    this.drafts.set([]);
    this.error.set('');
    this.editing.set(null);
    this.selected.set(e);
    this.loading.set(true);
    this.api
      .list(e.id)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (requestId !== this.draftsRequestId || this.selected()?.id !== e.id) return;
          this.drafts.set(r);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.draftsRequestId || this.selected()?.id !== e.id) return;
          this.loading.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudieron cargar los borradores.'));
        },
      });
  }
  generate(type: AiDraftType): void {
    const e = this.selected();
    if (!e || !this.canGenerate() || this.working()) return;
    this.run(this.api.generate(e.id, type), 'Borrador generado desde datos registrados.');
  }
  approve(d: AiDraft): void {
    if (!this.canApprove() || d.status !== 'BORRADOR' || this.working()) return;
    if (!confirm('¿Confirmas que revisaste el contenido y deseas aprobarlo profesionalmente?'))
      return;
    this.run(this.api.approve(d.id, d.version), 'Borrador aprobado y registrado en auditoría.');
  }
  reject(d: AiDraft): void {
    if (!this.canApprove() || d.status !== 'BORRADOR' || this.working()) return;
    const reason = prompt('Indica brevemente qué debe corregirse:');
    if (!reason?.trim()) return;
    if (reason.trim().length > 500) {
      this.error.set('El motivo del rechazo no puede superar los 500 caracteres.');
      return;
    }
    this.run(this.api.reject(d.id, d.version, reason.trim()), 'Borrador rechazado.');
  }
  label(v: string): string {
    return v.replaceAll('_', ' ').toLowerCase();
  }
  private run(request: Observable<AiDraft>, message: string): void {
    if (this.working()) return;
    this.working.set(true);
    this.error.set('');
    this.success.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.working.set(false);
        this.success.set(message);
        const e = this.selected();
        if (e) this.select(e);
      },
      error: (e: unknown) => {
        this.working.set(false);
        this.error.set(this.errors.toUserMessage(e, 'No se pudo completar la acción.'));
      },
    });
  }
}
