import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { map, type Observable } from 'rxjs';

export interface ApiSuccessResponse<T> {
  data: T;
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T> | T> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T> | T> {
    if (Reflect.getMetadata(SSE_METADATA, context.getHandler()) === true) {
      return next.handle();
    }

    return next.handle().pipe(map((data) => ({ data })));
  }
}
