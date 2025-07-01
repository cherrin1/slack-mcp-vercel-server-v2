import { kv } from '@vercel/kv';
import { createHash, createHmac } from 'crypto';

export class TokenManager {
  constructor() {
    this.secretKey = process.env.OAUTH_SECRET_KEY || 'default-secret-key';
  }

  // Generate a secure user ID from OAuth state/session
  generateUserId(sessionData) {
    return createHash('sha256')
      .update(sessionData + this.secretKey)
      .digest('hex')
      .substring(0, 16);
  }

  // Store user's Slack token
  async storeUserToken(userId, slackToken) {
    try {
      console.log('Storing token for user:', userId);
      await kv.set(`slack_token:${userId}`, slackToken, { ex: 86400 * 30 }); // 30 days
      console.log('Token stored successfully in KV');
      return true;
    } catch (error) {
      console.error('Failed to store user token:', error);
      return false;
    }
  }

  // Retrieve user's Slack token
  async getUserToken(userId) {
    try {
      console.log('Retrieving token for user:', userId);
      const token = await kv.get(`slack_token:${userId}`);
      console.log('Token retrieved:', token ? 'Found' : 'Not found');
      return token;
    } catch (error) {
      console.error('Failed to retrieve user token:', error);
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
      
      if (!payloadString || !signature) {
        console.log('Invalid token format');
        return null;
      }
      
      const expectedSignature = createHmac('sha256', this.secretKey)
        .update(payloadString)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.log('Token signature verification failed');
        return null;
      }
      
      const payload = JSON.parse(payloadString);
      
      // Check if token is not too old (24 hours)
      if (Date.now() - payload.timestamp > 86400000) {
        console.log('Token expired');
        return null;
      }
      
      console.log('Token verified successfully for user:', payload.userId);
      return payload;
    } catch (error) {
      console.error('Failed to verify access token:', error);
      return null;
    }
  }
}
