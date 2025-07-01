export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const baseUrl = `https://${req.headers.host}`;
  
  const config = {
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    client_id: "slack-mcp-server",
    scopes: ["read", "write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"]
  };

  res.status(200).json(config);
}
