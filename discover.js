// ============================================================
//  discover.js - channel auto-discovery by NAME
//  For a NEW server, the cohort config only needs guildId +
//  appsScriptUrl + apiKey. At startup this fills in every
//  channel ID by matching standard channel names.
//  Explicit IDs in config always win over discovery.
// ============================================================
const { cohorts } = require('./config');
const { normalizeChannelName: norm } = require('./channel-names');

const NAME_MAP = {
  welcome: ['welcome-to-the-bootcamp', 'welcome-to-bootcamp', 'bootcamp-welcome', 'welcome'],
  rules: ['rules-and-regulations', 'rules-and-regulation', 'rules-regulations', 'server-rules', 'rules'],
  meetLink: ['basecamp-meet-link', 'basecamp-meet', 'meet-link', 'basecamp-link'],
  automationLog: ['announcements', 'announcments', 'announcement', 'automation-announcement', 'automation-log'],
  dailyTasks: ['daily-task', 'daily-tasks', 'daily-task-updates'],
  emergency: ['emergency-mentions', 'emergency-mention', 'emergency'],
  oneOnOneSupport: ['on1-support', '1on1-support', '1on1-supports', 'one-on-one-support', '1-on-1-support', 'support'],
  supervisor: ['jp-admin', 'bot-admin', 'admin', 'supervisor'],
  crDiscussion: ['cr-discussion', 'cr-discussions', 'cr-chat'],
  discussion: ['student-discussion', 'studetn-discussion', 'discussion', 'attendance'],
  interviewUpdates: ['interview-update', 'interview-updates'],
  jobTaskUpdates: ['job-task-update', 'job-task-updates', 'task-update', 'task-updates', 'job-tasks', 'job-task'],
  jobTracking: ['job-tracking-sheet', 'job-trackking-sheet', 'job-tracking'],
  rtbr: ['champion-of-the-week', 'chapion-of-the-week', 'champions', 'right-to-be-referred', 'rtbr'],
  issues: ['leave-requests', 'leave-request', 'issues', 'issue'],
  eliminated: ['eliminated-students', 'eliminated-student', 'inactive-students', 'eliminated'],
  jobPosts: ['job-opportunities', 'job-opurtunites', 'job-opportunity', 'job-posts', 'job-post'],
  resumes: ['resume-needed', 'resume-updates', 'resumes', 'resume'],
  resources: ['important-resources', 'resources'],
  hired: ['successfully-hired', 'hired'],
  memes: ['meme-verse', 'meme-of-madness', 'memes', 'meme-madness', 'fun-and-chill'],
  outreach: ['outreach-update', 'outreach-updates', 'outreach'],
  warning: ['warning', 'warnings'],
  discipline: ['dawn-focus-circle'],
  groupActivities: ['group-activities'],
};

async function discoverChannels(client) {
  for (const cohort of cohorts) {
    let guild;
    try { guild = await client.guilds.fetch(cohort.guildId); }
    catch { console.warn(`[discover] ${cohort.name}: guild not reachable`); continue; }
    const channels = await guild.channels.fetch();

    cohort.channels = cohort.channels || {};
    const found = [], missing = [];
    for (const [key, names] of Object.entries(NAME_MAP)) {
      const current = cohort.channels[key];
      if (current && !String(current).startsWith('PASTE')) continue; // explicit ID wins
      const match = channels.find(c => c && typeof c.isTextBased === 'function' && c.isTextBased() && names.includes(norm(c.name)));
      if (match) { cohort.channels[key] = match.id; found.push(`${key}→#${match.name}`); }
      else missing.push(key);
    }
    if (found.length) console.log(`[discover] ${cohort.name}: auto-found ${found.join(', ')}`);
    if (missing.length) console.warn(`[discover] ${cohort.name}: NOT found (create channels or set IDs): ${missing.join(', ')}`);
  }
}

module.exports = { discoverChannels };
