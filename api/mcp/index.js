import { SlackClient } from '../../lib/slack-client.js';
import { TokenManager } from '../../lib/token-manager.js';

export default async function handler(req, res) {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  // Essential CORS headers for Claude web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Server discovery endpoint - Claude calls this first
  if (req.method === 'GET') {
    return res.status(200).json({
      name: "Slack MCP Server",
      description: "Search and interact with Slack workspace",
      version: "1.0.0",
      protocol_version: "2024-11-05",
      capabilities: {
        tools: {},
        resources: {}
      },
      server_info: {
        name: "Slack MCP Server",
        version: "1.0.0"
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32601,
        message: "Method not allowed"
      }
    });
  }

  const body = req.body;
  if (!body || !body.jsonrpc || body.jsonrpc !== "2.0") {
    return res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: "Invalid JSON-RPC request"
      }
    });
  }

  // Get Slack token
  const tokenManager = new TokenManager();
  let slackToken = process.env.SLACK_USER_TOKEN;

  // Try user-specific token if auth header present
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const accessToken = authHeader.substring(7);
    const tokenPayload = tokenManager.verifyAccessToken(accessToken);
    
    if (tokenPayload) {
      const userToken = await tokenManager.getUserToken(tokenPayload.userId);
      if (userToken) {
        slackToken = userToken;
        console.log('Using user-specific token');
      }
    }
  }

  if (!slackToken) {
    return res.status(200).json({
      jsonrpc: "2.0",
      id: body.id,
      error: {
        code: -32000,
        message: "No Slack token configured"
      }
    });
  }

  const slackClient = new SlackClient(slackToken);

  try {
    // Handle initialize
    if (body.method === 'initialize') {
      console.log('Initialize request');
      return res.status(200).json({
        jsonrpc: "2.0",
        id: body.id,
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

    // Handle tools/list
    if (body.method === 'tools/list') {
      console.log('Tools list request');
      return res.status(200).json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "search_slack",
              description: "Search Slack messages using keywords, @mentions, or #channels",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search query"
                  }
                },
                required: ["query"]
              }
            },
            {
              name: "list_channels",
              description: "List Slack channels",
              inputSchema: {
                type: "object",
                properties: {}
              }
            }
          ]
        }
      });
    }

    // Handle tools/call
    if (body.method === 'tools/call') {
      console.log('Tool call request:', body.params);
      const { name, arguments: args } = body.params;

      let result;
      switch (name) {
        case 'search_slack':
          result = await searchSlack(slackClient, args);
          break;
        case 'list_channels':
          result = await listChannels(slackClient, args);
          break;
        default:
          return res.status(200).json({
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          });
      }

      return res.status(200).json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: result
        }
      });
    }

    // Unknown method
    return res.status(200).json({
      jsonrpc: "2.0",
      id: body.id,
      error: {
        code: -32601,
        message: `Unknown method: ${body.method}`
      }
    });

  } catch (error) {
    console.error('MCP Error:', error);
    return res.status(200).json({
      jsonrpc: "2.0",
      id: body.id,
      error: {
        code: -32000,
        message: error.message
      }
    });
  }
}

async function searchSlack(slackClient, args) {
  const { query } = args;
  
  try {
    // Try search API
    try {
      const searchResult = await slackClient.makeRequest('search.messages', {
        query,
        count: 10
      });

      const messages = searchResult.messages?.matches || [];
      
      if (messages.length === 0) {
        return [{
          type: "text",
          text: `No messages found for "${query}"`
        }];
      }

      const formattedMessages = messages.slice(0, 10).map((msg, i) => 
        `${i + 1}. **#${msg.channel?.name || 'unknown'}** by ${msg.username || 'unknown'}:\n${msg.text || 'No text'}\n`
      ).join('\n');

      return [{
        type: "text",
        text: `Found ${messages.length} messages for "${query}":\n\n${formattedMessages}`
      }];

    } catch (searchError) {
      // Fallback search
      return await fallbackSearch(slackClient, query);
    }

  } catch (error) {
    return [{
      type: "text",
      text: `Search failed: ${error.message}`
    }];
  }
}

async function fallbackSearch(slackClient, query) {
  try {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel',
      limit: 10
    });

    const searchTerms = query.toLowerCase().split(' ');
    let results = [];

    for (const channel of channelsData.channels) {
      if (!channel.is_member) continue;

      try {
        const history = await slackClient.makeRequest('conversations.history', {
          channel: channel.id,
          limit: 20
        });

        const matches = history.messages.filter(msg => {
          const text = (msg.text || '').toLowerCase();
          return searchTerms.some(term => text.includes(term));
        });

        results.push(...matches.map(msg => ({
          channel: channel.name,
          text: msg.text,
          user: msg.user
        })));

        if (results.length >= 10) break;
      } catch (err) {
        continue;
      }
    }

    if (results.length === 0) {
      return [{
        type: "text",
        text: `No messages found for "${query}"`
      }];
    }

    const formatted = results.slice(0, 10).map((msg, i) =>
      `${i + 1}. **#${msg.channel}**:\n${msg.text}\n`
    ).join('\n');

    return [{
      type: "text",
      text: `Found ${results.length} messages for "${query}":\n\n${formatted}`
    }];

  } catch (error) {
    return [{
      type: "text",
      text: `Fallback search failed: ${error.message}`
    }];
  }
}

async function listChannels(slackClient, args) {
  try {
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel',
      limit: 50
    });

    const channels = channelsData.channels
      .filter(ch => ch.is_member)
      .map(ch => ({
        name: ch.name,
        private: ch.is_private,
        members: ch.num_members,
        topic: ch.topic?.value || 'No topic'
      }));

    if (channels.length === 0) {
      return [{
        type: "text",
        text: "No accessible channels found"
      }];
    }

    const formatted = channels.map(ch =>
      `**#${ch.name}** ${ch.private ? '(private)' : '(public)'}\n  ${ch.topic}\n  ${ch.members} members`
    ).join('\n\n');

    return [{
      type: "text",
      text: `Found ${channels.length} channels:\n\n${formatted}`
    }];

  } catch (error) {
    return [{
      type: "text",
      text: `Failed to list channels: ${error.message}`
    }];
  }
}
