import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const res = exception.getResponse() as
      | string
      | { message?: string | string[]; [key: string]: any };

    const message =
      typeof res === 'string'
        ? res
        : Array.isArray(res.message)
        ? res.message.join(', ')
        : res.message || 'Unexpected error';

    let code = 'INTERNAL_SERVER_ERROR';
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        code = 'BAD_REQUEST';
        break;
      case HttpStatus.UNAUTHORIZED:
        code = 'UNAUTHORIZED';
        break;
      case HttpStatus.FORBIDDEN:
        code = 'FORBIDDEN';
        break;
      case HttpStatus.CONFLICT:
        code = 'CONFLICT';
        break;
    }

    response.status(status).json({
      error: {
        code,
        message,
      },
    });
  }
}
