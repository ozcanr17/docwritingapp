import { Module } from "@nestjs/common";
import { BaselinesController } from "./baselines.controller";
import { BaselinesService } from "./baselines.service";

@Module({
  controllers: [BaselinesController],
  providers: [BaselinesService],
  exports: [BaselinesService],
})
export class BaselinesModule {}
