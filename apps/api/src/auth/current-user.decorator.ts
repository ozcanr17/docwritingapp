import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { SessionUser } from "./auth.types";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const request = ctx.switchToHttp().getRequest<{ sessionUser: SessionUser }>();
  return request.sessionUser;
});
