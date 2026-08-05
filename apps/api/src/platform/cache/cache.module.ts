import { Global, Module } from "@nestjs/common";
import { CacheController } from "./cache.controller.js";
import { CacheService } from "./cache.service.js";
import { RedisRespClient } from "./redis-resp-client.js";

@Global()
@Module({
  controllers: [CacheController],
  providers: [RedisRespClient, CacheService],
  exports: [RedisRespClient, CacheService],
})
export class CacheModule {}
