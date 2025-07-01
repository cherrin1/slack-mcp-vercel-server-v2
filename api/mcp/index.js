import { SlackClient } from '../../lib/slack-client.js';
import { TokenManager } from '../../lib/token-manager.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`${req.method} ${req.url}`);

  // Initialize token manager
  const tokenManager = new TokenManager();
  let slackToken = null;

  // Try to get user token from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const accessToken = authHeader.substring(7);
    const tokenPayload = tokenManager.verifyAccessToken(accessToken);
    
    if (tokenPayload) {
      slackToken = await tokenManager.getUserToken(tokenPayload.userId);
      console.log('Using user-specific token');
    }
  }

  // Fallback to environment token
  if (!slackToken) {
    slackToken = process.env.SLACK_USER_TOKEN;
    console.log('Using environment token');
  }

  if (!slackToken) {
    return res.status(401).json({ 
      error: 'No Slack token available',
      message: 'Please configure SLACK_USER_TOKEN or connect via OAuth'
    });
  }

  const slackClient = new SlackClient(slackToken);

  try {
    // Handle MCP tools/list request
    if (req.method === 'POST' && req.body.method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: {
          tools: [
            {
              name: "search_messages",
              description: "Search for messages in Slack channels. Use keywords, @mentions, or #channel references.",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search query (keywords, @user, #channel)"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results (default: 10)",
                    default: 10
                  }
                },
                required: ["query"]
              }
            },
            {
              name: "get_channel_history", 
              description: "Get recent messages from a specific channel",
              inputSchema: {
                type: "object",
                properties: {
                  channel: {
                    type: "string",
                    description: "Channel name (with #) or ID"
                  },
                  limit: {
                    type: "number", 
                    description: "Number of messages to retrieve (default: 20)",
                    default: 20
                  }
                },
                required: ["channel"]
              }
            },
            {
              name: "list_channels",
              description: "List available Slack channels",
              inputSchema: {
                type: "object",
                properties: {
                  types: {
                    type: "string",
                    description: "Channel types to include",
                    default: "public_channel,private_channel"
                  }
                }
              }
            }
          ]
        }
      });
    }

    // Handle MCP initialize request
    if (req.method === 'POST' && req.body.method === 'initialize') {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "Slack MCP Server",
            version: "1.0.0"
          }
        }
      });
    }

    // Handle MCP server info requests
    if (req.method === 'GET' && (req.url === '/' || req.url === '/api/mcp')) {
      return res.status(200).json({
        name: "Slack MCP Server",
        description: "Search and retrieve Slack messages and data",
        version: "1.0.0"
      });
    }

    // Handle tool calls (MCP tools/call)
    if (req.method === 'POST' && req.body.method === 'tools/call') {
      const { name, arguments: args } = req.body.params;

      let result;
      switch (name) {
        case 'search_messages':
          result = await handleSearchMessages(slackClient, args);
          break;
        
        case 'get_channel_history':
          result = await handleChannelHistory(slackClient, args);
          break;
        
        case 'list_channels':
          result = await handleListChannels(slackClient, args);
          break;
        
        default:
          return res.status(200).json({
            jsonrpc: "2.0",
            id: req.body.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          });
      }

      return res.status(200).json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: {
          content: result
        }
      });
    }

    return res.status(404).json({ error: 'Not found' });

  } catch (error) {
    console.error('MCP Server Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

async function handleSearchMessages(slackClient, args) {
  const { query, limit = 10 } = args;
  
  try {
    // Try search API first
    try {
      const searchResult = await slackClient.makeRequest('search.messages', {
        query,
        count: limit
      });

      const messages = searchResult.messages.matches.map(match => ({
        channel: match.channel.name,
        user: match.username,
        text: match.text,
        timestamp: match.ts,
        permalink: match.permalink
      }));

      return [{
        type: "text",
        text: `Found ${messages.length} messages:\n\n` + 
              messages.map(msg => 
                `**#${msg.channel}** by ${msg.user}:\n${msg.text}\n`
              ).join('\n')
      }];

    } catch (searchError) {
      // Fallback to manual search
      console.log('Search API failed, using fallback');
      return await fallbackSearch(slackClient, query, limit);
    }

  } catch (error) {
    console.error('Search failed:', error);
    return [{
      type: "text",
      text: `Search failed: ${error.message}`
    }];
  }
}

async function fallbackSearch(slackClient, query, limit) {
  try {
    const channels = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel',
      limit: 20
    });

    const searchTerms = query.toLowerCase().split(' ');
    let allMessages = [];

    for (const channel of channels.channels) {
      if (!channel.is_member) continue;

      try {
        const history = await slackClient.makeRequest('conversations.history', {
          channel: channel.id,
          limit: 50
        });

        const matchingMessages = history.messages
          .filter(msg => {
            const text = (msg.text || '').toLowerCase();
            return searchTerms.some(term => text.includes(term));
          })
          .map(msg => ({
            channel: channel.name,
            text: msg.text || '',
            timestamp: msg.ts,
            user: msg.user || 'unknown'
          }));

        allMessages.push(...matchingMessages);
        
        if (allMessages.length >= limit) break;
      } catch (channelError) {
        continue; // Skip inaccessible channels
      }
    }

    const results = allMessages.slice(0, limit);
    
    return [{
      type: "text",
      text: `Found ${results.length} messages:\n\n` + 
            results.map(msg => 
              `**#${msg.channel}**:\n${msg.text}\n`
            ).join('\n')
    }];

  } catch (error) {
    return [{
      type: "text",
      text: `Fallback search failed: ${error.message}`
    }];
  }
}

