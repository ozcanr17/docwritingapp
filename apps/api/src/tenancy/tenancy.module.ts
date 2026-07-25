import { Module } from "@nestjs/common";
import { TenancyController } from "./tenancy.controller";
import { TenancyService } from "./tenancy.service";
import { ProjectKeyService } from "./project-key.service";

@Module({
  controllers: [TenancyController],
  providers: [TenancyService, ProjectKeyService],
  exports: [TenancyService, ProjectKeyService],
})
export class TenancyModule {}
