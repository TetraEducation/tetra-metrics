import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { V1DeprecationInterceptor } from '@/infra/http/interceptors/v1-deprecation.interceptor';
import {
  V1_DEPRECATION_HEADERS,
  isDeprecatedV1Route,
} from '@/shared/http/v1-deprecation.constants';

describe('V1DeprecationInterceptor', () => {
  const interceptor = new V1DeprecationInterceptor();

  const runInterceptor = (path: string, type: 'http' | 'rpc' = 'http') => {
    const setHeader = jest.fn();
    const context = {
      getType: jest.fn().mockReturnValue(type),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ path }),
        getResponse: jest.fn().mockReturnValue({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    const handler: CallHandler = { handle: () => of({ ok: true }) };
    interceptor.intercept(context, handler).subscribe();
    return setHeader;
  };

  it('aplica headers de depreciação em rota v1 equivalente', () => {
    const setHeader = runInterceptor('/leads/import-one');

    expect(setHeader).toHaveBeenCalledWith('Deprecation', V1_DEPRECATION_HEADERS.deprecationDate);
    expect(setHeader).toHaveBeenCalledWith('Sunset', V1_DEPRECATION_HEADERS.sunsetHttpDate);
    expect(setHeader).toHaveBeenCalledWith(
      'Link',
      `<${V1_DEPRECATION_HEADERS.migrationDocUrl}>; rel="deprecation"`,
    );
  });

  it('não aplica headers em rota v1 sem equivalente v2', () => {
    const setHeader = runInterceptor('/leads/list');
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('não aplica headers fora de contexto HTTP', () => {
    const setHeader = runInterceptor('/leads/import-one', 'rpc');
    expect(setHeader).not.toHaveBeenCalled();
  });
});

describe('isDeprecatedV1Route', () => {
  it('reconhece rotas deprecadas inclusive com querystring', () => {
    expect(isDeprecatedV1Route('/leads/search?email=ana@example.com')).toBe(true);
    expect(isDeprecatedV1Route('/imports/spreadsheet?dryRun=true')).toBe(true);
    expect(isDeprecatedV1Route('/leads/abc123/details')).toBe(true);
  });

  it('não marca rotas sem equivalente v2', () => {
    expect(isDeprecatedV1Route('/leads/export')).toBe(false);
    expect(isDeprecatedV1Route('/leads/funnels/analytics')).toBe(false);
  });
});
