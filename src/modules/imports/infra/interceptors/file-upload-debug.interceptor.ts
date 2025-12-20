import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class FileUploadDebugInterceptor implements NestInterceptor {
  private readonly logger = new Logger('FileUploadDebug');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    
    // Log detalhado da requisição
    this.logger.debug('=== REQUEST DEBUG ===');
    this.logger.debug(`Method: ${request.method}`);
    this.logger.debug(`URL: ${request.url}`);
    this.logger.debug(`Content-Type: ${request.headers['content-type']}`);
    this.logger.debug(`Headers: ${JSON.stringify(request.headers, null, 2)}`);
    this.logger.debug(`Body keys: ${Object.keys(request.body || {})}`);
    this.logger.debug(`Files: ${JSON.stringify(request.files || {})}`);
    this.logger.debug(`File (single): ${JSON.stringify(request.file || 'null')}`);
    this.logger.debug(`Raw body type: ${typeof request.body}`);
    this.logger.debug('===================');

    return next.handle().pipe(
      tap(() => {
        this.logger.debug('Response sent');
      }),
    );
  }
}



