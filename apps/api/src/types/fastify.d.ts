declare module "fastify" {
  export interface FastifyRouteOptions {
    readonly url?: string;
  }

  export interface FastifyRequest {
    readonly id: string;
    readonly method: string;
    readonly url: string;
    readonly headers: Readonly<Record<string, string | string[] | undefined>>;
    readonly query: unknown;
    readonly body?: unknown;
    readonly ip: string;
    readonly hostname: string;
    readonly routeOptions?: FastifyRouteOptions;
  }

  export interface FastifyReply {
    header(name: string, value: string | number): this;
    status(code: number): this;
    code(code: number): this;
    send(payload?: unknown): unknown;
  }
}
