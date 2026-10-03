// ============================================================
// formcontrol.js - !openform / !closeform [silent] / !formstatus
// Supervisor-only. Normal close posts attendance after 30 seconds;
// silent close changes only the Form state.
// ============================================================

const { findCohort } = require('./config');
const { postAttendance, markPosted } = require('./attendance');
const { scheduleAttendanceWarningAfterReport } = require('./activity-automation');
const { appsScriptGet } = require('./apps-script-api');

async function callApi(cohort, action, params = {}) {
  return appsScriptGet(cohort, { action, ...params }, { label: `Attendance form ${action}` });
}

function generateSessionCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function parseFormCommand(content) {
  const parts = String(content || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 1 && parts[0] === '!formstatus') {
    return { command: 'formstatus', silent: false };
  }
  if (parts[0] === '!openform') {
    if (parts.length === 1) return { command: 'openform', silent: false, session: 'evening' };
    if (parts[1] === 'morning') {
      const code = parts.length === 3 && /^\d{4,8}$/.test(parts[2]) ? parts[2] : null;
      if (parts.length > 3 || (parts.length === 3 && !code)) return null;
      return { command: 'openform', silent: false, session: 'morning', code };
    }
    if (parts[1] === 'evening') {
      const code = parts.length === 3 && /^\d{4,8}$/.test(parts[2]) ? parts[2] : null;
      if (parts.length > 3 || (parts.length === 3 && !code)) return null;
      return { command: 'openform', silent: false, session: 'evening', code };
    }
    if (parts.length === 2 && /^\d{4,8}$/.test(parts[1])) {
      return { command: 'openform', silent: false, session: 'evening', code: parts[1] };
    }
    return null;
  }
  if (parts[0] !== '!closeform' || parts.length > 2) return null;
  if (parts.length === 1) return { command: 'closeform', silent: false };
  if (['silent', '--silent'].includes(parts[1])) {
    return { command: 'closeform', silent: true };
  }
  return null;
}

const autoCloseMeta = new Map();
const DEFAULT_AUTO_CLOSE_MS = 30 * 60 * 1000; // 30 minutes

