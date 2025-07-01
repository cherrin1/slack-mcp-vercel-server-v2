import { createHash, createHmac } from 'crypto';

// Temporary in-memory storage for testing
const tokenStore = new Map();

export class TokenManager {
  constructor() {
    this.secretKey = process.env.OAUTH_SECRET_KEY || 'default-secret-key-for-testing';
  }

  // Generate a secure user ID from OAuth state/session
  generateUserId(sessionData) {
    return createHash('sha256')
      .update(sessionData + this.secretKey)
      .digest('hex')
      .substring(0, 16);
  }

  // Store user's Slack token (fallback to memory)
  async storeUserToken(userId, slackToken) {
    try {
      // Try Vercel KV first
      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        const { kv } = await import('@vercel/kv');
        await kv.set(`slack_token:${userId}`, slackToken, { ex: 86400 * 30 }); // 30 days
        console.log('Token stored in Vercel KV');
        return true;
      } else {
        // Fallback to memory (for testing)
        tokenStore.set(`slack_token:${userId}`, {
          token: slackToken,
          expires: Date.now() + (86400 * 30 * 1000) // 30 days
        });
        console.log('Token stored in memory (fallback)');
        return true;
      }
    } catch (error) {
      console.error('Failed to store user token:', error);
      // Fallback to memory even if KV fails
      tokenStore.set(`slack_token:${userId}`, {
        token: slackToken,
        expires: Date.now() + (86400 * 30 * 1000)
      });
      console.log('Token stored in memory (KV failed)');
      return true;
    }
  }

  // Retrieve user's Slack token
  async getUserToken(userId) {
    try {
      // Try Vercel KV first
      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        const { kv } = await import('@vercel/kv');
        const token = await kv.get(`slack_token:${userId}`);
        if (token) {
          console.log('Token retrieved from Vercel KV');
          return token;
        }
      }
      
      // Fallback to memory
      const stored = tokenStore.get(`slack_token:${userId}`);
      if (stored && stored.expires > Date.now()) {
        console.log('Token retrieved from memory (fallback)');
        return stored.token;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to retrieve user token:', error);
      
      // Try memory fallback
      const stored = tokenStore.get(`slack_token:${userId}`);
      if (stored && stored.expires > Date.now()) {
        console.log('Token retrieved from memory (after KV error)');
        return stored.token;
      }
      
      return null;
    }
  }

  // Generate a signed access token that includes user ID
  generateAccessToken(userId) {
    const payload = {
      userId,
      timestamp: Date.now()
    };
    
    const payloadString = JSON.stringify(payload);
    const signature = createHmac('sha256', this.secretKey)
      .update(payloadString)
      .digest('hex');
    
    return Buffer.from(payloadString + '.' + signature).toString('base64');
  }

  // Verify and decode access token
  verifyAccessToken(accessToken) {
    try {
      const decoded = Buffer.from(accessToken, 'base64').toString();
      const [payloadString, signature] = decoded.split('.');
      
      const expectedSignature = createHmac('sha256', this.secretKey)
        .update(payloadString)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return null;
      }
      
      const payload = JSON.parse(payloadString);
      
      // Check if token is not too old (24 hours)
      if (Date.now() - payload.timestamp > 86400000) {
        return null;
      }
      
      return payload;
    } catch (error) {
      console.error('Failed to verify access token:', error);
      return null;
    }
  }
}
