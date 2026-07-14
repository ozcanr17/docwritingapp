import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { FastifyRequest } from "fastify";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { SESSION_COOKIE, SessionUser } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<FastifyRequest & { sessionUser?: SessionUser }>();
    const token = extractToken(request);
    if (!token) throw new UnauthorizedException("Missing session token");
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token);
      request.sessionUser = { userId: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid session token");
    }
  }
}

export function extractToken(request: { cookies?: Record<string, string | undefined>; headers: { authorization?: string } }): string | null {
  const cookieToken = request.cookies?.[SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}
