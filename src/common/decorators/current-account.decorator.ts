import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { LoginAccountContext } from '../interfaces/login-account-context';

/**
 * 取出全局 Guard 已经解析好的登录账号，业务代码不再自己拆 token。
 */
export const CurrentAccount = createParamDecorator((data: unknown, executionContext: ExecutionContext): LoginAccountContext => {
  const request = executionContext.switchToHttp().getRequest();
  return request.loginAccountContext as LoginAccountContext;
});
