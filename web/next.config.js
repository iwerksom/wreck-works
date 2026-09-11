// `next dev` writes AGENTS.md and CLAUDE.md into web/ on every start and
// re-adds them if deleted — see node_modules/next/dist/server/lib/
// generate-agent-files.js. This repo deliberately keeps agent instruction
// files out of the tree (.gitignore excludes .claude/, decision 2026-09-03),
// so turn the generator off rather than commit files nothing here reads.
const nextConfig = {
  agentRules: false,
};

module.exports = nextConfig;
