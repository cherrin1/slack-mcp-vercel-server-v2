export default function handler(req, res) {
  console.log('Token endpoint called with method:', req.method);
  console.log('Body:', req.body);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Handle both JSON and form-encoded data
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      // If JSON parsing fails, treat as form data
      const params = new URLSearchParams(body);
      body = Object.fromEntries(params);
    }
  }

  const { grant_type, code, client_id } = body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  if (!code) {
    return res.status(400).json({ error: 'authorization_code is required' });
  }

  const tokenResponse = {
    access_token: 'slack_mcp_token_' + Date.now(),
    token_type: 'bearer',
    expires_in: 3600,
    scope: 'read write'
  };

  console.log('Returning token:', tokenResponse);
  return res.status(200).json(tokenResponse);
}
