BEGIN;

GRANT EXECUTE ON FUNCTION app.refresh_core_metrics(uuid,uuid) TO veza_worker;
GRANT EXECUTE ON FUNCTION app.refresh_due_core_metrics(text,integer) TO veza_worker;

COMMIT;
