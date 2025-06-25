import { SlackClient } from '../../lib/slack-client.js';

// General API server for ChatGPT connector
export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Initialize Slack client
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ 
      error: 'SLACK_BOT_TOKEN not configured' 
    });
  }

  const slackClient = new SlackClient(token);

  try {
    // Route based on URL path
    const path = req.url || '/';

    if (req.method === 'GET') {
      switch (path) {
        case '/':
        case '/api/mcp':
          return res.status(200).json({
            name: "Slack API Server",
            description: "REST API for Slack workspace integration",
            version: "1.0.0",
            endpoints: {
              "GET /channels": "List all channels",
              "GET /users": "List all users", 
              "GET /channels/{channel}/history": "Get channel history",
              "GET /users/{user}": "Get user info",
              "POST /search/messages": "Search messages",
              "POST /channels/{channel}/message": "Send message"
            },
            examples: {
              list_channels: "GET /channels",
              search_messages: "POST /search/messages with {\"query\": \"meeting\"}",
              send_message: "POST /channels/general/message with {\"text\": \"Hello!\"}"
            }
          });

        case '/channels':
          return await listChannels(slackClient, req, res);

        case '/users':
          return await listUsers(slackClient, req, res);

        default:
          // Handle dynamic paths
          if (path.startsWith('/channels/') && path.endsWith('/history')) {
            const channel = path.split('/')[2];
            return await getChannelHistory(slackClient, channel, req, res);
          }
          
          if (path.startsWith('/users/') && path.split('/').length === 3) {
            const user = path.split('/')[2];
            return await getUserInfo(slackClient, user, req, res);
          }
          
          return res.status(404).json({ error: 'Endpoint not found' });
      }
    }

    if (req.method === 'POST') {
      switch (path) {
        case '/search/messages':
          return await searchMessages(slackClient, req, res);

        default:
          // Handle dynamic POST paths
          if (path.startsWith('/channels/') && path.endsWith('/message')) {
            const channel = path.split('/')[2];
            return await sendMessage(slackClient, channel, req, res);
          }
          
          return res.status(404).json({ error: 'Endpoint not found' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

// API endpoint functions
async function listChannels(slackClient, req, res) {
  const { types = 'public_channel,private_channel', limit = 100 } = req.query;
  
  const data = await slackClient.makeRequest('conversations.list', {
    types,
    limit: parseInt(limit)
  });

  const channels = data.channels.map(channel => ({
    id: channel.id,
    name: channel.name,
    is_private: channel.is_private,
    is_member: channel.is_member,
    topic: channel.topic?.value || 'No topic',
    purpose: channel.purpose?.value || 'No purpose',
    member_count: channel.num_members,
    created: new Date(channel.created * 1000).toISOString()
  }));

  return res.status(200).json({
    success: true,
    count: channels.length,
    channels
  });
}

async function listUsers(slackClient, req, res) {
  const { limit = 100 } = req.query;
  
  const data = await slackClient.makeRequest('users.list', {
    limit: parseInt(limit)
  });

  const users = data.members
    .filter(user => !user.deleted)
    .map(user => ({
      id: user.id,
      name: user.name,
      real_name: user.real_name,
      display_name: user.profile?.display_name || user.real_name,
      email: user.profile?.email,
      title: user.profile?.title,
      is_bot: user.is_bot,
      is_admin: user.is_admin,
      timezone: user.tz,
      status: user.profile?.status_text || 'No status'
    }));

  return res.status(200).json({
    success: true,
    count: users.length,
    users
  });
}

async function getChannelHistory(slackClient, channelParam, req, res) {
  const { limit = 50, oldest, latest } = req.query;
  
  let channel = channelParam;
  
  // Handle channel names with # prefix
  if (channel.startsWith('#')) {
    channel = channel.slice(1);
  }
  
  // If not a channel ID, find by name
  if (!channel.startsWith('C')) {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel'
    });
    const foundChannel = channelsData.channels.find(c => c.name === channel);
    if (foundChannel) {
      channel = foundChannel.id;
    } else {
      return res.status(404).json({ 
        error: 'Channel not found',
        channel: channelParam 
      });
    }
  }

  const data = await slackClient.makeRequest('conversations.history', {
    channel,
    limit: parseInt(limit),
    oldest,
    latest
  });

  const messages = data.messages.map(message => ({
    user: message.user,
    text: message.text,
    timestamp: message.ts,
    date: new Date(parseFloat(message.ts) * 1000).toISOString(),
    type: message.type,
    thread_ts: message.thread_ts,
    reply_count: message.reply_count || 0
  }));

  return res.status(200).json({
    success: true,
    channel: channelParam,
    count: messages.length,
    messages
  });
}

async function getUserInfo(slackClient, user, req, res) {
  try {
    const data = await slackClient.makeRequest('users.info', { user });

    const userInfo = {
      id: data.user.id,
      name: data.user.name,
      real_name: data.user.real_name,
      display_name: data.user.profile?.display_name || data.user.real_name,
      email: data.user.profile?.email,
      phone: data.user.profile?.phone,
      title: data.user.profile?.title,
      is_bot: data.user.is_bot,
      is_admin: data.user.is_admin,
      is_owner: data.user.is_owner,
      timezone: data.user.tz,
      status: data.user.profile?.status_text || 'No status',
      avatar: data.user.profile?.image_512
    };

    return res.status(200).json({
      success: true,
      user: userInfo
    });
  } catch (error) {
    return res.status(404).json({ 
      error: 'User not found',
      user: user 
    });
  }
}

async function searchMessages(slackClient, req, res) {
  const { query, count = 20, sort = 'timestamp' } = req.body;
  
  if (!query) {
    return res.status(400).json({ 
      error: 'Query parameter is required in request body' 
    });
  }

  const data = await slackClient.makeRequest('search.messages', {
    query,
    count: parseInt(count),
    sort
  });

  const messages = data.messages.matches.map(match => ({
    channel: match.channel.name,
    channel_id: match.channel.id,
    user: match.username,
    user_id: match.user,
    text: match.text,
    timestamp: match.ts,
    date: new Date(parseFloat(match.ts) * 1000).toISOString(),
    permalink: match.permalink,
    score: match.score
  }));

  return res.status(200).json({
    success: true,
    query,
    count: messages.length,
    messages
  });
}

async function sendMessage(slackClient, channelParam, req, res) {
  const { text, thread_ts } = req.body;
  
  if (!text) {
    return res.status(400).json({ 
      error: 'Text parameter is required in request body' 
    });
  }

  let channel = channelParam;
  
  // Handle channel names
  if (channel.startsWith('#')) {
    channel = channel.slice(1);
  }
  
  // If not a channel ID, find by name
  if (!channel.startsWith('C')) {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel'
    });
    const foundChannel = channelsData.channels.find(c => c.name === channel);
    if (foundChannel) {
      channel = foundChannel.id;
    } else {
      return res.status(404).json({ 
        error: 'Channel not found',
        channel: channelParam 
      });
    }
  }

  const data = await slackClient.postMessage(channel, text, { thread_ts });

  return res.status(200).json({
    success: true,
    message: 'Message sent successfully',
    channel: channelParam,
    timestamp: data.ts,
    message_text: text
  });
}
