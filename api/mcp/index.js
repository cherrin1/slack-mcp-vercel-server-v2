import { SlackClient } from '../../lib/slack-client.js';

// MCP Server following the official specification
export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle MCP discovery
  if (req.method === 'GET') {
    return res.status(200).json({
      name: "slack-mcp-server",
      version: "0.1.0",
      description: "Slack workspace integration via MCP",
      author: "Your Name",
      capabilities: {
        tools: {},
        resources: {}
      },
      serverInfo: {
        name: "slack-mcp-server",
        version: "0.1.0"
      }
    });
  }

  if (req.method === 'POST') {
    try {
      const { jsonrpc, method, params, id } = req.body;

      // Validate JSON-RPC 2.0 format
      if (jsonrpc !== "2.0") {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Invalid Request"
          },
          id: id || null
        });
      }

      switch (method) {
        case 'initialize':
          return res.status(200).json({
            jsonrpc: "2.0",
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {},
                resources: {}
              },
              serverInfo: {
                name: "slack-mcp-server",
                version: "0.1.0"
              }
            },
            id
          });

        case 'tools/list':
          return res.status(200).json({
            jsonrpc: "2.0",
            result: {
              tools: [
                {
                  name: "slack_list_channels",
                  description: "List all channels in the Slack workspace",
                  inputSchema: {
                    type: "object",
                    properties: {
                      types: {
                        type: "string",
                        description: "Channel types (public_channel, private_channel)",
                        default: "public_channel,private_channel"
                      },
                      limit: {
                        type: "number",
                        description: "Maximum channels to return",
                        default: 100
                      }
                    }
                  }
                },
                {
                  name: "slack_search_messages",
                  description: "Search for messages in Slack",
                  inputSchema: {
                    type: "object",
                    properties: {
                      query: {
                        type: "string",
                        description: "Search query string"
                      },
                      count: {
                        type: "number",
                        description: "Number of results",
                        default: 20
                      }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "slack_channel_history",
                  description: "Get message history from a channel",
                  inputSchema: {
                    type: "object",
                    properties: {
                      channel: {
                        type: "string",
                        description: "Channel ID or name (with #)"
                      },
                      limit: {
                        type: "number",
                        description: "Number of messages",
                        default: 50
                      }
                    },
                    required: ["channel"]
                  }
                },
                {
                  name: "slack_send_message",
                  description: "Send a message to a Slack channel",
                  inputSchema: {
                    type: "object",
                    properties: {
                      channel: {
                        type: "string",
                        description: "Channel ID or name (with #)"
                      },
                      text: {
                        type: "string",
                        description: "Message text to send"
                      }
                    },
                    required: ["channel", "text"]
                  }
                },
                {
                  name: "slack_get_users",
                  description: "Get list of users in workspace",
                  inputSchema: {
                    type: "object",
                    properties: {
                      limit: {
                        type: "number",
                        description: "Maximum users to return",
                        default: 100
                      }
                    }
                  }
                },
                {
                  name: "slack_get_user_info",
                  description: "Get information about a specific user",
                  inputSchema: {
                    type: "object",
                    properties: {
                      user: {
                        type: "string",
                        description: "User ID or username"
                      }
                    },
                    required: ["user"]
                  }
                }
              ]
            },
            id
          });

        case 'tools/call':
          return await handleToolCall(params, res, id);

        default:
          return res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32601,
              message: "Method not found"
            },
            id
          });
      }
    } catch (error) {
      console.error('MCP Request error:', error);
      return res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
          data: error.message
        },
        id: req.body?.id || null
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleToolCall(params, res, id) {
  const { name, arguments: args } = params;

  // Initialize Slack client
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "SLACK_BOT_TOKEN not configured"
      },
      id
    });
  }

  const slackClient = new SlackClient(token);

  try {
    let result;

    switch (name) {
      case 'slack_list_channels':
        const channelsData = await slackClient.makeRequest('conversations.list', {
          types: args.types || 'public_channel,private_channel',
          limit: args.limit || 100
        });

        const channels = channelsData.channels.map(channel => ({
          id: channel.id,
          name: channel.name,
          is_private: channel.is_private,
          is_member: channel.is_member,
          topic: channel.topic?.value || 'No topic',
          member_count: channel.num_members
        }));

        result = {
          content: [{
            type: "text",
            text: `Found ${channels.length} channels:\n${JSON.stringify(channels, null, 2)}`
          }]
        };
        break;

      case 'slack_search_messages':
        if (!args.query) {
          throw new Error('Query parameter is required');
        }

        const searchData = await slackClient.makeRequest('search.messages', {
          query: args.query,
          count: args.count || 20
        });

        const messages = searchData.messages.matches.map(match => ({
          channel: match.channel.name,
          user: match.username,
          text: match.text,
          timestamp: match.ts,
          permalink: match.permalink
        }));

        result = {
          content: [{
            type: "text",
            text: `Found ${messages.length} messages for "${args.query}":\n${JSON.stringify(messages, null, 2)}`
          }]
        };
        break;

      case 'slack_channel_history':
        if (!args.channel) {
          throw new Error('Channel parameter is required');
        }

        let channel = args.channel;
        if (channel.startsWith('#')) {
          const channelsData = await slackClient.makeRequest('conversations.list');
          const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
          if (foundChannel) channel = foundChannel.id;
        }

        const historyData = await slackClient.makeRequest('conversations.history', {
          channel: channel,
          limit: args.limit || 50
        });

        const history = historyData.messages.map(msg => ({
          user: msg.user,
          text: msg.text,
          timestamp: msg.ts,
          date: new Date(parseFloat(msg.ts) * 1000).toISOString()
        }));

        result = {
          content: [{
            type: "text",
            text: `History for ${args.channel} (${history.length} messages):\n${JSON.stringify(history, null, 2)}`
          }]
        };
        break;

      case 'slack_send_message':
        if (!args.channel || !args.text) {
          throw new Error('Channel and text parameters are required');
        }

        let sendChannel = args.channel;
        if (sendChannel.startsWith('#')) {
          const channelsData = await slackClient.makeRequest('conversations.list');
          const foundChannel = channelsData.channels.find(c => c.name === sendChannel.slice(1));
          if (foundChannel) sendChannel = foundChannel.id;
        }

        const sendData = await slackClient.postMessage(sendChannel, args.text);

        result = {
          content: [{
            type: "text",
            text: `Message sent to ${args.channel}. Timestamp: ${sendData.ts}`
          }]
        };
        break;

      case 'slack_get_users':
        const usersData = await slackClient.makeRequest('users.list', {
          limit: args.limit || 100
        });

        const users = usersData.members
          .filter(user => !user.deleted)
          .map(user => ({
            id: user.id,
            name: user.name,
            real_name: user.real_name,
            email: user.profile?.email,
            is_bot: user.is_bot,
            is_admin: user.is_admin
          }));

        result = {
          content: [{
            type: "text",
            text: `Found ${users.length} users:\n${JSON.stringify(users, null, 2)}`
          }]
        };
        break;

      case 'slack_get_user_info':
        if (!args.user) {
          throw new Error('User parameter is required');
        }

        const userData = await slackClient.makeRequest('users.info', {
          user: args.user
        });

        const userInfo = {
          id: userData.user.id,
          name: userData.user.name,
          real_name: userData.user.real_name,
          email: userData.user.profile?.email,
          title: userData.user.profile?.title,
          is_bot: userData.user.is_bot,
          is_admin: userData.user.is_admin,
          timezone: userData.user.tz
        };

        result = {
          content: [{
            type: "text",
            text: `User info for ${args.user}:\n${JSON.stringify(userInfo, null, 2)}`
          }]
        };
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return res.status(200).json({
      jsonrpc: "2.0",
      result,
      id
    });

  } catch (error) {
    console.error('Tool call error:', error);
    return res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: error.message
      },
      id
    });
  }
}
