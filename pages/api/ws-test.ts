import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Return a simple script that can be run in browser console
  const script = `
(function() {
  console.log('[WS Test] Starting...');
  
  // Import or define the WebSocket functions inline
  function randomId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
  }
  
  let ws = null;
  let pendingRequests = new Map();
  let connected = false;
  
  function connect(url, token) {
    return new Promise((resolve, reject) => {
      console.log('[WS Test] Connecting to:', url);
      ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('[WS Test] Socket opened');
      };
      
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          console.log('[WS Test] Received:', msg);
          
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            // Send connect request
            const req = {
              type: 'req',
              id: randomId(),
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: { id: 'cli', version: '1.0', platform: 'web', mode: 'operator' },
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                auth: token ? { token } : {},
                locale: 'en-US',
                userAgent: 'hypercho-app/1.0',
                device: { id: 'test-' + randomId(), publicKey: '', signature: '', signedAt: Date.now(), nonce: '' }
              }
            };
            ws.send(JSON.stringify(req));
            return;
          }
          
          if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
            connected = true;
            console.log('[WS Test] Connected!');
            resolve();
            return;
          }
          
          if (msg.type === 'res' && msg.id) {
            const pending = pendingRequests.get(msg.id);
            if (pending) {
              pendingRequests.delete(msg.id);
              if (msg.ok) {
                pending.resolve(msg.payload);
              } else {
                pending.reject(new Error(msg.error || 'Request failed'));
              }
            }
          }
        } catch(e) {
          console.error('[WS Test] Parse error:', e);
        }
      };
      
      ws.onerror = (e) => {
        console.error('[WS Test] Error:', e);
        reject(e);
      };
      
      ws.onclose = (e) => {
        console.log('[WS Test] Closed:', e.code, e.reason);
        connected = false;
      };
    });
  }
  
  function send(method, params) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      const id = randomId();
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ type: 'req', id, method, params }));
      console.log('[WS Test] Sent:', method, params);
      
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Timeout'));
        }
      }, 30000);
    });
  }
  
  // Main test
  async function runTest() {
    try {
      const gatewayUrl = 'ws://127.0.0.1:18789?token=';
      await connect(gatewayUrl, '');
      
      if (!connected) {
        console.log('[WS Test] Failed to connect');
        return;
      }
      
      // Send a chat message
      const result = await send('chat.send', {
        sessionKey: 'agent:main:main',
        message: 'Hello from browser console test!',
        idempotencyKey: 'test-' + Date.now()
      });
      
      console.log('[WS Test] Chat result:', result);
      
      // Close connection
      ws.close();
      console.log('[WS Test] Done!');
    } catch(e) {
      console.error('[WS Test] Failed:', e);
    }
  }
  
  runTest();
})();
  `;
  
  res.setHeader('Content-Type', 'application/javascript');
  res.send(script);
}
