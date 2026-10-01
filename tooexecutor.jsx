// connectors/toolExecutor.js
const slack = require('./slack');
const notion = require('./notion');
const github = require('./github');

// Maps tool name -> [module, fnName]
const ROUTES = {
  slack_list_channels: [slack, 'listChannels'],
  slack_get_recent_messages: [slack, 'getRecentMessages'],
  slack_send_message: [slack, 'sendMessage'],
  slack_list_users: [slack, 'listUsers'],

  notion_search_pages: [notion, 'searchPages'],
  notion_get_page: [notion, 'getPage'],
  notion_create_page: [notion, 'createPage'],
  notion_append_block: [notion, 'appendBlock'],

  github_list_repos: [github, 'listRepos'],
  github_get_repo_issues: [github, 'getRepoIssues'],
  github_create_issue: [github, 'createIssue'],
  github_create_comment: [github, 'createComment'],
};

/**
 * Executes a single tool_use block from Claude's response.
 * @param {object} supabase - your Supabase client instance
 * @param {string} userId
 * @param {{name: string, input: object}} toolUse - a tool_use content block
 * @returns {Promise<object>} result to feed back as tool_result content
 */
async function executeTool(supabase, userId, toolUse) {
  const route = ROUTES[toolUse.name];
  if (!route) {
    return { error: `Unknown tool: ${toolUse.name}` };
  }
  const [mod, fnName] = route;
  try {
    const result = await mod[fnName](supabase, userId, toolUse.input || {});
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Runs all tool_use blocks in a Claude response in parallel and returns
 * tool_result content blocks ready to send back in the next message.
 */
async function executeAllTools(supabase, userId, contentBlocks) {
  const toolUses = contentBlocks.filter(b => b.type === 'tool_use');
  const results = await Promise.all(
    toolUses.map(async tu => ({
      tool_use_id: tu.id,
      result: await executeTool(supabase, userId, tu),
    }))
  );
  return results.map(r => ({
    type: 'tool_result',
    tool_use_id: r.tool_use_id,
    content: JSON.stringify(r.result),
  }));
}

/**
 * Executes Groq/OpenAI-style tool_calls (from message.tool_calls) and
 * returns an array of {role: 'tool', tool_call_id, content} messages
 * ready to append to the conversation before the follow-up call.
 */
async function executeOpenAIToolCalls(supabase, userId, toolCalls = []) {
  const results = await Promise.all(
    toolCalls.map(async tc => {
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        // malformed args from the model — pass empty object through
      }
      const result = await executeTool(supabase, userId, { name: tc.function.name, input: args });
      return { tool_call_id: tc.id, content: JSON.stringify(result) };
    })
  );
  return results.map(r => ({
    role: 'tool',
    tool_call_id: r.tool_call_id,
    content: r.content,
  }));
}

module.exports = { executeTool, executeAllTools, executeOpenAIToolCalls };