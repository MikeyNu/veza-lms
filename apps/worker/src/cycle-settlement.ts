export async function settleProcessorCycle<TValues extends readonly unknown[]>(
  tasks: { readonly [TIndex in keyof TValues]: Promise<TValues[TIndex]> },
): Promise<TValues> {
  const settled = await Promise.allSettled(tasks);
  const failures = settled
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(failures, "worker-processor-cycle-failed");
  }
  return settled.map(
    (result) => (result as PromiseFulfilledResult<unknown>).value,
  ) as unknown as TValues;
}
