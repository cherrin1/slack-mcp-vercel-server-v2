import { TokenManager } from '../../lib/token-manager.js';

export default async function handler(req, res) {
  console.log('Token endpoint called with method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tokenManager = new TokenManager();

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

  try {
    // Verify the authorization code and extract user ID
    const tokenPayload = tokenManager.verifyAccessToken(code);
    
    if (!tokenPayload) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    // Verify that we have a stored token for this user
    const storedToken = await tokenManager.getUserToken(tokenPayload.userId);
    
    if (!storedToken) {
      return res.status(400).json({ error: 'token_not_found' });
    }

    // Generate a new access token for ongoing use
    const accessToken = tokenManager.generateAccessToken(tokenPayload.userId);

    const tokenResponse = {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 86400, // 24 hours
      scope: 'read write'
    };

    console.log('Successfully issued token for user:', tokenPayload.userId);
    return res.status(200).json(tokenResponse);

  } catch (error) {
    console.error('Error in token endpoint:', error);
    return res.status(500).json({ error: 'server_error' });
  }
}
