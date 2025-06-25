import { SlackClient } from '../../lib/slack-client.js';

// For Vercel serverless function
export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ 
      message: 'Slack MCP Server for ChatGPT Source Connection',
      status: 'running',
      tools: [
        'slack_list_channels',
        'slack_search_messages', 
        'slack_channel_history',
        'slack_send_message',
        'slack_get_users',
        'slack_get_user_info',
        'slack_get_channel_info',
        'slack_get_thread_replies'
      ],
      version: '0.1.0'
    });
  }

  if (req.method === 'POST') {
    try {
      const { method, params } = req.body;
      
      if (method === 'call_tool') {
        // Check for Slack token
        const token = process.env.SLACK_BOT_TOKEN;
        if (!token) {
          return res.status(500).json({ 
            error: 'SLACK_BOT_TOKEN environment variable not configured' 
          });
        }

        // Initialize Slack client
        const slackClient = new SlackClient(token);
        const { name, arguments: args } = params;

        try {
          switch (name) {
            case 'slack_list_channels':
              return await handleListChannels(slackClient, args, res);
            
            case 'slack_search_messages':
              return await handleSearchMessages(slackClient, args, res);
            
            case 'slack_channel_history':
              return await handleChannelHistory(slackClient, args, res);
            
            case 'slack_send_message':
              return await handleSendMessage(slackClient, args, res);
            
            case 'slack_get_users':
              return await handleGetUsers(slackClient, args, res);
            
            case 'slack_get_user_info':
              return await handleGetUserInfo(slackClient, args, res);
            
            case 'slack_get_channel_info':
              return await handleGetChannelInfo(slackClient, args, res);
            
            case 'slack_get_thread_replies':
              return await handleGetThreadReplies(slackClient, args, res);
            
            default:
              return res.status(400).json({ 
                error: `Unknown tool: ${name}`,
                available_tools: [
                  'slack_list_channels',
                  'slack_search_messages',
                  'slack_channel_history',
                  'slack_send_message',
                  'slack_get_users',
                  'slack_get_user_info',
                  'slack_get_channel_info',
                  'slack_get_thread_replies'
                ]
              });
          }
        } catch (slackError) {
          console.error('Slack API Error:', slackError.message);
          return res.status(500).json({ 
            error: `Slack API Error: ${slackError.message}` 
          });
        }
      }
      
      return res.status(400).json({ 
        error: 'Unknown method. Expected method: "call_tool"' 
      });
      
    } catch (error) {
      console.error('Request processing error:', error);
      return res.status(500).json({ 
        error: `Server error: ${error.message}` 
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Tool handler functions
async function handleListChannels(slackClient, args, res) {
  const data = await slackClient.makeRequest('conversations.list', {
    types: args.types || 'public_channel,private_channel',
    limit: args.limit || 100,
    exclude_archived: args.exclude_archived !== false
  });

  const channels = data.channels.map(channel => ({
    id: channel.id,
    name: channel.name,
    is_private: channel.is_private,
    is_member: channel.is_member,
    is_archived: channel.is_archived,
    topic: channel.topic?.value || 'No topic set',
    purpose: channel.purpose?.value || 'No purpose set',
    member_count: channel.num_members,
    created: new Date(channel.created * 1000).toISOString(),
    creator: channel.creator
  }));

  return res.status(200).json({
    content: [{
      type: 'text',
      text: `Found ${channels.length} channels:\n\n${JSON.stringify(channels, null, 2)}`
    }]
  });
}

async function handleSearchMessages(slackClient, args, res) {
  if (!args.query) {
    return res.status(400).json({ error: 'Query parameter is required for search' });
  }

  const data = await slackClient.makeRequest('search.messages', {
    query: args.query,
    count: args.count || 20,
    sort: args.sort || 'timestamp',
    sort_dir: args.sort_dir || 'desc'
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
    content: [{
      type: 'text',
      text: `Found ${messages.length} messages matching "${args.query}":\n\n${JSON.stringify(messages, null, 2)}`
    }]
  });
}

async function handleChannelHistory(slackClient, args, res) {
  if (!args.channel) {
    return res.status(400).json({ error: 'Channel parameter is required' });
  }

  let channel = args.channel;
  
  // Handle channel names with # prefix
  if (channel.startsWith('#')) {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel'
    });
    const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
    if (foundChannel) {
      channel = foundChannel.id;
    }
  }

  const data = await slackClient.makeRequest('conversations.history', {
    channel: channel,
    limit: args.limit || 50,
    oldest: args.oldest,
    latest: args.latest,
    include_all_metadata: args.include_all_metadata || false
  });

  const messages = data.messages.map(message => ({
    user: message.user,
    text: message.text,
    timestamp: message.ts,
    date: new Date(parseFloat(message.ts) * 1000).toISOString(),
    type: message.type,
    subtype: message.subtype,
    thread_ts: message.thread_ts,
    reply_count: message.reply_count || 0,
    reactions: message.reactions || []
  }));

  return res.status(200).json({
    content: [{
      type: 'text',
      text: `Channel history for ${args.channel} (${messages.length} messages):\n\n${JSON.stringify(messages, null, 2)}`
    }]
  });
}

async function handleSendMessage(slackClient, args, res) {
  if (!args.channel || !args.text) {
    return res.status(400).json({ error: 'Channel and text parameters are required' });
  }

  let channel = args.channel;
  
  // Handle channel names with # prefix
  if (channel.startsWith('#')) {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel'
    });
    const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
    if (foundChannel) {
      channel = foundChannel.id;
    }
  }

  const data = await slackClient.postMessage(channel, args.text, {
    thread_ts: args.thread_ts,
    unfurl_links: args.unfurl_links !== false
  });

  return res.status(200).json({
    content: [{
      type: 'text',
      text: `Message sent successfully to ${args.channel}. Message timestamp: ${data.ts}`
    }]
  });
}

