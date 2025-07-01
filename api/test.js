export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Test basic environment
    const environment = {
      hasKvUrl: !!process.env.KV_REST_API_URL,
      hasKvToken: !!process.env.KV_REST_API_TOKEN,
      hasOauthSecret: !!process.env.OAUTH_SECRET_KEY,
      hasSlackToken: !!process.env.SLACK_USER_TOKEN,
      nodeVersion: process.version,
      platform: process.platform,
      vercelEnv: process.env.VERCEL_ENV
    };

    console.log('Environment check:', environment);

    // Test KV connection directly
    let kvTest = 'Not tested';
    try {
      const { kv } = await import('@vercel/kv');
      await kv.set('test-key', 'test-value', { ex: 60 });
      const retrieved = await kv.get('test-key');
      kvTest = retrieved === 'test-value' ? '✅ Working' : '❌ Value mismatch';
    } catch (kvError) {
      console.error('KV test error:', kvError);
      kvTest = `❌ Error: ${kvError.message}`;
    }

    // Test Slack token if provided
    let slackTest = 'No token provided';
    if (process.env.SLACK_USER_TOKEN) {
      try {
        const response = await fetch('https://slack.com/api/auth.test', {
          headers: {
            'Authorization': `Bearer ${process.env.SLACK_USER_TOKEN}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        });
        const data = await response.json();
        slackTest = data.ok ? `✅ Valid - ${data.team}` : `❌ Invalid: ${data.error}`;
      } catch (slackError) {
        slackTest = `❌ Error: ${slackError.message}`;
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'System diagnostics complete',
      timestamp: new Date().toISOString(),
      tests: {
        environment: '✅ Working',
        kvStorage: kvTest,
        slackToken: slackTest
      },
      environment,
      debug: {
        envVars: Object.keys(process.env).filter(key => 
          key.startsWith('KV_') || 
          key.startsWith('OAUTH_') || 
          key.startsWith('SLACK_') ||
          key.startsWith('VERCEL_')
        )
      }
    });
    
  } catch (error) {
    console.error('Test failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}
