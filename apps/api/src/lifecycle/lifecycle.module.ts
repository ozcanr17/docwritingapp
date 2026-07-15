import { Module } from "@nestjs/common";
import { RowsModule } from "../rows/rows.module";
import { LifecycleController } from "./lifecycle.controller";
import { LifecycleService } from "./lifecycle.service";

@Module({
  imports: [RowsModule],
  controllers: [LifecycleController],
  providers: [LifecycleService],
})
export class LifecycleModule {}