async function handleGetUsers(slackClient, args, res) {
  const data = await slackClient.makeRequest('users.list', {
    limit: args.limit || 100,
    include_locale: args.include_locale || false
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
      phone: user.profile?.phone,
      is_bot: user.is_bot,
      is_admin: user.is_admin,
      is_owner: user.is_owner,
      is_primary_owner: user.is_primary_owner,
      timezone: user.tz,
      status: user.profile?.status_text || 'No status',
      presence: user.presence
    }));

  return res.status(200).json({
    content: [{
      type: 'text',
      text: `Found ${users.length} users:\n\n${JSON.stringify(users, null, 2)}`
    }]
  });
}

async function handleGetUserInfo(slackClient, args, res) {
  if (!args.user) {
    return res.status(400).json({ error: 'User parameter is required' });
  }

  const data = await slackClient.makeRequest('users.info', {
    user: args.user,
    include_locale: args.include_locale || false
  });

  const user = {
    id: data.user.id,
    name: data.user.name,
    real_name: data.user.real_name,
    display_name: data.user.profile?.display_name || data.user.real_name,
    email: data.user.profile?.email,
    phone: data.user.profile?.phone,
    title: data.user.profile?.title,
    department: data.user.profile?.fields?.department?.value,
    manager: data.user.profile?.fields?.manager?.value,
    is_bot: data.user.is_bot,
    is_admin: data.user.is_admin,
    is_owner: data.user.is_owner,
    is_primary_owner: data.user.is_primary_owner,
    timezone: data.user.tz,
    locale: data.user.locale,
    status: data.user.profile?.status_text || 'No status',
    avatar: data.user.profile?.image_512,
    presence: data.user.presence
  };

  return res.status(200).json({
    content: [{
      type: 'text',
      text: `User information for ${args.user}:\n\n${JSON.stringify(user, null, 2)}`
    }]
  });
}

async function handleGetChannelInfo(slackClient, args, res) {
  if (!args.channel) {
    return res.status(400).json({ error: 'Channel parameter is required' });
  }

  let channel = args.channel;
  
  // Handle channel names with # prefix
  if (channel.startsWith('#')) {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel'
    });
    const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
    if (foundChannel) {
      channel = foundChannel.id;
    }
  }

  const data = await slackClient.makeRequest('conversations.info', {
    channel: channel,
    include_locale: args.include_locale || false
  });

  const channelInfo = {
    id: data.channel.id,
    name: data.channel.name,
    is_private: data.channel.is_private,
    is_archived: data.channel.is_archived,
    is_general: data.channel.is_general,
    is_member: data.channel.is_member,
    topic: data.channel.topic?.value || 'No topic set',
    purpose: data.channel.purpose?.value || 'No purpose set',
    member_count: data.channel.num_members,
    created: new Date(data.channel.created * 1000).toISOString(),
    creator: data.channel.creator,
    locale: data.channel.locale
  };

  return res.status(200).json({
    content: [{
      type: 'text',
      text: `Channel information for ${args.channel}:\n\n${JSON.stringify(channelInfo, null, 2)}`
    }]
  });
}

async function handleGetThreadReplies(slackClient, args, res) {
  if (!args.channel || !args.ts) {
    return res.status(400).json({ error: 'Channel and ts parameters are required' });
  }

  let channel = args.channel;
  
  // Handle channel names with # prefix
  if (channel.startsWith('#')) {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel'
    });
    const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
    if (foundChannel) {
      channel = foundChannel.id;
    }
  }

  const data = await slackClient.makeRequest('conversations.replies', {
    channel: channel,
    ts: args.ts,
    limit: args.limit || 100
  });

  const replies = data.messages.map(message => ({
    user: message.user,
    text: message.text,
    timestamp: message.ts,
    date: new Date(parseFloat(message.ts) * 1000).toISOString(),
    type: message.type,
    subtype: message.subtype,
    thread_ts: message.thread_ts,
    parent_user_id: message.parent_user_id,
    reactions: message.reactions || []
  }));

  return res.status(200).json({
    content: [{
      type: 'text',
      text: `Thread replies for message ${args.ts} in ${args.channel} (${replies.length} replies):\n\n${JSON.stringify(replies, null, 2)}`
    }]
  });
}
