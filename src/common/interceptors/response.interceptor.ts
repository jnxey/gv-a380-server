import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ResponseCode, ResponseMessage } from '../constants';
import { isObject } from '../tools';

/**
 * 成功响应统一包一层 code、message、data。
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  /**
   * 包装控制器返回值。
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((responseData: unknown) => {
        if (isObject(responseData) && Object.prototype.hasOwnProperty.call(responseData, 'code')) {
          return responseData;
        }
        return {
          code: ResponseCode.SUCCESS,
          message: ResponseMessage.SUCCESS,
          data: responseData === undefined ? null : responseData,
        };
      }),
    );
  }
}
