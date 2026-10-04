// ============================================================
//  announce.js - one-time channel intro announcements
//  !announceall - posts + pins an intro in every automated
//  channel and mirrors each to #automation-announcement.
//  Run once per server (supervisor decides when).
// ============================================================
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { cohorts } = require('./config');
const { report } = require('./reporter');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const EDIT_BUTTON_PREFIX = 'announcement_edit:';
const EDIT_MODAL_PREFIX = 'announcement_edit_submit:';

const INTROS = {
  discussion: `💬 **Student Discussion & Attendance**\n\nWelcome to the main student hub! Here you can:\n• **Chat & Collaborate**: Discuss coding, share ideas, and connect with peers.\n• **Daily Attendance**: Attendance forms and daily updates post here.\n• **Daily Practice**: Answer scheduled technical questions to earn points for referral recommendations.\n\n💡 *Tip: Keep conversations helpful and respectful!*`,
  workshop: `🤖 **Communication Workshop**\n\n• Technical and communication practice questions drop during scheduled windows.\n• Reply in the channel within the time window to get instant feedback and points.\n• Live workshop sessions and attendance polls will also be shared here.\n• Regular practice helps boost your interview readiness and referral ranking! 🏆`,
  jobTracking: `💼 **Job Application Tracking Sheet**\n\n📌 **How to link your tracker:**\n1. Post your Google Sheet tracker link in this channel once.\n2. Ensure link access is set to: **"Anyone with the link → Viewer"**.\n3. The bot links your sheet automatically (you'll see a ✅ reaction).\n\n📊 **Tracking & Follow-up:**\n• Trackers are checked on scheduled working days to record your progress.\n• Consistent daily applications lead to interview calls faster! 💪`,
  interviewUpdates: `🎯 **Interview Updates & Prep Guide**\n\nGot an interview call? Congratulations! 🎉\n\n📌 **How to share:**\n• Post your interview details here: **Company Name** and **Role / Position**.\n• The bot will instantly generate a tailored **Interview Prep Guide** with likely questions, role insights, and prep tips.\n• Every shared interview call adds **+15 referral points**! 🚀`,
  jobTaskUpdates: `📝 **Job Task & Assessment Updates**\n\nReceived a hiring task or technical assessment from a company?\n\n📌 **Please share with these details:**\n• **Candidate Name**:\n• **Company Name**:\n• **Role / Designation**:\n• **Deadline**:\n\nMentors will review your submission and provide guidance to help you succeed! 📋`,
  outreach: `📣 **Outreach & Networking**\n\n• Share your cold messaging progress, recruiter lists, and networking updates here.\n• Consistent outreach unlocks new career opportunities! 💼`,
  hired: `🎉 **Successfully Hired — Celebration Zone!**\n\nThis channel celebrates our students who landed a job! 🥳✨\n\n• Mentors announce new job offers and placement achievements here.\n• **Everyone is welcome to post congratulatory wishes and celebrate together!**\n\nKeep pushing forward — your success story is next! 🏆`,
  rtbr: `🏆 **Champion of the Week & Leaderboard**\n\nConsistent effort leads to referrals and job offers! Your score is based on:\n• 💼 **Job Applications**: Daily applications logged in your tracker.\n• 🎯 **Interviews Shared**: Interview calls posted in the interview channel.\n• 📋 **Job Tasks**: Assessments and take-home tasks submitted.\n• 💬 **Daily Participation**: Regular attendance and collaboration.\n\n🌟 Top performers are recognized as **Champions of the Week** and receive priority mentor recommendations for job referrals!`,
  warning: `⚠️ **Attendance & Activity Notice**\n\nRegular attendance and participation are essential for your progress.\n• Warnings are logged only when consecutive unapproved absences are detected.\n• If no new qualifying incidents exist, this channel stays quiet—silence does not mean the check failed.\n• If you face unexpected difficulties, submit a leave request in the leave channel or talk to a mentor early.`,
  jobPosts: `💼 **Job Opportunities (Community Job Board)**\n\nFound a job circular or hiring post? Share it here! 🌟\n\n• **Who can post:** Both students and mentors.\n• **What to share:** Job posts from LinkedIn, BDJobs, Facebook, or company careers pages.\n• Include the job link, company name, and key requirements.\n\nLet's help each other discover great opportunities! 🤝`,
  resumes: `📄 **Resume Needed (Curated Openings & Referrals)**\n\n📌 **Official Job Openings & Referral Opportunities**\n• Mentors and the Placement Team post verified job openings and priority referral calls here.\n• Check the role requirements carefully and make sure your resume is tailored before applying.\n• Follow the application instructions provided in each post.\n\nPrepare well and apply early! 📋`,
  memes: `🎭 **Welcome to Meme-Verse!**\n\nNeed a quick break from coding and job hunting?\n• Share tech memes, funny programming jokes, and chill discussions with peers and mentors.\n• Keep all posts respectful, fun, and friendly! 🍿🎮`,
  issues: `🌴 **Leave Requests**\n\nNeed temporary leave from bootcamp activities or sessions?\n\n📌 **How to apply:**\n• Type \`!leave\` in this channel and fill out the simple form (dates and reason).\n• Mentors review and record all approved leaves in the attendance sheet. ✈️`,
};

