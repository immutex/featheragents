import type { IncomingMessage, ServerResponse } from 'node:http';

function sendUnauthorized(res: ServerResponse): void {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(`${JSON.stringify({ error: 'Unauthorized' })}\n`);
}

export function requireAuth(req: IncomingMessage, res: ServerResponse, token: string): boolean {
  const authorization = req.headers.authorization;
  if (authorization !== `Bearer ${token}`) {
    sendUnauthorized(res);
    return false;
  }

  return true;
}
