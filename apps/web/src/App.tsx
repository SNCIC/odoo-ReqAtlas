import { useEffect, useState, type JSX } from 'react';
import type { HealthPayload } from '@reqatlas/contracts';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; payload: HealthPayload }
  | { status: 'error'; message: string };

export function App(): JSX.Element {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/health', { signal: controller.signal })
      .then((response) => response.json() as Promise<{ data: HealthPayload }>)
      .then((body) => setHealth({ status: 'ok', payload: body.data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({
          status: 'error',
          message: error instanceof Error ? error.message : 'unknown error',
        });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="app">
      <h1>ReqAtlas · 需求调研工作台</h1>
      <p className="subtitle">M1 工程底座 · 最小可运行页面</p>
      <section className="probe" aria-label="健康探针">
        <h2>API 健康探针</h2>
        {health.status === 'loading' && <p>探测中…</p>}
        {health.status === 'error' && <p className="probe-error">探针失败：{health.message}</p>}
        {health.status === 'ok' && (
          <ul>
            <li>status: {health.payload.status}</li>
            <li>service: {health.payload.service}</li>
            <li>version: {health.payload.version}</li>
            <li>uptime: {health.payload.uptimeSeconds}s</li>
          </ul>
        )}
      </section>
    </main>
  );
}
