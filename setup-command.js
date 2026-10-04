// ============================================================
//  setup-command.js - !setupserver: one command for a new server
//   1. creates any missing standard channels (needs Admin or
//      Manage Channels) with correct privacy
//   2. re-discovers channel IDs by name
//   3. posts + pins all intro announcements
//   4. records the setup date -> workshop drops/polls and job
//      checks stay silent for 3 days (warm-up)
// ============================================================
const { ChannelType, OverwriteType, PermissionFlagsBits } = require('discord.js');
const { cohorts } = require('./config');
const { discoverChannels } = require('./discover');
const { runAnnounceAll } = require('./announce');
const { setSetupDate } = require('./state');
const { report } = require('./reporter');
const { ensureOnboardingSetup } = require('./onboarding');
const { normalizeChannelName: norm } = require('./channel-names');
const { applyStarterPreset } = require('./automations');
const { syncAutomationChannelVisibility } = require('./channel-visibility');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// name -> { key, category, privacy }
const STANDARD_CHANNELS = [
  // MENTOR Zone
  { name: '👋│welcome', key: 'welcome', category: 'MENTOR Zone', aliases: ['welcome-to-the-bootcamp', 'welcome-to-bootcamp', 'bootcamp-welcome', 'welcome'], lockedPosting: true },
  { name: '📜│rules', key: 'rules', category: 'MENTOR Zone', aliases: ['rules-and-regulations', 'rules-and-regulation', 'rules-regulations', 'server-rules', 'rules'], lockedPosting: true },
  { name: '🔗│basecamp-meet-link', key: 'meetLink', category: 'MENTOR Zone', aliases: ['basecamp-meet-link', 'basecamp-meet', 'meet-link', 'basecamp-link'], lockedPosting: true },
  { name: '📢│announcements', key: 'automationLog', category: 'MENTOR Zone', aliases: ['announcements', 'announcments', 'announcement', 'automation-announcement', 'automation-log'], lockedPosting: true },
  { name: '📋│daily-task', key: 'dailyTasks', category: 'MENTOR Zone', aliases: ['daily-task', 'daily-tasks', 'daily-task-updates'], lockedPosting: true },
  { name: '🚨│emergency-mentions', key: 'emergency', category: 'MENTOR Zone', aliases: ['emergency-mentions', 'emergency-mention', 'emergency'], lockedPosting: true },
  { name: '🤝│1on1-support', key: 'oneOnOneSupport', category: 'MENTOR Zone', aliases: ['1on1-support', 'on1-support', '1on1-supports', 'one-on-one-support', '1-on-1-support', 'support'] },
  { name: '🤖│jp-admin', key: 'supervisor', category: 'MENTOR Zone', aliases: ['jp-admin', 'bot-admin', 'admin', 'supervisor'], private: true },
  { name: '👥│cr-discussion', key: 'crDiscussion', category: 'MENTOR Zone', aliases: ['cr-discussion', 'cr-discussions', 'cr-chat'], private: true },

  // Student zone
  { name: '💬│student-discussion', key: 'discussion', category: 'Student zone', aliases: ['student-discussion', 'studetn-discussion', 'discussion', 'attendance'] },
  { name: '🎯│interview-update', key: 'interviewUpdates', category: 'Student zone', aliases: ['interview-update', 'interview-updates'] },
  { name: '📝│job-task-update', key: 'jobTaskUpdates', category: 'Student zone', aliases: ['job-task-update', 'job-task-updates', 'task-update', 'task-updates', 'job-tasks', 'job-task'] },
  { name: '💼│job-tracking-sheet', key: 'jobTracking', category: 'Student zone', aliases: ['job-tracking-sheet', 'job-trackking-sheet', 'job-tracking'] },
  { name: '🏆│champion-of-the-week', key: 'rtbr', category: 'Student zone', aliases: ['champion-of-the-week', 'chapion-of-the-week', 'champions', 'right-to-be-referred', 'rtbr'], lockedPosting: true },
  { name: '🌴│leave-requests', key: 'issues', category: 'Student zone', aliases: ['leave-requests', 'leave-request', 'issues', 'issue'] },
  { name: '🚫│eliminated-students', key: 'eliminated', category: 'Student zone', aliases: ['eliminated-students', 'eliminated-student', 'inactive-students', 'eliminated'], lockedPosting: true },
  { name: '💼│job-opportunities', key: 'jobPosts', category: 'Student zone', aliases: ['job-opportunities', 'job-opurtunites', 'job-opportunity', 'job-posts', 'job-post'] },
  { name: '📄│resume-needed', key: 'resumes', category: 'Student zone', aliases: ['resume-needed', 'resume-updates', 'resumes', 'resume'], lockedPosting: true },
  { name: '📚│important-resources', key: 'resources', category: 'Student zone', aliases: ['important-resources', 'resources'] },

  // FUN & CHILL
  { name: '🎉│successfully-hired', key: 'hired', category: 'FUN & CHILL', aliases: ['successfully-hired', 'hired'] },
  { name: '🎭│meme-verse', key: 'memes', category: 'FUN & CHILL', aliases: ['meme-verse', 'meme-of-madness', 'memes', 'meme-madness', 'fun-and-chill'] },
];

