import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  type ExceptionFilter,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

interface ValidationErrorBody {
  readonly message?: string | readonly string[];
  readonly error?: string;
  readonly statusCode?: number;
}

function codeFor(status: number): string {
  if (status === 400) return "request.invalid";
  if (status === 401) return "authentication.required";
  if (status === 403) return "authorization.denied";
  if (status === 404) return "resource.not-found";
  if (status === 409) return "resource.conflict";
  if (status === 412) return "concurrency.precondition-failed";
  if (status === 413) return "request.too-large";
  if (status === 422) return "request.unprocessable";
  if (status === 429) return "quota.exceeded";
  if (status === 503) return "dependency.unavailable";
  return status >= 500 ? "platform.internal-error" : "request.failed";
}

function titleFor(status: number): string {
  return HttpStatus[status]?.toString().replaceAll("_", " ").toLowerCase() ?? "request failed";
}

@Injectable()
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest & { correlationId?: string }>();
    const reply = context.getResponse<FastifyReply>();
    let status = 500;
    let detail = "The platform could not complete the request.";
    let validationErrors: readonly string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "string") detail = response;
      else if (response && typeof response === "object") {
        const body = response as ValidationErrorBody;
        if (Array.isArray(body.message)) {
          validationErrors = body.message;
          detail = "One or more request fields are invalid.";
        } else if (typeof body.message === "string") detail = body.message;
      }
    } else if (exception && typeof exception === "object") {
      const databaseError = exception as { code?: string; message?: string };
      if (databaseError.code === "42501") {
        status = 403;
        detail = "The requested operation is outside the active tenant or policy scope.";
      } else if (databaseError.code === "23505") {
        status = 409;
        detail = "A conflicting record already exists.";
      } else if (databaseError.code === "23503") {
        status = 409;
        detail = "The requested operation conflicts with related records.";
      }
    }

    const correlationId = request.correlationId ?? request.headers["x-correlation-id"]?.toString();
    const envelope = {
      type: `https://docs.veza.app/errors/${codeFor(status)}`,
      title: titleFor(status),
      status,
      code: codeFor(status),
      detail,
      instance: request.url,
      correlationId: correlationId ?? "unavailable",
      timestamp: new Date().toISOString(),
      ...(validationErrors ? { errors: validationErrors } : {}),
    };
    if (status >= 500) {
      process.stderr.write(
        `${JSON.stringify({
          level: "error",
          message: "API request failed",
          service: "veza-api",
          timestamp: envelope.timestamp,
          status,
          code: envelope.code,
          correlationId: envelope.correlationId,
          method: request.method,
          route: request.routeOptions?.url ?? request.url,
          errorClass: exception instanceof Error ? exception.name : typeof exception,
        })}\n`,
      );
    }
    reply.status(status).header("cache-control", "no-store").send(envelope);
  }
}
