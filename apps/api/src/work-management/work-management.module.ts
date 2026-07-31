import { Module } from "@nestjs/common";
import { WorkManagementController } from "./work-management.controller";
import { WorkManagementService } from "./work-management.service";
import { ProjectKeyService } from "../tenancy/project-key.service";
import { TestExecutionReportService } from "./test-execution-report.service";
import { WorkItemSchemaService } from "./work-item-schema.service";
import { ProjectPlanningService } from "./project-planning.service";

@Module({
  controllers: [WorkManagementController],
  providers: [WorkManagementService, ProjectKeyService, WorkItemSchemaService, TestExecutionReportService, ProjectPlanningService],
})
export class WorkManagementModule {}
