export function processExitCode(result) {
  if (result.error) throw result.error;
  return result.status ?? 1;
}