function permissionOverwrites(spec, guild, client, cohort) {
  const overwrites = [];
  const normalAccess = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
  ];
  if (spec.private) {
    overwrites.push({ id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] });
    for (const sid of cohort.supervisorIds) {
      overwrites.push({ id: sid, type: OverwriteType.Member, allow: normalAccess });
    }
    overwrites.push({ id: client.user.id, type: OverwriteType.Member, allow: normalAccess });
  } else if (spec.lockedPosting) {
    overwrites.push({ id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.SendMessages] });
    for (const sid of cohort.supervisorIds) {
      overwrites.push({
        id: sid,
        type: OverwriteType.Member,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      });
    }
    overwrites.push({
      id: client.user.id,
      type: OverwriteType.Member,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    });
  }
  return overwrites;
}

async function repairPermissions(channel, spec, guild, client, cohort) {
  const warnings = [];
  for (const overwrite of permissionOverwrites(spec, guild, client, cohort)) {
    const target = await resolveOverwriteTarget(overwrite, guild, client);
    if (!target) {
      warnings.push(`configured supervisor \`${overwrite.id}\` is not currently in this server`);
      continue;
    }
    await channel.permissionOverwrites.edit(target, {
      ViewChannel: overwrite.allow?.includes(PermissionFlagsBits.ViewChannel) ? true :
        overwrite.deny?.includes(PermissionFlagsBits.ViewChannel) ? false : null,
      SendMessages: overwrite.allow?.includes(PermissionFlagsBits.SendMessages) ? true :
        overwrite.deny?.includes(PermissionFlagsBits.SendMessages) ? false : null,
      ReadMessageHistory: overwrite.allow?.includes(PermissionFlagsBits.ReadMessageHistory) ? true : null,
      EmbedLinks: overwrite.allow?.includes(PermissionFlagsBits.EmbedLinks) ? true : null,
      AttachFiles: overwrite.allow?.includes(PermissionFlagsBits.AttachFiles) ? true : null,
    }, {
      type: overwrite.type,
      reason: 'JP ADMIN standard channel permissions',
    });
  }
  return { warnings };
}

async function resolveOverwriteTarget(overwrite, guild, client) {
  if (overwrite.type === OverwriteType.Role) {
    return guild.roles.resolve?.(overwrite.id) ||
      (overwrite.id === guild.roles.everyone.id ? guild.roles.everyone : null);
  }
  if (overwrite.id === client.user.id) return client.user;

  const cached = guild.members.resolve?.(overwrite.id);
  if (cached) return cached.user;
  try {
    const member = await guild.members.fetch(overwrite.id);
    return member.user;
  } catch (err) {
    if (err?.code === 10007 || err?.status === 404) return null;
    throw err;
  }
}

async function filterResolvableOverwrites(overwrites, guild, client) {
  const resolved = [];
  const warnings = [];
  for (const overwrite of overwrites) {
    const target = await resolveOverwriteTarget(overwrite, guild, client);
    if (!target) {
      warnings.push(`configured supervisor \`${overwrite.id}\` is not currently in this server`);
      continue;
    }
    resolved.push(overwrite);
  }
  return { overwrites: resolved, warnings };
}

