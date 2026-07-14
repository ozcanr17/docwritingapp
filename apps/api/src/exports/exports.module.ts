import { Module } from "@nestjs/common";
import { ExportQueue } from "./export-queue";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  controllers: [ExportsController],
  providers: [ExportsService, ExportQueue],
  exports: [ExportsService],
})
export class ExportsModule {}
