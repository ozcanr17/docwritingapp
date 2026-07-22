import { Module } from "@nestjs/common";
import { WorkManagementController } from "./work-management.controller";
import { WorkManagementService } from "./work-management.service";

@Module({
  controllers: [WorkManagementController],
  providers: [WorkManagementService],
})
export class WorkManagementModule {}
