import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SlackClient } from '../../lib/slack-client.js';

class SlackMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'slack-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.slackClient = null;
    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'slack_list_channels',
            description: 'List all channels in the Slack workspace',
            inputSchema: {
              type: 'object',
              properties: {
                types: {
                  type: 'string',
                  description: 'Comma-separated list of channel types (public_channel, private_channel, mpim, im)',
                  default: 'public_channel,private_channel'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of channels to return',
                  default: 100
                }
              }
            }
          },
          {
            name: 'slack_search_messages',
            description: 'Search for messages in Slack',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query string'
                },
                count: {
                  type: 'number',
                  description: 'Number of results to return',
                  default: 20
                },
                sort: {
                  type: 'string',
                  description: 'Sort order: timestamp or score',
                  enum: ['timestamp', 'score'],
                  default: 'timestamp'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'slack_channel_history',
            description: 'Get message history from a channel',
            inputSchema: {
              type: 'object',
              properties: {
                channel: {
                  type: 'string',
                  description: 'Channel ID or name (with #)'
                },
                limit: {
                  type: 'number',
                  description: 'Number of messages to retrieve',
                  default: 20
                },
                oldest: {
                  type: 'string',
                  description: 'Oldest timestamp to include'
                },
                latest: {
                  type: 'string',
                  description: 'Latest timestamp to include'
                }
              },
              required: ['channel']
            }
          },
          {
            name: 'slack_send_message',
            description: 'Send a message to a Slack channel',
            inputSchema: {
              type: 'object',
              properties: {
                channel: {
                  type: 'string',
                  description: 'Channel ID or name (with #)'
                },
                text: {
                  type: 'string',
                  description: 'Message text to send'
                },
                as_user: {
                  type: 'boolean',
                  description: 'Send as user (if possible)',
                  default: false
                }
              },
              required: ['channel', 'text']
            }
          },
          {
            name: 'slack_get_users',
            description: 'Get list of users in the workspace',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of users to return',
                  default: 100
                }
              }
            }
          },
          {
            name: 'slack_get_user_info',
            description: 'Get information about a specific user',
            inputSchema: {
              type: 'object',
              properties: {
                user: {
                  type: 'string',
                  description: 'User ID or username'
                }
              },
              required: ['user']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.slackClient) {
        throw new Error('Slack client not initialized. Please check SLACK_BOT_TOKEN.');
      }

      try {
        switch (name) {
          case 'slack_list_channels':
            return await this.listChannels(args);
          case 'slack_search_messages':
            return await this.searchMessages(args);
          case 'slack_channel_history':
            return await this.getChannelHistory(args);
          case 'slack_send_message':
            return await this.sendMessage(args);
          case 'slack_get_users':
            return await this.getUsers(args);
          case 'slack_get_user_info':
            return await this.getUserInfo(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async listChannels(args) {
    const data = await this.slackClient.makeRequest('conversations.list', {
      types: args.types || 'public_channel,private_channel',
      limit: args.limit || 100
    });

    const channels = data.channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      is_private: channel.is_private,
      is_member: channel.is_member,
      topic: channel.topic?.value || 'No topic',
      purpose: channel.purpose?.value || 'No purpose',
      member_count: channel.num_members
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(channels, null, 2)
        }
      ]
    };
  }

  async searchMessages(args) {
    const data = await this.slackClient.makeRequest('search.messages', {
      query: args.query,
      count: args.count || 20,
      sort: args.sort || 'timestamp'
    });

    const messages = data.messages.matches.map(match => ({
      channel: match.channel.name,
      user: match.username,
      text: match.text,
      timestamp: match.ts,
      permalink: match.permalink
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(messages, null, 2)
        }
      ]
    };
  }

  async getChannelHistory(args) {
    let channel = args.channel;
    
    // Handle channel names with # prefix
    if (channel.startsWith('#')) {
      const channelsData = await this.slackClient.makeRequest('conversations.list', {
        types: 'public_channel,private_channel'
      });
      const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
      if (foundChannel) {
        channel = foundChannel.id;
      }
    }

    const data = await this.slackClient.makeRequest('conversations.history', {
      channel: channel,
      limit: args.limit || 20,
      oldest: args.oldest,
      latest: args.latest
    });

    const messages = data.messages.map(message => ({
      user: message.user,
      text: message.text,
      timestamp: message.ts,
      type: message.type,
      subtype: message.subtype
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(messages, null, 2)
        }
      ]
    };
  }

  async sendMessage(args) {
    let channel = args.channel;
    
    // Handle channel names with # prefix
    if (channel.startsWith('#')) {
      const channelsData = await this.slackClient.makeRequest('conversations.list', {
        types: 'public_channel,private_channel'
      });
      const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
      if (foundChannel) {
        channel = foundChannel.id;
      }
    }

    const data = await this.slackClient.postMessage(channel, args.text, {
      as_user: args.as_user || false
    });

    return {
      content: [
        {
          type: 'text',
          text: `Message sent successfully to ${args.channel}`
        }
      ]
    };
  }

  async getUsers(args) {
    const data = await this.slackClient.makeRequest('users.list', {
      limit: args.limit || 100
    });

    const users = data.members.map(user => ({
      id: user.id,
      name: user.name,
      real_name: user.real_name,
      display_name: user.profile?.display_name || user.real_name,
      email: user.profile?.email,
      is_bot: user.is_bot,
      is_admin: user.is_admin,
      is_owner: user.is_owner,
      status: user.profile?.status_text || 'No status'
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(users, null, 2)
        }
      ]
    };
  }

  async getUserInfo(args) {
    const data = await this.slackClient.makeRequest('users.info', {
      user: args.user
    });

    const user = {
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
      status: data.user.profile?.status_text || 'No status'
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(user, null, 2)
        }
      ]
    };
  }

  async run() {
    const token = process.env.SLACK_BOT_TOKEN;
    
    if (!token) {
      console.error('ERROR: SLACK_BOT_TOKEN environment variable is required');
      process.exit(1);
    }

    this.slackClient = new SlackClient(token);

    // Test connection
    try {
      await this.slackClient.makeRequest('auth.test');
      console.error('✅ Slack API connection successful!');
    } catch (error) {
      console.error('❌ Slack API connection failed:', error.message);
      process.exit(1);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Slack MCP server running on stdio');
  }
}

// For Vercel serverless function
export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ 
      message: 'Slack MCP Server is running',
      tools: [
        'slack_list_channels',
        'slack_search_messages', 
        'slack_channel_history',
        'slack_send_message',
        'slack_get_users',
        'slack_get_user_info'
      ]
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

// For local development and MCP
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const server = new SlackMCPServer();
  server.run().catch(console.error);
}