function parseDiscordMessageLink(value) {
  const match = String(value || '').match(
    /https?:\/\/(?:canary\.|ptb\.)?(?:discord\.com|discordapp\.com)\/channels\/(\d+)\/(\d+)\/(\d+)/i
  );
  return match ? { guildId: match[1], channelId: match[2], messageId: match[3] } : null;
}

function editableAnnouncementChannelIds(cohort) {
  const keys = ['rules', ...Object.keys(INTROS)];
  return new Set(keys.map(key => String(cohort.channels?.[key] || '')).filter(Boolean));
}

function editCustomId(prefix, channelId, messageId) {
  return `${prefix}${channelId}:${messageId}`;
}

function parseEditCustomId(value, prefix) {
  if (!String(value || '').startsWith(prefix)) return null;
  const [channelId, messageId] = String(value).slice(prefix.length).split(':');
  return /^\d+$/.test(channelId || '') && /^\d+$/.test(messageId || '')
    ? { channelId, messageId }
    : null;
}

async function fetchEditableAnnouncement(client, cohort, target) {
  if (target.guildId && target.guildId !== cohort.guildId) throw new Error('That message belongs to another server.');
  if (!editableAnnouncementChannelIds(cohort).has(String(target.channelId))) {
    throw new Error('That message is not in a configured rules or announcement channel.');
  }
  const channel = await client.channels.fetch(target.channelId);
  if (!channel?.isTextBased?.()) throw new Error('The target is not a text channel.');
  const message = await channel.messages.fetch(target.messageId);
  if (message.author.id !== client.user.id) {
    throw new Error('I can edit only messages authored by this bot. If you authored it, edit it directly in Discord.');
  }
  if (!message.pinned) throw new Error('For safety, only pinned bot announcements can be edited.');
  if (!message.content) throw new Error('This announcement has no editable text content.');
  return message;
}

function editorButton(message) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(editCustomId(EDIT_BUTTON_PREFIX, message.channelId, message.id))
      .setLabel('Edit pinned announcement')
      .setStyle(ButtonStyle.Primary)
  );
}

function editorModal(message) {
  return new ModalBuilder()
    .setCustomId(editCustomId(EDIT_MODAL_PREFIX, message.channelId, message.id))
    .setTitle('Edit pinned bot announcement')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('announcement_content')
        .setLabel('Announcement text (Markdown supported)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(2000)
        .setValue(message.content.slice(0, 2000))
    ));
}

async function runAnnounceAll(client, cohort, msg) {
    const mirror = [];
    let posted = 0, failed = [];

    for (const [key, text] of Object.entries(INTROS)) {
      const chId = cohort.channels[key];
      if (!chId || String(chId).startsWith('PASTE')) continue;
      try {
        const ch = await client.channels.fetch(chId);
        const m = await ch.send(text);
        await m.pin().catch(() => failed.push(`pin in <#${chId}> (needs Manage Messages)`));
        mirror.push(`**<#${chId}>**\n${text}`);
        posted++;
        await sleep(1200);
      } catch (err) {
        failed.push(`<#${chId}>: ${err.message}`);
      }
    }

    // mirror everything to #announcements
    if (cohort.channels.automationLog) {
      try {
        const logCh = await client.channels.fetch(cohort.channels.automationLog);
        for (const text of mirror) {
          await logCh.send(text.slice(0, 2000));
          await sleep(1200);
        }
      } catch (err) { failed.push('announcements mirror: ' + err.message); }
    }

    if (msg) await msg.reply(`✅ Posted ${posted} announcements.` + (failed.length ? `\n⚠️ Issues:\n• ${failed.join('\n• ')}` : ''));
    report(cohort.name, `Channel intro announcements posted (${posted})`);
    return posted;
}

