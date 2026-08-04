import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import type { RequestContext } from "@veza/contracts";

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T { return this.storage.run(Object.freeze(context), callback); }

  require(): RequestContext {
    const context = this.storage.getStore();
    if (!context) throw new Error("Tenant context is required for this operation");
    return context;
  }
}
