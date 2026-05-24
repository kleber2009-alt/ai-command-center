const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const paths = {
  root: ROOT,
  data: path.join(ROOT, 'data'),
  prompts: path.join(ROOT, 'data', 'prompts'),
  output: path.join(ROOT, 'data', 'output'),
  logs: path.join(ROOT, 'data', 'logs'),
  assets: path.join(ROOT, 'data', 'assets'),
  footage: path.join(ROOT, 'data', 'assets', 'footage'),
  bRoll: path.join(ROOT, 'data', 'assets', 'b-roll'),
  audio: path.join(ROOT, 'data', 'assets', 'audio'),
  analytics: path.join(ROOT, 'data', 'analytics'),
  rubrics: path.join(ROOT, 'data', 'rubrics.json'),
  contentPlan: path.join(ROOT, 'data', 'content-plan.json'),
  postsAnalytics: path.join(ROOT, 'data', 'analytics', 'posts.json'),
  config: path.join(ROOT, 'config'),
  outputForDate(dateStr, kind) {
    return path.join(ROOT, 'data', 'output', dateStr, kind);
  },
};

module.exports = paths;