async function executeAttendanceReport(client, cohort, channel, replyMsg = null) {
  try {
    const report = await postAttendance(client, cohort);
    if (!report?.posted) return;
    markPosted(cohort);
    const warning = await scheduleAttendanceWarningAfterReport(
      client, cohort, report.date, 10 * 60 * 1000);
    const confirmation = {
      content: warning.duplicate
        ? `ℹ️ Attendance report ${report.updated ? 'updated' : 'posted'} for **${report.date}**; its warning/mail follow-up was already processed or queued.`
        : `⏱️ Attendance report ${report.updated ? 'updated' : 'posted'} for **${report.date}**. The consecutive-absence warning and enabled private BCC mail follow-up will run in **10 minutes**. The durable queue recovers it after a Render restart. Present and approved-leave marks break the streak.`,
      allowedMentions: { parse: [] },
    };
    if (channel) {
      await channel.send(confirmation).catch(async error => {
        console.error(`[formcontrol] ${cohort.name} queue confirmation send failed:`, error.message);
        if (replyMsg) {
          await replyMsg.reply(confirmation).catch(replyError => {
            console.error(`[formcontrol] ${cohort.name} queue confirmation retry failed:`, replyError.message);
          });
        }
      });
    }
  } catch (error) {
    console.error(`[formcontrol] delayed attendance processing failed for ${cohort.name}:`, error.message);
    if (channel) {
      await channel.send({
        content: `❌ Attendance posted, but its warning/mail follow-up could not be queued: ${String(error.message).slice(0, 250)}`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }
  }
}

module.exports = function registerFormControl(client) {
  client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const parsed = parseFormCommand(msg.content);
    if (!parsed) return;

    // The command always resolves the cohort from the server where it was
    // issued; one cohort can never open or close another cohort's Form.
    const cohort = findCohort(msg.guildId);
    if (!cohort || !cohort.supervisorIds.includes(msg.author.id)) return;

    try {
      if (parsed.command === 'openform') {
        const session = parsed.session || 'evening';
        const sessionLabel = session === 'morning' ? 'Morning Attendance' : 'Evening Attendance';
        const sessionCode = parsed.code || generateSessionCode();
        const status = await callApi(cohort, 'openform', { code: sessionCode, session });
        if (status.accepting) {
          // Clear any previous auto-close timer for this cohort
          if (autoCloseMeta.has(cohort.guildId)) {
            clearTimeout(autoCloseMeta.get(cohort.guildId).timer);
            autoCloseMeta.delete(cohort.guildId);
          }

          const closeTime = Date.now() + DEFAULT_AUTO_CLOSE_MS;
          const timer = setTimeout(async () => {
            autoCloseMeta.delete(cohort.guildId);
            try {
              console.log(`[formcontrol] 30 minutes expired for ${cohort.name} ${session} session, automatically closing form...`);
              const autoCloseStatus = await callApi(cohort, 'closeform', { session });
              if (autoCloseStatus.accepting) {
                console.warn(`[formcontrol] Auto-close failed for ${cohort.name}; form reports still open`);
                return;
              }

              if (session === 'morning') {
                const mornResult = await callApi(cohort, 'attendance', { session: 'morning' }).catch(err => {
                  console.error(`[formcontrol] recording morning attendance failed:`, err.message);
                  return null;
                });
                const summaryNote = mornResult?.recorded
                  ? `\n📊 **Sheet Recorded:** **${mornResult.presentCount}** present (+0.5), **${mornResult.leaveCount || 0}** leave (0), **${mornResult.absentCount}** absent (-0.5).`
                  : '';
                await msg.channel.send({
                  content: [
                    '⏰ **30 minutes expired!** Morning Attendance form is now **CLOSED** automatically.',
                    '🔐 Morning secret code expired. Morning attendance data & points (+0.5 / -0.5 / 0) recorded in Google Sheet.' + summaryNote,
                    '📢 *The combined daily report will be published after the Evening session.*',
                  ].join('\n'),
                  allowedMentions: { parse: [] },
                }).catch(() => {});
              } else {
                await msg.channel.send({
                  content: `⏰ **30 minutes expired!** Evening Attendance form is now **CLOSED** automatically. Secret code expired. Posting combined daily attendance report in 30 seconds...`,
                  allowedMentions: { parse: [] },
                }).catch(() => {});

                setTimeout(async () => {
                  await executeAttendanceReport(client, cohort, msg.channel);
                }, 30 * 1000);
              }
            } catch (autoErr) {
              console.error(`[formcontrol] auto-close failed for ${cohort.name}:`, autoErr.message);
            }
          }, DEFAULT_AUTO_CLOSE_MS);

          autoCloseMeta.set(cohort.guildId, { timer, closeTime, session, sessionCode });

          await msg.reply([
            `🟢 **${sessionLabel}** form is now **OPEN**.`,
            `🔐 **Today\'s ${session === 'morning' ? 'Morning' : 'Evening'} Meet Secret Code:** \`${sessionCode}\``,
            '⏳ *Auto-close timer started: The form will automatically close in **30 minutes**, or you can run `!closeform` anytime.*',
            `📢 *Share this code only in the ${session === 'morning' ? 'morning' : 'evening'} Google Meet class. Students must enter this code to confirm attendance.*`,
          ].join('\n'));
        } else {
          await msg.reply('⚠️ Tried to open, but the form reports closed — check Apps Script.');
        }
        return;
      }

      if (parsed.command === 'closeform') {
        const activeMeta = autoCloseMeta.get(cohort.guildId);
        const session = activeMeta?.session || 'evening';

        // Clear any active auto-close timer since it was closed manually
        if (autoCloseMeta.has(cohort.guildId)) {
          clearTimeout(autoCloseMeta.get(cohort.guildId).timer);
          autoCloseMeta.delete(cohort.guildId);
        }

        const status = await callApi(cohort, 'closeform', { session });
        if (status.accepting) {
          await msg.reply('⚠️ Tried to close, but the form still reports open — check Apps Script.');
          return;
        }
        if (parsed.silent) {
          await msg.reply({
            content: `🔴 Form **CLOSED silently** (${session} session). Secret code expired. No attendance report was posted.`,
            allowedMentions: { parse: [] },
          });
          return;
        }

        if (session === 'morning') {
          const mornResult = await callApi(cohort, 'attendance', { session: 'morning' }).catch(err => {
            console.error(`[formcontrol] recording morning attendance failed:`, err.message);
            return null;
          });
          const summaryNote = mornResult?.recorded
            ? `\n📊 **Sheet Recorded:** **${mornResult.presentCount}** present (+0.5), **${mornResult.leaveCount || 0}** leave (0), **${mornResult.absentCount}** absent (-0.5).`
            : '';
          await msg.reply([
            '🔴 Morning Attendance form **CLOSED**.',
            '🔐 Morning secret code expired. Morning attendance data & points (+0.5 / -0.5 / 0) recorded in Google Sheet.' + summaryNote,
            '📢 *The combined daily report will be published after the Evening session.*',
          ].join('\n'));
          return;
        }

        await msg.reply('🔴 Form **CLOSED**. Secret code expired. Posting combined daily attendance report in 30 seconds...');
        setTimeout(async () => {
          await executeAttendanceReport(client, cohort, msg.channel, msg);
        }, 30 * 1000);
        return;
      }

      const status = await callApi(cohort, 'formstatus');
      const activeMeta = autoCloseMeta.get(cohort.guildId);
      const sessionLabel = activeMeta?.session === 'morning' ? 'Morning' : 'Evening';
      const codeMsg = status.sessionCode ? ` | 🔐 Secret Code (${sessionLabel}): \`${status.sessionCode}\`` : '';
      let autoCloseNote = '';
      if (status.accepting && activeMeta?.closeTime) {
        const remainingMins = Math.max(1, Math.round((activeMeta.closeTime - Date.now()) / 60000));
        autoCloseNote = ` | ⏳ Auto-close in ~${remainingMins} min`;
      }
      await msg.reply(`📋 Form is **${status.accepting ? `OPEN 🟢 (${sessionLabel})` : 'CLOSED 🔴'}**${status.accepting ? codeMsg + autoCloseNote : ''}`);
    } catch (err) {
      console.error('[formcontrol] failed:', err.message);
      await msg.reply({
        content: `❌ ${err.message.slice(0, 300)}`,
        allowedMentions: { parse: [] },
      });
    }
  });
};

module.exports.parseFormCommand = parseFormCommand;