async function handleChannelHistory(slackClient, args) {
  const { channel, limit = 20 } = args;
  
  try {
    let channelId = channel;
    
    // If channel starts with #, remove it and find by name
    if (channel.startsWith('#')) {
      const channelName = channel.substring(1);
      const channels = await slackClient.makeRequest('conversations.list', {
        types: 'public_channel,private_channel'
      });
      
      const foundChannel = channels.channels.find(c => c.name === channelName);
      if (!foundChannel) {
        return [{
          type: "text",
          text: `Channel ${channel} not found`
        }];
      }
      channelId = foundChannel.id;
    }

    const history = await slackClient.makeRequest('conversations.history', {
      channel: channelId,
      limit
    });

    const messages = history.messages.map(msg => ({
      user: msg.user || 'unknown',
      text: msg.text || '',
      timestamp: msg.ts,
      date: new Date(parseFloat(msg.ts) * 1000).toISOString()
    }));

    return [{
      type: "text",
      text: `Recent messages from ${channel}:\n\n` +
            messages.map(msg => 
              `**${msg.user}** (${msg.date}):\n${msg.text}\n`
            ).join('\n')
    }];

  } catch (error) {
    console.error('Channel history error:', error);
    return [{
      type: "text",
      text: `Failed to get channel history: ${error.message}`
    }];
  }
}

async function handleListChannels(slackClient, args) {
  const { types = 'public_channel,private_channel' } = args;
  
  try {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types,
      limit: 100
    });

    const channels = channelsData.channels
      .filter(channel => channel.is_member)
      .map(channel => ({
        name: channel.name,
        id: channel.id,
        is_private: channel.is_private,
        topic: channel.topic?.value || 'No topic',
        member_count: channel.num_members
      }));

    return [{
      type: "text",
      text: `Available channels (${channels.length}):\n\n` +
            channels.map(ch => 
              `**#${ch.name}** ${ch.is_private ? '(private)' : '(public)'}\n` +
              `  ${ch.topic}\n  ${ch.member_count} members\n`
            ).join('\n')
    }];

  } catch (error) {
    console.error('List channels error:', error);
    return [{
      type: "text",
      text: `Failed to list channels: ${error.message}`
    }];
  }
}
