import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { apiEnv } from "../env";
import { SESSION_COOKIE } from "./auth.types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") return true;
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (request.headers.authorization?.startsWith("Bearer ")) return true;
    if (!request.cookies?.[SESSION_COOKIE]) return true;
    if (request.headers["sec-fetch-site"] === "cross-site") {
      throw new ForbiddenException("Cross-site request rejected");
    }
    const origin = request.headers.origin;
    if (!origin) return true;
    const allowedOrigins = new Set([
      apiEnv().APP_BASE_URL,
      ...apiEnv().CORS_ALLOWED_ORIGINS.split(",").map((value) => value.trim()),
      "tauri://localhost",
      "http://tauri.localhost",
      "https://tauri.localhost",
    ]);
    if (!allowedOrigins.has(origin)) throw new ForbiddenException("Request origin rejected");
    return true;
  }
}
