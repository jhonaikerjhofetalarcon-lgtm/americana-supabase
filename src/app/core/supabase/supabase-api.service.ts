import { inject, Injectable } from '@angular/core';
import { from, map, mergeMap } from 'rxjs';
import { Json } from './database.types';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseErrorService, UserFacingError } from './supabase-error.service';

interface RequestOptions<T> {
  readonly errorMessage?: string;
  readonly fallback?: T;
}

@Injectable({ providedIn: 'root' })
export class SupabaseApiService {
  readonly client = inject(SupabaseClientService).client;
  private readonly errors = inject(SupabaseErrorService);

  rpc<T>(name: string, args: Record<string, unknown>, options: RequestOptions<T> = {}) {
    const hasFallback = Object.prototype.hasOwnProperty.call(options, 'fallback');
    const call = this.client.rpc.bind(this.client) as unknown as (
      rpcName: string,
      rpcArgs: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;

    return from(call(name, args)).pipe(map(({ data, error }) => {
      if (error || (data == null && !hasFallback)) {
        this.fail(error, options.errorMessage);
      }
      return (data ?? options.fallback) as T;
    }));
  }

  invoke<T>(name: string, body: Record<string, unknown>, options: RequestOptions<T> = {}) {
    const hasFallback = Object.prototype.hasOwnProperty.call(options, 'fallback');
    return from(this.client.functions.invoke(name, { body })).pipe(
      mergeMap(async ({ data, error }) => {
        if (error) {
          const response = (error as { context?: unknown }).context;
          if (response instanceof Response) {
            const detail = await response.clone().json().catch(() => null) as { message?: string } | null;
            if (detail?.message) throw new Error(detail.message);
          }
          this.fail(error, options.errorMessage);
        }
        if (data == null && !hasFallback) this.fail(data, options.errorMessage);
        return (data ?? options.fallback) as T;
      }),
    );
  }

  toJson(value: object): Json {
    return JSON.parse(JSON.stringify(value)) as Json;
  }

  fail(error: unknown, fallback = 'No se pudo completar la operación.'): never {
    throw new UserFacingError(this.errors.toUserMessage(error, fallback));
  }
}
