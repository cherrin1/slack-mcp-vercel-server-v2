import { TokenManager } from '../../lib/token-manager.js';

export default async function handler(req, res) {
  console.log('OAuth authorize endpoint:', req.method, req.url);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { client_id, redirect_uri, scope, state } = req.query;
    
    if (!redirect_uri) {
      return res.status(400).json({ error: 'redirect_uri is required' });
    }

    // Show authorization form
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Connect Slack to Claude</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 500px; 
            margin: 50px auto; 
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-bottom: 20px; text-align: center; }
        .form-group { margin-bottom: 15px; }
        label { 
            display: block; 
            margin-bottom: 5px; 
            font-weight: 600;
            color: #555;
        }
        input { 
            width: 100%; 
            padding: 10px; 
            border: 2px solid #ddd; 
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        input:focus {
            border-color: #4CAF50;
            outline: none;
        }
        button { 
            background: #4CAF50; 
            color: white; 
            padding: 12px 20px; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer;
            font-size: 16px;
            width: 100%;
        }
        button:hover { background: #45a049; }
        .help { 
            font-size: 12px; 
            color: #666; 
            margin-top: 5px; 
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔗 Connect Slack to Claude</h1>
        
        <div class="warning">
            <strong>Setup Required:</strong> You need a Slack User Token. 
            <a href="https://api.slack.com/tutorials/tracks/getting-a-token" target="_blank">Get one here</a>
        </div>

        <form id="authForm" method="POST">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="state" value="${state || ''}">
            <input type="hidden" name="client_id" value="${client_id || ''}">
            
            <div class="form-group">
                <label for="slack_token">Slack User Token:</label>
                <input 
                    type="password" 
                    id="slack_token" 
                    name="slack_token" 
                    placeholder="xoxp-your-token-here"
                    required
                >
                <div class="help">
                    Should start with "xoxp-". Needs scopes: search:read, channels:read, groups:read, users:read
                </div>
            </div>
            
            <button type="submit">Connect to Claude</button>
        </form>
    </div>
</body>
</html>`;

    return res.status(200).send(html);
  }

  if (req.method === 'POST') {
    try {
      const tokenManager = new TokenManager();
      const { slack_token, redirect_uri, state } = req.body;
      
      if (!slack_token || !redirect_uri) {
        return res.status(400).send('Missing required fields');
      }

      // Validate token
      const testResponse = await fetch('https://slack.com/api/auth.test', {
        headers: {
          'Authorization': `Bearer ${slack_token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      });

      const testData = await testResponse.json();
      
      if (!testData.ok) {
        return res.status(400).send(`Invalid token: ${testData.error}`);
      }

      // Store token
      const sessionData = `${testData.team_id}_${testData.user_id}_${Date.now()}`;
      const userId = tokenManager.generateUserId(sessionData);
      
      await tokenManager.storeUserToken(userId, slack_token);
      
      // Generate auth code
      const authCode = tokenManager.generateAccessToken(userId);
      
      // Redirect back to Claude
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', authCode);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }
      
      return res.redirect(302, redirectUrl.toString());

    } catch (error) {
      console.error('OAuth error:', error);
      return res.status(500).send(`Error: ${error.message}`);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
