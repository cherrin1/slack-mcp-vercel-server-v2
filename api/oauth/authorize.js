export default function handler(req, res) {
  console.log('Authorize endpoint called with:', req.query);
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { client_id, redirect_uri, scope, state } = req.query;
  
  if (!redirect_uri) {
    return res.status(400).json({ error: 'redirect_uri is required' });
  }

  try {
    const authCode = 'slack_mcp_auth_' + Date.now();
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', authCode);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }
    
    console.log('Redirecting to:', redirectUrl.toString());
    return res.redirect(302, redirectUrl.toString());
  } catch (error) {
    console.error('Error in authorize endpoint:', error);
    return res.status(400).json({ error: 'Invalid redirect_uri' });
  }
}
