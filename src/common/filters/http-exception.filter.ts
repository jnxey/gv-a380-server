import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ResponseCode } from '../constants';
import { isEmpty, isObject } from '../tools';

/**
 * 把异常统一成 { code, message, data }，HTTP 状态码仍按异常原样返回。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  /**
   * 输出统一失败结构。
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
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
