import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { Payment } from '../models/finance.models';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { FinanceApiService } from './finance-api.service';

describe('FinanceApiService', () => {
  let service: FinanceApiService;
  let rpc: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    rpc = vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null }));
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client: { rpc } } }],
    });
    service = TestBed.inject(FinanceApiService);
  });

  it('registers an advance with the signed document and current versions', async () => {
    const operationId = '20d1d332-5a31-4b8b-8a8c-a14ebd492e4f';
    await firstValueFrom(
      service.signedAdvance({
        accountId: 7,
        accountVersion: 4,
        planVersion: 2,
        paymentMethodId: 2,
        amount: 150,
        reference: 'YAPE-1',
        signatureData: 'data:image/png;base64,AAAA',
        operationId,
      }),
    );
    expect(rpc).toHaveBeenCalledWith('registrar_adelanto_firmado', {
      datos: {
        accountId: 7,
        accountVersion: 4,
        planVersion: 2,
        paymentMethodId: 2,
        amount: 150,
        reference: 'YAPE-1',
        signatureData: 'data:image/png;base64,AAAA',
        confirmation: true,
        operationId,
      },
    });
  });

  it('uses an idempotency key when registering an expense', async () => {
    const operationId = '1553d2fc-b320-4ba0-9f72-a72ece1153d4';
    await firstValueFrom(
      service.expense(
        {
          category: 'Insumos',
          description: 'Guantes',
          provider: null,
          documentReference: 'YAPE-22',
          paymentMethodId: 2,
          amount: 50,
        },
        operationId,
      ),
    );
    expect(rpc).toHaveBeenCalledWith('registrar_gasto', {
      datos: {
        category: 'Insumos',
        description: 'Guantes',
        provider: null,
        documentReference: 'YAPE-22',
        paymentMethodId: 2,
        amount: 50,
        confirmation: true,
        operationId,
      },
    });
  });

  it('requires confirmation and version when closing cash', async () => {
    await firstValueFrom(service.closeCash(3, 480, 'Conforme', 5));
    expect(rpc).toHaveBeenCalledWith('cerrar_caja', {
      caja_id: 3,
      monto_contado: 480,
      observacion: 'Conforme',
      version_actual: 5,
      confirmacion: true,
    });
  });
  it('envía el motivo, la versión y la confirmación al anular', async () => {
    await firstValueFrom(service.voidPayment(9, 2, 'Cobro duplicado'));
    expect(rpc).toHaveBeenCalledWith('anular_pago_firmado', { datos: {
      paymentId: 9, version: 2, reason: 'Cobro duplicado', confirmation: true,
    } });
  });
  it('exporta el estado y motivo de anulación sin ejecutar fórmulas de Excel', async () => {
    vi.spyOn(service, 'payments').mockReturnValue(of([{
      registeredAt: '2026-09-29', receiptNumber: 'REC-1', patientName: '=SUM(1,1)',
      paymentMethod: 'Efectivo', status: 'ANULADO', amount: 100, voidReason: 'Duplicado', voidedAt: '2026-09-29',
    } as Payment]));
    vi.spyOn(service, 'expenses').mockReturnValue(of([]));
    const blob = await firstValueFrom(service.exportReport('2026-09-29', '2026-09-30'));
    const text = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(text).toContain('"ANULADO"'); expect(text).toContain('"Duplicado"');
    expect(text).toContain('"\'=SUM(1,1)"');
  });
});