function registerAnnounce(client) {
  client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const lower = msg.content.trim().toLowerCase();
    const cohortSel = cohorts.find(c => c.guildId === msg.guildId);

    if (lower.startsWith('!editannouncement')) {
      if (!cohortSel || !cohortSel.supervisorIds.includes(msg.author.id)) return;
      if (msg.channelId !== cohortSel.channels.supervisor) {
        return msg.reply(`Run this editor in <#${cohortSel.channels.supervisor}>.`);
      }
      const target = parseDiscordMessageLink(msg.content);
      if (!target) return msg.reply('Usage: `!editannouncement <Discord message link>`');
      try {
        const message = await fetchEditableAnnouncement(client, cohortSel, target);
        return msg.reply({
          content: `Ready to edit the pinned bot announcement in <#${message.channelId}>. The message link and onboarding rules button will stay valid because the message ID will not change.`,
          components: [editorButton(message)],
          allowedMentions: { parse: [] },
        });
      } catch (err) {
        return msg.reply(`\u274c ${err.message}`);
      }
    }

    // !announce <key> [key2...]  - post intro only in named channel(s)
    if (lower.startsWith('!announce ') && lower !== '!announceall') {
      if (!cohortSel || !cohortSel.supervisorIds.includes(msg.author.id)) return;
      const keys = msg.content.trim().split(/\s+/).slice(1).map(k => k.toLowerCase());
      const valid = keys.filter(k => INTROS[k]);
      const invalid = keys.filter(k => !INTROS[k]);
      if (!valid.length) {
        return msg.reply('Usage: `!announce <channel>` where channel is one of: ' +
          Object.keys(INTROS).map(k => `\`${k}\``).join(', ') + '\nOr `!announceall` for every channel.');
      }
      let done = 0;
      for (const key of valid) {
        const chId = cohortSel.channels[key];
        if (!chId) continue;
        try {
          const ch = await client.channels.fetch(chId);
          const m = await ch.send(INTROS[key]);
          await m.pin().catch(() => {});
          if (cohortSel.channels.automationLog) {
            const logCh = await client.channels.fetch(cohortSel.channels.automationLog);
            await logCh.send(`**<#${chId}>**\n${INTROS[key]}`.slice(0, 2000));
          }
          done++;
        } catch (err) { /* skip */ }
      }
      await msg.reply(`✅ Announced in ${done} channel(s): ${valid.join(', ')}` +
        (invalid.length ? `\n⚠️ Unknown: ${invalid.join(', ')}` : ''));
      return;
    }

    if (lower !== '!announceall') return;
    const cohort = cohorts.find(c => c.guildId === msg.guildId);
    if (!cohort || !cohort.supervisorIds.includes(msg.author.id)) return;
    await msg.reply('📣 Posting + pinning intro announcements in every automated channel...');
    await runAnnounceAll(client, cohort, msg);
  });

  client.on('interactionCreate', async interaction => {
    const isEditorButton = interaction.isButton() && interaction.customId.startsWith(EDIT_BUTTON_PREFIX);
    const isEditorModal = interaction.isModalSubmit() && interaction.customId.startsWith(EDIT_MODAL_PREFIX);
    if (!isEditorButton && !isEditorModal) return;

    const cohort = cohorts.find(c => c.guildId === interaction.guildId);
    if (!cohort || !cohort.supervisorIds.includes(interaction.user.id) || interaction.channelId !== cohort.channels.supervisor) {
      await interaction.reply({
        content: 'Only configured supervisors can edit pinned bot announcements from the private admin channel.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }

    const target = parseEditCustomId(
      interaction.customId,
      isEditorButton ? EDIT_BUTTON_PREFIX : EDIT_MODAL_PREFIX
    );
    if (!target) {
      await interaction.reply({ content: 'Invalid announcement editor target.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }

    try {
      const message = await fetchEditableAnnouncement(client, cohort, target);
      if (isEditorButton) {
        await interaction.showModal(editorModal(message));
        return;
      }

      const content = interaction.fields.getTextInputValue('announcement_content');
      if (!content.trim()) {
        await interaction.reply({ content: 'Announcement text cannot be empty.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await message.edit({ content, allowedMentions: { parse: [] } });
      await interaction.editReply(`\u2705 Edited the pinned announcement: ${message.url}`);
    } catch (err) {
      const payload = { content: `\u274c ${err.message}`.slice(0, 2000), flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload.content).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  });
}

module.exports = registerAnnounce;
module.exports.runAnnounceAll = runAnnounceAll;
module.exports.parseDiscordMessageLink = parseDiscordMessageLink;
module.exports.editableAnnouncementChannelIds = editableAnnouncementChannelIds;
module.exports.parseEditCustomId = parseEditCustomId;
module.exports.INTROS = INTROS;
