import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import type { RequestContext } from "@veza/contracts";

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(Object.freeze(context), callback);
  }

  current(): RequestContext | undefined {
    return this.storage.getStore();
  }

  optional(): RequestContext | undefined {
    return this.current();
  }

  require(): RequestContext {
    const context = this.current();
    if (!context) throw new Error("Tenant context is required for this operation");
    return context;
  }
}
