// Simple root handler that redirects to MCP server info
export default function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // For root path, show simple server info
  if (req.url === '/') {
    return res.status(200).json({
      name: "Slack MCP Server",
      description: "Model Context Protocol server for Slack integration",
      version: "1.0.0",
      status: "running",
      endpoints: {
        mcp: "/api/mcp",
        oauth_config: "/api/oauth/config",
        oauth_authorize: "/api/oauth/authorize",
        test: "/api/test"
      },
      documentation: "Visit /api/mcp for full server capabilities"
    });
  }

  // For other paths, redirect to MCP server
  return res.redirect(302, '/api/mcp');
}
