import { Module } from "@nestjs/common";
import { WorkManagementController } from "./work-management.controller";
import { WorkManagementService } from "./work-management.service";
import { ProjectKeyService } from "../tenancy/project-key.service";

@Module({
  controllers: [WorkManagementController],
  providers: [WorkManagementService, ProjectKeyService],
})
export class WorkManagementModule {}
