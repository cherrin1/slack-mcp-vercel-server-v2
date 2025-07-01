export class SlackClient {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://slack.com/api';
    this.isUserToken = token && token.startsWith('xoxp-');
    this.isBotToken = token && token.startsWith('xoxb-');
  }

  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    
    // Add parameters to URL for GET requests
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      // Provide more helpful error messages for user tokens
      if (data.error === 'not_allowed_token_type' && this.isUserToken) {
        throw new Error(`This API method (${endpoint}) requires a bot token, but you're using a user token. Some features may be limited.`);
      }
      if (data.error === 'missing_scope') {
        throw new Error(`Missing required permission scope for ${endpoint}. Please check your token permissions.`);
      }
      if (data.error === 'invalid_auth') {
        throw new Error(`Invalid authentication. Your token may have expired or been revoked.`);
      }
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data;
  }

  async postMessage(channel, text, options = {}) {
    const url = `${this.baseUrl}/chat.postMessage`;
    
    const body = new URLSearchParams({
      channel,
      text,
      ...options
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data;
  }

  // Helper method to check what type of token we have
  getTokenType() {
    if (this.isUserToken) return 'user';
    if (this.isBotToken) return 'bot';
    return 'unknown';
  }
}