function matchCategory(existing, name) {
  const cleanTarget = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanTarget) return null;
  const items = typeof existing.find === 'function' ? existing : Array.from(existing.values?.() || []);
  const findFn = items.find ? items.find.bind(items) : Array.prototype.find.bind(items);
  return findFn(c =>
    c &&
    c.type === ChannelType.GuildCategory &&
    String(c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget
  ) || null;
}

function findStandardChannel(existing, spec, cohort) {
  const acceptedNames = [spec.name, ...(spec.aliases || [])].map(norm);
  const configuredRaw = cohort.channels?.[spec.key]
    ? existing.get?.(cohort.channels[spec.key])
    : null;
  const configured = configuredRaw?.type === ChannelType.GuildText ? configuredRaw : null;
  const items = typeof existing.find === 'function' ? existing : Array.from(existing.values?.() || []);
  const findFn = items.find ? items.find.bind(items) : Array.prototype.find.bind(items);
  return configured || findFn(
    c => c && c.type === ChannelType.GuildText && acceptedNames.includes(norm(c.name)),
  );
}

async function repairAllStandardPermissions(client, cohort, guild) {
  const existing = await guild.channels.fetch();
  const repaired = [];
  const failed = [];
  const warnings = new Set();

  for (const spec of STANDARD_CHANNELS.filter(item => item.private || item.lockedPosting)) {
    const channel = findStandardChannel(existing, spec, cohort);
    if (!channel) {
      failed.push(`${spec.name}: channel not found`);
      continue;
    }
    try {
      const result = await repairPermissions(channel, spec, guild, client, cohort);
      result.warnings.forEach(warning => warnings.add(warning));
      cohort.channels[spec.key] = channel.id;
      repaired.push(`#${channel.name}`);
    } catch (err) {
      failed.push(`${channel.name}: ${err.message}`);
    }
  }

  return { repaired, failed, warnings: [...warnings] };
}

async function removeStandardSupervisorPermissions(guild, cohort, supervisorId) {
  const existing = await guild.channels.fetch();
  const removed = [];
  const failed = [];

  for (const spec of STANDARD_CHANNELS.filter(item => item.private || item.lockedPosting)) {
    const channel = findStandardChannel(existing, spec, cohort);
    if (!channel?.permissionOverwrites?.cache?.has(supervisorId)) continue;
    try {
      await channel.permissionOverwrites.delete(
        supervisorId,
        'JP ADMIN supervisor access removed',
      );
      removed.push(`#${channel.name}`);
    } catch (err) {
      failed.push(`${channel.name}: ${err.message}`);
    }
  }

  return { removed, failed };
}

async function unlockPostingIfRestricted(channel, guild) {
  if (!channel?.permissionOverwrites?.cache || typeof channel.permissionOverwrites?.edit !== 'function') return;
  const everyoneRole = guild.roles?.everyone;
  if (!everyoneRole) return;
  const overwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);
  if (overwrite?.deny?.has?.(PermissionFlagsBits.SendMessages)) {
    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: null,
      }, { reason: 'JP ADMIN open posting allowed' });
    } catch {
      // non-fatal
    }
  }
}

