import { Global, Module } from "@nestjs/common";
import { S3CompatibleSigner } from "./s3-compatible-signer.js";
import { StorageController } from "./storage.controller.js";
import { StorageService } from "./storage.service.js";

@Global()
@Module({
  controllers: [StorageController],
  providers: [S3CompatibleSigner, StorageService],
  exports: [S3CompatibleSigner, StorageService],
})
export class StorageModule {}
