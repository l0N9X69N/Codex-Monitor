export function installProcessSafety({
  guard,
  processRef = process,
  onSignal = () => {},
  onFatal = () => {}
} = {}) {
  if (!guard) throw new Error('installProcessSafety requires a TerminalGuard');

  const handlers = new Map();
  const add = (event, handler) => {
    processRef.on(event, handler);
    handlers.set(event, handler);
  };

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    add(signal, () => {
      guard.restore();
      onSignal(signal);
    });
  }

  add('uncaughtException', (error) => {
    guard.restore();
    onFatal(error, 'uncaughtException');
  });

  add('unhandledRejection', (reason) => {
    guard.restore();
    const error = reason instanceof Error ? reason : new Error(String(reason));
    onFatal(error, 'unhandledRejection');
  });

  return function disposeProcessSafety() {
    for (const [event, handler] of handlers) {
      processRef.off(event, handler);
    }
    handlers.clear();
  };
}