async function ensureStandardChannels(client, cohort, guild) {
  const existing = await guild.channels.fetch();
  const created = [];
  const reused = [];
  const failed = [];
  const permissionWarnings = new Set();
  cohort.channels = cohort.channels || {};

  // Find or create category headers for structured channels
  const categoryNames = [...new Set(STANDARD_CHANNELS.map(s => s.category).filter(Boolean))];
  const categoryMap = new Map();

  for (const catName of categoryNames) {
    let cat = matchCategory(existing, catName);
    if (!cat && typeof guild.channels?.create === 'function') {
      try {
        cat = await guild.channels.create({
          name: catName,
          type: ChannelType.GuildCategory,
        });
        if (cat) {
          existing.set?.(cat.id, cat);
          await sleep(400);
        }
      } catch (err) {
        failed.push(`Category ${catName}: ${err.message}`);
      }
    }
    if (cat) {
      categoryMap.set(catName, cat.id);
    }
  }

  for (const spec of STANDARD_CHANNELS) {
    const categoryId = spec.category ? categoryMap.get(spec.category) : undefined;
    const match = findStandardChannel(existing, spec, cohort);
    if (match) {
      cohort.channels[spec.key] = match.id;
      reused.push(`#${match.name} → ${spec.key}`);
      if (categoryId && match.parentId !== categoryId && typeof match.setParent === 'function') {
        try {
          await match.setParent(categoryId, { lockPermissions: false });
        } catch {
          // non-fatal if category parent could not be updated
        }
      }
      if (spec.private || spec.lockedPosting) {
        try {
          const result = await repairPermissions(match, spec, guild, client, cohort);
          result.warnings.forEach(warning => permissionWarnings.add(warning));
        } catch (err) {
          failed.push(`${match.name} permissions: ${err.message}`);
        }
      } else {
        await unlockPostingIfRestricted(match, guild);
      }
      continue;
    }

    try {
      const resolution = await filterResolvableOverwrites(
        permissionOverwrites(spec, guild, client, cohort),
        guild,
        client,
      );
      resolution.warnings.forEach(warning => permissionWarnings.add(warning));
      const channel = await guild.channels.create({
        name: spec.name,
        type: ChannelType.GuildText,
        parent: categoryId || undefined,
        permissionOverwrites: resolution.overwrites.length ? resolution.overwrites : undefined,
      });
      cohort.channels[spec.key] = channel.id;
      existing.set?.(channel.id, channel);
      created.push(spec.name);
      await sleep(600);
    } catch (err) {
      failed.push(`${spec.name}: ${err.message}`);
    }
  }

  await discoverChannels(client);
  return { created, reused, failed, permissionWarnings: [...permissionWarnings] };
}

