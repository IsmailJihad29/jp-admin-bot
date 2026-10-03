'use strict';

// ============================================================
//  channel-guard.js - cross-channel post monitoring & warnings
//  Warns students when they post Job Tasks, Interviews, Tracker
//  Links, or Leave Requests in the wrong Discord channel.
// ============================================================

const { cohorts } = require('./config');
const { parseSheetLink } = require('./job-tracker');
const { parseJobTaskMessage } = require('./job-tasks');
const { parseInterviewAnnouncements } = require('./interview-parser');
const { resolveChannel } = require('./settings');

function detectWrongChannelMessage(content, currentChannelId, channelMap = {}) {
  const text = String(content || '').trim();
  if (!text || text.startsWith('!')) return null;

  const {
    jobTracking,
    jobTaskUpdates,
    interviewUpdates,
    issues,
    supervisor,
  } = channelMap;

  // Ignore supervisor/bot-admin channel
  if (supervisor && currentChannelId === supervisor) return null;

  // 1. Check for Interview Announcement first (interviews often have Company and Role fields)
  const interviews = parseInterviewAnnouncements(text);
  if (interviews && interviews.length > 0) {
    if (interviewUpdates && currentChannelId !== interviewUpdates) {
      return {
        type: 'interview',
        targetChannelId: interviewUpdates,
        label: 'Interview Update',
        guidance: `অনুগ্রহ করে আপনার ইন্টারভিউ আপডেটটি <#${interviewUpdates}> চ্যানেলে পোস্ট করুন, যাতে শিটে রেকর্ড হয় এবং আপনি বট থেকে AI Interview Prep Guide পেতে পারেন।`,
      };
    }
    return null;
  }

  // 2. Check for Job Task Update
  if (!/\binterview\b/i.test(text)) {
    const jobTask = parseJobTaskMessage(text);
    if (jobTask && (jobTask.company || jobTask.deadline)) {
      if (jobTaskUpdates && currentChannelId !== jobTaskUpdates) {
        return {
          type: 'job_task',
          targetChannelId: jobTaskUpdates,
          label: 'Job Task Update',
          guidance: `অনুগ্রহ করে আপনার জব টাস্কের তথ্যটি <#${jobTaskUpdates}> চ্যানেলে পোস্ট করুন, যাতে তা সঠিকভাবে শিটে রেকর্ড হতে পারে।`,
        };
      }
      return null;
    }
  }

  // 3. Check for Job Tracking Google Sheet Link
  const sheet = parseSheetLink(text);
  if (sheet && sheet.sheetId) {
    if (jobTracking && currentChannelId !== jobTracking) {
      return {
        type: 'job_sheet',
        targetChannelId: jobTracking,
        label: 'Job Tracking Sheet Link',
        guidance: `অনুগ্রহ করে আপনার গুগল শিটের লিংকটি <#${jobTracking}> চ্যানেলে পোস্ট করুন। অন্য চ্যানেলে লিংক দিলে বট আপনার দৈনিক আবেদন ট্র্যাক করতে পারবে না।`,
      };
    }
    return null;
  }

  // 4. Check for unstructured Leave Request in text
  if (/\b(leave\s*request|chuti|ছুটির?\s*আবেদন|leave\s*application)\b/i.test(text) && issues && currentChannelId !== issues) {
    if (/(\bdate\b|\breason\b|\bfrom\b|\bto\b|\bday\b|\bদিন\b|\bকারণ\b)/i.test(text)) {
      return {
        type: 'leave_request',
        targetChannelId: issues,
        label: 'Leave Request',
        guidance: `ছুটির আবেদনের জন্য অনুগ্রহ করে <#${issues}> চ্যানেলে যান এবং \`!leave\` কমান্ডটি ব্যবহার করুন।`,
      };
    }
  }

  return null;
}

async function resolveCohortChannels(cohort) {
  const [jobs, jobTasks, interview, issues, supervisor] = await Promise.all([
    resolveChannel(cohort, 'channel_jobs', cohort.channels?.jobTracking),
    resolveChannel(cohort, 'channel_job_tasks', cohort.channels?.jobTaskUpdates),
    resolveChannel(cohort, 'channel_interview', cohort.channels?.interviewUpdates),
    cohort.channels?.issues || '',
    cohort.channels?.supervisor || '',
  ]);
  return {
    jobTracking: jobs,
    jobTaskUpdates: jobTasks,
    interviewUpdates: interview,
    issues,
    supervisor,
  };
}

module.exports = function registerChannelGuard(client) {
  client.on('messageCreate', async (msg) => {
    if (!msg || msg.author?.bot) return;
    if (msg.content.startsWith('!')) return;

    const cohort = cohorts.find(c => c.guildId === msg.guildId);
    if (!cohort) return;

    // Ignore supervisors
    if (cohort.supervisorIds?.includes(msg.author.id)) return;

    try {
      const channelMap = await resolveCohortChannels(cohort);
      const wrong = detectWrongChannelMessage(msg.content, msg.channelId, channelMap);
      if (!wrong || !wrong.targetChannelId) return;

      await msg.react('⚠️').catch(() => {});
      await msg.reply({
        content: [
          `⚠️ ${msg.author}, **এই মেসেজটি এই চ্যানেলের জন্য নয়!**`,
          `📌 **মেসেজের ধরন:** ${wrong.label}`,
          `👉 **সঠিক চ্যানেল:** <#${wrong.targetChannelId}>`,
          `💡 ${wrong.guidance}`,
        ].join('\n\n'),
        allowedMentions: { users: [msg.author.id] },
      }).catch(err => console.error('[channel-guard] reply failed:', err.message));
    } catch (err) {
      console.error('[channel-guard] error:', err.message);
    }
  });
};

module.exports.detectWrongChannelMessage = detectWrongChannelMessage;
module.exports.resolveCohortChannels = resolveCohortChannels;
