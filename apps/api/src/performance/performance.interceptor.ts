import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { Observable } from "rxjs";
import { finalize } from "rxjs/operators";
import { httpRequestDuration } from "./performance.metrics";

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const startedAt = process.hrtime.bigint();
    return next.handle().pipe(
      finalize(() => {
        const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        const route = request.routeOptions?.url ?? "unmatched";
        httpRequestDuration.observe(
          { method: request.method, route, status: String(reply.statusCode) },
          elapsed,
        );
      }),
    );
  }
}
