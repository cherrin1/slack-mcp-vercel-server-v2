import { TokenManager } from '../../lib/token-manager.js';

export default async function handler(req, res) {
  console.log('Authorize endpoint called with:', req.method, req.query);
  
  const tokenManager = new TokenManager();

  if (req.method === 'GET') {
    const { client_id, redirect_uri, scope, state } = req.query;
    
    if (!redirect_uri) {
      return res.status(400).json({ error: 'redirect_uri is required' });
    }

    // Show authorization form
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Slack MCP Authorization</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 600px; 
                margin: 50px auto; 
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #333; margin-bottom: 30px; }
            .form-group { margin-bottom: 20px; }
            label { 
                display: block; 
                margin-bottom: 8px; 
                font-weight: 600;
                color: #555;
            }
            input, textarea { 
                width: 100%; 
                padding: 12px; 
                border: 2px solid #ddd; 
                border-radius: 6px;
                font-size: 14px;
                box-sizing: border-box;
            }
            input:focus, textarea:focus {
                border-color: #4CAF50;
                outline: none;
            }
            button { 
                background: #4CAF50; 
                color: white; 
                padding: 14px 24px; 
                border: none; 
                border-radius: 6px; 
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                width: 100%;
            }
            button:hover { background: #45a049; }
            .help-text {
                font-size: 13px;
                color: #666;
                margin-top: 5px;
                line-height: 1.4;
            }
            .warning {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                color: #856404;
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔗 Connect Your Slack Workspace</h1>
            
            <div class="warning">
                <strong>⚠️ Important:</strong> You need a Slack User Token with appropriate permissions. 
                <a href="https://api.slack.com/tutorials/tracks/getting-a-token" target="_blank">Learn how to get one here</a> or find it in your <a href="https://api.slack.com/apps" target="_blank">Slack app settings</a>.
            </div>

            <form method="POST" action="/api/oauth/authorize">
                <input type="hidden" name="redirect_uri" value="${redirect_uri}">
                <input type="hidden" name="state" value="${state || ''}">
                <input type="hidden" name="client_id" value="${client_id || ''}">
                
                <div class="form-group">
                    <label for="slack_token">Slack User Token:</label>
                    <input 
                        type="password" 
                        id="slack_token" 
                        name="slack_token" 
                        placeholder="xoxp-your-user-token-here"
                        required
                    >
                    <div class="help-text">
                        Your user token should start with "xoxp-" and have permissions like 
                        <code>search:read</code>, <code>channels:read</code>, <code>groups:read</code>, <code>users:read</code>, etc.
                        <br><br>
                        <strong>How to get your token:</strong><br>
                        1. Go to <a href="https://api.slack.com/apps" target="_blank">api.slack.com/apps</a><br>
                        2. Select your app (or create one)<br>
                        3. Go to "OAuth & Permissions"<br>
                        4. Copy the "User OAuth Token" (starts with xoxp-)
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="workspace_name">Workspace Name (optional):</label>
                    <input 
                        type="text" 
                        id="workspace_name" 
                        name="workspace_name" 
                        placeholder="My Company Slack"
                    >
                    <div class="help-text">
                        A friendly name to help you identify this connection.
                    </div>
                </div>
                
                <button type="submit">Authorize Access</button>
            </form>
        </div>
    </body>
    </html>
    `;

    return res.status(200).send(html);
  }

  if (req.method === 'POST') {
    const { slack_token, workspace_name, redirect_uri, state, client_id } = req.body;
    
    if (!slack_token || !redirect_uri) {
      return res.status(400).send(`
        <html><body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h2>❌ Missing Required Information</h2>
          <p>Please provide both your Slack token and redirect URI.</p>
          <button onclick="history.back()">Go Back</button>
        </body></html>
      `);
    }

    try {
      // Validate the Slack token by making a test API call
      const testResponse = await fetch('https://slack.com/api/auth.test', {
        headers: {
          'Authorization': `Bearer ${slack_token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      });

      const testData = await testResponse.json();
      
      if (!testData.ok) {
        return res.status(400).send(`
          <html><body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h2>❌ Invalid Slack User Token</h2>
            <p>The token you provided is not valid: ${testData.error}</p>
            <p><strong>Make sure:</strong></p>
            <ul style="text-align: left; display: inline-block;">
              <li>Token starts with "xoxp-"</li>
              <li>Token has required scopes (search:read, channels:read, etc.)</li>
              <li>Token hasn't expired</li>
            </ul>
            <button onclick="history.back()">Go Back</button>
          </body></html>
        `);
      }

      // Generate user ID and store token
      const sessionData = `${testData.team_id}_${testData.user_id}_${Date.now()}`;
      const userId = tokenManager.generateUserId(sessionData);
      
      const stored = await tokenManager.storeUserToken(userId, slack_token);
      
      if (!stored) {
        throw new Error('Failed to store token');
      }

      // Generate authorization code that includes user ID
      const authCode = tokenManager.generateAccessToken(userId);
      
      // Redirect back to ChatGPT with the authorization code
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', authCode);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }
      
      console.log('Successfully stored token for user:', userId);
      console.log('Redirecting to:', redirectUrl.toString());
      
      return res.redirect(302, redirectUrl.toString());

    } catch (error) {
      console.error('Error during authorization:', error);
      return res.status(500).send(`
        <html><body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h2>❌ Authorization Failed</h2>
          <p>There was an error processing your request: ${error.message}</p>
          <button onclick="history.back()">Go Back</button>
        </body></html>
      `);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
