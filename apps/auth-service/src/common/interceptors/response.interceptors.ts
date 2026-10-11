import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { RAW_RESPONSE_KEY } from "@/common/decorators/raw-response.decorator";

export interface ResponseEnvelope<T> {
  status: number;
  data: T;
}

/**
 * Wraps every successful JSON response as `{ status, data }`.
 *
 * `status` is the real HTTP status code of the response (it was previously
 * hard-coded to 200, so 201/202/503 responses claimed to be 200).
 * Handlers marked with @RawResponse() are returned unwrapped.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ResponseEnvelope<T> | T> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    const response = context.switchToHttp().getResponse<{ statusCode?: number }>();
    return next.handle().pipe(
      map((data) => ({
        status: response?.statusCode ?? 200,
        data,
      })),
    );
  }
}