module.exports = function registerSetup(client) {
  client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const command = msg.content.trim().toLowerCase();
    if (!['!setupserver', '!ensurechannels', '!repairpermissions'].includes(command)) return;
    const cohort = cohorts.find(c => c.guildId === msg.guildId);
    if (!cohort || !cohort.supervisorIds.includes(msg.author.id)) return;

    if (command === '!repairpermissions') {
      if (!cohort.channels?.supervisor || msg.channelId !== cohort.channels.supervisor) {
        await msg.reply({
          content: `❌ Run \`!repairpermissions\` in the configured private <#${cohort.channels.supervisor}> channel.`,
          allowedMentions: { parse: [] },
        });
        return;
      }

      await msg.reply({
        content: '🔐 Repairing standard channel permission overwrites...',
        allowedMentions: { parse: [] },
      });
      const result = await repairAllStandardPermissions(client, cohort, msg.guild);
      await msg.channel.send({
        embeds: [{
          title: `🔐 Permission Repair — ${cohort.name}`,
          color: result.failed.length ? 0xe67e22 : 0x2ecc71,
          fields: [
            {
              name: `✅ Repaired (${result.repaired.length})`,
              value: result.repaired.length ? result.repaired.join('\n') : '— none',
            },
            ...(result.failed.length ? [{
              name: `⚠️ Failed (${result.failed.length})`,
              value: result.failed.join('\n').slice(0, 1024),
            }] : []),
            ...(result.warnings.length ? [{
              name: `ℹ️ Skipped absent supervisors (${result.warnings.length})`,
              value: result.warnings.join('\n').slice(0, 1024),
            }] : []),
          ],
          footer: { text: 'Next: !checkperms → !doctor' },
        }],
        allowedMentions: { parse: [] },
      });
      report(cohort.name, `Permission repair completed (${result.repaired.length} repaired, ${result.failed.length} failed)`);
      return;
    }

    if (command === '!ensurechannels') {
      await msg.reply({
        content: '🛠 Ensuring standard channels and permission overwrites without reposting announcements...',
        allowedMentions: { parse: [] },
      });
      try {
        const result = await ensureStandardChannels(client, cohort, msg.guild);
        await msg.channel.send({
          embeds: [{
            title: `🛠 Channel Check Complete — ${cohort.name}`,
            color: result.failed.length ? 0xe67e22 : 0x2ecc71,
            fields: [
              { name: `Created (${result.created.length})`, value: result.created.length ? result.created.map(name => `#${name}`).join('\n') : '— none' },
              { name: `Reused (${result.reused.length})`, value: result.reused.length ? result.reused.join('\n').slice(0, 1024) : '— none' },
              ...(result.permissionWarnings.length ? [{ name: 'Permission notices', value: result.permissionWarnings.join('\n').slice(0, 1024) }] : []),
              ...(result.failed.length ? [{ name: `Failed (${result.failed.length})`, value: result.failed.join('\n').slice(0, 1024) }] : []),
            ],
            footer: { text: 'No announcements were reposted and no warm-up date was changed.' },
          }],
          allowedMentions: { parse: [] },
        });
        report(cohort.name, `Channel check completed (${result.created.length} created, ${result.failed.length} failed)`);
      } catch (err) {
        await msg.reply({
          content: `❌ Channel check failed: ${err.message}`,
          allowedMentions: { parse: [] },
        });
      }
      return;
    }

    await msg.reply('🛠 Setting up this server: channels → discovery → announcements → warm-up timer...');

    try {
      const guild = msg.guild;
      const ensured = await ensureStandardChannels(client, cohort, guild);
      const { created, reused, failed } = ensured;
      const permissionWarnings = new Set(ensured.permissionWarnings);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: cohort.timezone });
      await setSetupDate(cohort, today);       // start the 3-day warm-up
      let starter = 'Not applied';
      try {
        const preset = await applyStarterPreset(cohort);
        const visibility = await syncAutomationChannelVisibility(client, cohort, preset.states);
        starter = `attendance, jobs, contentsync active; ${visibility.updated.length} workflow channel(s) synchronized`;
        if (preset.failures.length) failed.push(...preset.failures.map(item => `starter switch: ${item}`));
        if (visibility.failed.length) failed.push(...visibility.failed.map(item => `visibility: ${item}`));
      } catch (err) {
        starter = `⚠️ ${err.message}`;
        failed.push('starter preset: ' + err.message);
      }
      const announced = await runAnnounceAll(client, cohort); // intro posts + pins
      let onboarding = 'Not configured';
      try {
        const ready = await ensureOnboardingSetup(client, cohort);
        onboarding = `Ready: [welcome panel](${ready.panel.url}) · [rules](${ready.rulesMessage.url})`;
      } catch (err) {
        onboarding = `⚠️ ${err.message}`;
        failed.push('onboarding: ' + err.message);
      }

      await msg.channel.send({
        embeds: [{
          title: `🛠 Server Setup Complete — ${cohort.name}`,
          color: failed.length ? 0xe67e22 : 0x2ecc71,
          fields: [
            { name: `📁 Channels created (${created.length})`, value: created.length ? created.map(c => `• #${c}`).join('\n') : '— all existed already' },
            { name: `♻️ Template channels reused (${reused.length})`, value: reused.length ? reused.join('\n').slice(0, 1024) : '— none' },
            { name: `📣 Announcements posted`, value: String(announced) },
            { name: '🧰 Starter automation preset', value: starter },
            { name: '👋 Welcome onboarding', value: onboarding },
            { name: '⏳ Warm-up', value: 'Attendance, job tracking, roster/intake syncing, and manual supervisor commands are ready. Noisy student programmes stay held until a mentor starts them.' },
            ...(permissionWarnings.size ? [{ name: 'ℹ️ Permission notices', value: [...permissionWarnings].join('\n').slice(0, 1024) }] : []),
            ...(failed.length ? [{ name: '⚠️ Failed', value: failed.join('\n').slice(0, 1024) }] : []),
          ],
          footer: { text: 'Next: !syncmembers → !audit → !checkperms' },
        }],
      });
      report(cohort.name, `Server setup completed (${created.length} channels created)`);
    } catch (err) {
      await msg.reply('❌ Setup failed: ' + err.message + '\nMake sure the bot has Administrator (or Manage Channels + Manage Roles).');
    }
  });
};

module.exports.permissionOverwrites = permissionOverwrites;
module.exports.repairPermissions = repairPermissions;
module.exports.repairAllStandardPermissions = repairAllStandardPermissions;
module.exports.removeStandardSupervisorPermissions = removeStandardSupervisorPermissions;
module.exports.resolveOverwriteTarget = resolveOverwriteTarget;
module.exports.ensureStandardChannels = ensureStandardChannels;
