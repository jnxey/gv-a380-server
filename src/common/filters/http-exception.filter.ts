import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ResponseCode } from '../constants';
import { isEmpty, isObject } from '../tools';

/**
 * 把异常统一成 { code, message, data }，HTTP 状态码仍按异常原样返回。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /**
   * 输出统一失败结构。非业务异常会打日志，避免只看到「系统异常」却没有堆栈。
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const httpHost = host.switchToHttp();
    const response = httpHost.getResponse<Response>();
    const request = httpHost.getRequest<Request>();
    if (this.isFileTooLarge(exception)) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: ResponseCode.FAIL,
        message: '图片不能超过5MB',
        data: null,
      });
      return;
    }
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = this.resolveMessage(exception);
    // 非 HttpException（如连库失败）原先只回「系统异常」且不打日志，这里补上。
    if (!(exception instanceof HttpException)) {
      const requestPath = `${request.method || ''} ${request.originalUrl || request.url || ''}`.trim();
      this.logger.error(`系统异常 ${requestPath}`, exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(statusCode).json({
      code: ResponseCode.FAIL,
      message,
      data: null,
    });
  }

  /**
   * multer 在文件超过上限时抛出的不是 HttpException。
   */
  private isFileTooLarge(exception: unknown): boolean {
    if (!isObject(exception)) {
      return false;
    }
    const errorCode = (exception as { code?: string }).code;
    return errorCode === 'LIMIT_FILE_SIZE';
  }

  /**
   * 从异常对象中取出可读提示。
   */
  private resolveMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        return exceptionResponse;
      }
      if (isObject(exceptionResponse)) {
        const responseBody = exceptionResponse as { message?: string | string[] };
        if (Array.isArray(responseBody.message) && responseBody.message.length > 0) {
          return responseBody.message.join('；');
        }
        if (!isEmpty(responseBody.message) && typeof responseBody.message === 'string') {
          return responseBody.message;
        }
      }
      return exception.message;
    }
    return '系统异常';
  }
}
