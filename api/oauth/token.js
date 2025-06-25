export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tokenResponse = {
    access_token: 'slack_mcp_token_' + Date.now(),
    token_type: 'bearer',
    expires_in: 3600,
    scope: 'read write'
  };

  res.status(200).json(tokenResponse);
}
