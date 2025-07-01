import { TokenManager } from '../lib/token-manager.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tokenManager = new TokenManager();

  try {
    // Test KV connection
    const testUserId = 'test-user-' + Date.now();
    const testToken = 'xoxp-test-token-' + Date.now();
    
    console.log('Testing KV storage...');
    const stored = await tokenManager.storeUserToken(testUserId, testToken);
    
    if (!stored) {
      throw new Error('Failed to store test token');
    }
    
    console.log('Testing KV retrieval...');
    const retrieved = await tokenManager.getUserToken(testUserId);
    
    if (retrieved !== testToken) {
      throw new Error('Retrieved token does not match stored token');
    }
    
    console.log('Testing token generation...');
    const accessToken = tokenManager.generateAccessToken(testUserId);
    const verified = tokenManager.verifyAccessToken(accessToken);
    
    if (!verified || verified.userId !== testUserId) {
      throw new Error('Token generation/verification failed');
    }
    
    return res.status(200).json({
      success: true,
      message: 'All systems working correctly',
      tests: {
        kvStorage: '✅ Working',
        kvRetrieval: '✅ Working', 
        tokenGeneration: '✅ Working',
        tokenVerification: '✅ Working'
      },
      environment: {
        hasKvUrl: !!process.env.KV_REST_API_URL,
        hasKvToken: !!process.env.KV_REST_API_TOKEN,
        hasOauthSecret: !!process.env.OAUTH_SECRET_KEY,
        hasSlackToken: !!process.env.SLACK_USER_TOKEN
      }
    });
    
  } catch (error) {
    console.error('Test failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      environment: {
        hasKvUrl: !!process.env.KV_REST_API_URL,
        hasKvToken: !!process.env.KV_REST_API_TOKEN,
        hasOauthSecret: !!process.env.OAUTH_SECRET_KEY,
        hasSlackToken: !!process.env.SLACK_USER_TOKEN
      }
    });
  }
}
