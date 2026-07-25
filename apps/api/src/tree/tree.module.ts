import { Module } from "@nestjs/common";
import { TreeController } from "./tree.controller";
import { TreeService } from "./tree.service";
import { ProjectKeyService } from "../tenancy/project-key.service";

@Module({
  controllers: [TreeController],
  providers: [TreeService, ProjectKeyService],
  exports: [TreeService],
})
export class TreeModule {}
