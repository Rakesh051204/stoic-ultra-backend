// connectors/toolDefinitionsGroq.js
// Groq's chat.completions.create() uses OpenAI-style function calling.

export const groqToolDefinitions = [
  { type: 'function', function: { name: 'slack_list_channels', description: 'List Slack channels the connected account can see.', parameters: { type: 'object', properties: { limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'slack_get_recent_messages', description: 'Get recent messages from a Slack channel.', parameters: { type: 'object', properties: { channelId: { type: 'string' }, limit: { type: 'number' } }, required: ['channelId'] } } },
  { type: 'function', function: { name: 'slack_send_message', description: 'Send a message to a Slack channel.', parameters: { type: 'object', properties: { channelId: { type: 'string' }, text: { type: 'string' } }, required: ['channelId', 'text'] } } },
  { type: 'function', function: { name: 'slack_list_users', description: 'List users in the connected Slack workspace.', parameters: { type: 'object', properties: { limit: { type: 'number' } } } } },

  { type: 'function', function: { name: 'notion_search_pages', description: 'Search Notion pages the connected account can access.', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'notion_get_page', description: 'Get the title and content blocks of a Notion page.', parameters: { type: 'object', properties: { pageId: { type: 'string' } }, required: ['pageId'] } } },
  { type: 'function', function: { name: 'notion_create_page', description: 'Create a new Notion page under a parent page.', parameters: { type: 'object', properties: { parentPageId: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' } }, required: ['parentPageId', 'title'] } } },
  { type: 'function', function: { name: 'notion_append_block', description: 'Append a text paragraph block to an existing Notion page.', parameters: { type: 'object', properties: { pageId: { type: 'string' }, text: { type: 'string' } }, required: ['pageId', 'text'] } } },

  { type: 'function', function: { name: 'github_list_repos', description: "List the connected user's GitHub repos, most recently updated first.", parameters: { type: 'object', properties: { limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'github_get_repo_issues', description: 'Get issues from a GitHub repo.', parameters: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'] }, limit: { type: 'number' } }, required: ['owner', 'repo'] } } },
  { type: 'function', function: { name: 'github_create_issue', description: 'Create a new issue in a GitHub repo.', parameters: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['owner', 'repo', 'title'] } } },
  { type: 'function', function: { name: 'github_create_comment', description: 'Comment on a GitHub issue.', parameters: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, issueNumber: { type: 'number' }, body: { type: 'string' } }, required: ['owner', 'repo', 'issueNumber', 'body'] } } },
]

