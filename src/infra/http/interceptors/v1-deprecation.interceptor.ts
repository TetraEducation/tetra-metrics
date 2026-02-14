import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { V1_DEPRECATION_HEADERS, isDeprecatedV1Route } from '@/shared/http/v1-deprecation.constants';

@Injectable()
export class V1DeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'http' | 'rpc' | 'ws'>() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const requestPath = request.path ?? request.originalUrl ?? request.url ?? '';

    if (isDeprecatedV1Route(requestPath)) {
      response.setHeader('Deprecation', V1_DEPRECATION_HEADERS.deprecationDate);
      response.setHeader('Sunset', V1_DEPRECATION_HEADERS.sunsetHttpDate);
      response.setHeader(
        'Link',
        `<${V1_DEPRECATION_HEADERS.migrationDocUrl}>; rel="deprecation"`,
      );
    }

    return next.handle();
  }
}
