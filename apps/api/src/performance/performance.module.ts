import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PerformanceController } from "./performance.controller";
import { PerformanceInterceptor } from "./performance.interceptor";

@Module({
  controllers: [PerformanceController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: PerformanceInterceptor }],
})
export class PerformanceModule {}
