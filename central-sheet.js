// ============================================================
// central-sheet.js
// Central Master Sheet Directory & Cohort Index for JP ADMIN.
// Connects and syncs multiple cohort sheets into one master
// Google Spreadsheet for easy reference and management.
// ============================================================

const { cohorts, findCohort } = require('./config');
const { appsScriptPost, appsScriptGet } = require('./apps-script-api');

let memoryCentralSheetUrl = process.env.CENTRAL_SHEET_URL || process.env.CENTRAL_SHEET_ID || '';

function parseCentralSheetCommand(content) {
  const raw = String(content || '').trim();
  const match = raw.match(/^!centralsheet(?:\s+(set|sync|help)(?:\s+(.+))?)?$/i);
  if (!match) return null;

  const action = (match[1] || 'status').toLowerCase();
  const argument = String(match[2] || '').trim();

  if (action === 'set') {
    if (!argument) {
      return { command: 'set', error: 'Please provide a Google Sheet URL: `!centralsheet set <Google Sheet URL>`' };
    }
    return { command: 'set', url: argument };
  }

  if (action === 'sync') {
    return { command: 'sync' };
  }

  if (action === 'help') {
    return { command: 'help' };
  }

  return { command: 'status' };
}

function getCentralSheetUrl() {
  return memoryCentralSheetUrl;
}

function setCentralSheetUrl(url) {
  memoryCentralSheetUrl = String(url || '').trim();
  return memoryCentralSheetUrl;
}

function isValidSheetReference(reference) {
  const raw = String(reference || '').trim();
  return /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.test(raw) || /^([A-Za-z0-9_-]{20,})$/.test(raw);
}

async function syncCohortToCentral(cohort, centralReference) {
  return appsScriptPost(cohort, {
    action: 'syncCentralSheet',
    centralSpreadsheetReference: centralReference,
    guildId: cohort.guildId,
    cohortName: cohort.name,
  }, {
    label: `Central Sheet Sync (${cohort.name})`,
    idempotent: true,
  });
}

async function syncAllCohortsToCentral(centralReference) {
  const results = [];
  for (const cohort of cohorts) {
    try {
      const res = await syncCohortToCentral(cohort, centralReference);
      results.push({ cohort, ok: Boolean(res?.synced), data: res });
    } catch (err) {
      results.push({ cohort, ok: false, error: err.message });
    }
  }
  return results;
}

function registerCentralSheet(client) {
  client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    const parsed = parseCentralSheetCommand(msg.content);
    if (!parsed) return;

    const currentCohort = findCohort(msg.guildId);
    if (!currentCohort) return;

    // Check supervisor authorization
    if (!currentCohort.supervisorIds.includes(msg.author.id)) {
      await msg.reply('⛔ Only configured supervisors can manage the Central Master Sheet.');
      return;
    }

    if (currentCohort.channels?.supervisor && msg.channelId !== currentCohort.channels.supervisor) {
      await msg.reply(`Run this command in <#${currentCohort.channels.supervisor}>.`);
      return;
    }

    if (parsed.command === 'help') {
      await msg.channel.send({
        embeds: [{
          title: '📑 Central Master Sheet Help',
          color: 0x1a73e8,
          description: [
            'The Central Master Sheet indexes every cohort sheet into a single **Cohort Directory** tab with clickable links and live student counts.',
            '',
            '**Commands:**',
            '• `!centralsheet` — View Central Master Sheet link & connected cohorts status',
            '• `!centralsheet set <Google Sheet URL>` — Bind a Central Master Sheet & sync all cohorts',
            '• `!centralsheet sync` — Force an immediate sync of all cohort sheets into the Master Sheet',
          ].join('\n'),
        }],
      });
      return;
    }

    if (parsed.command === 'set') {
      if (parsed.error) {
        await msg.reply(`❌ ${parsed.error}`);
        return;
      }

      if (!isValidSheetReference(parsed.url)) {
        await msg.reply('❌ Invalid Google Sheet URL or ID. Please provide a full Google Sheet link.');
        return;
      }

      const targetUrl = parsed.url;
      setCentralSheetUrl(targetUrl);

      const statusMsg = await msg.reply('🔄 Binding Central Master Sheet and syncing active cohorts...');

      try {
        const syncResults = await syncAllCohortsToCentral(targetUrl);
        const successCount = syncResults.filter(r => r.ok).length;

        const cohortLines = syncResults.map(r => {
          const status = r.ok ? '✅ Synced' : `❌ Failed (${r.error || 'Check Apps Script'})`;
          return `• **${r.cohort.name}**: ${status}`;
        }).join('\n');

        await statusMsg.edit({
          content: null,
          embeds: [{
            title: '✅ Central Master Sheet Connected',
            color: 0x2ecc71,
            description: [
              `Successfully connected Central Master Sheet!`,
              `**Master Directory:** [Open Master Sheet ↗](${targetUrl})`,
              '',
              `**Synced Cohorts (${successCount}/${cohorts.length}):**`,
              cohortLines || 'No active cohorts found.',
              '',
              'All future `!setupcohortsheet` runs will automatically register in this Master Sheet.',
            ].join('\n'),
            footer: { text: 'Cohort Directory tab initialized' },
          }],
        });
      } catch (err) {
        console.error('[central-sheet] set failed:', err);
        await statusMsg.edit(`❌ Error syncing to Central Sheet: ${err.message}`);
      }
      return;
    }

    if (parsed.command === 'sync') {
      const activeUrl = getCentralSheetUrl();
      if (!activeUrl) {
        await msg.reply('⚠️ No Central Sheet configured yet. Set one first using:\n`!centralsheet set <Google Sheet URL>`');
        return;
      }

      const statusMsg = await msg.reply('🔄 Syncing all active cohorts to Central Master Sheet...');

      try {
        const syncResults = await syncAllCohortsToCentral(activeUrl);
        const successCount = syncResults.filter(r => r.ok).length;

        const cohortLines = syncResults.map(r => {
          const status = r.ok ? '✅ Synced' : `❌ ${r.error || 'Failed'}`;
          return `• **${r.cohort.name}**: ${status}`;
        }).join('\n');

        await statusMsg.edit({
          content: null,
          embeds: [{
            title: '📑 Central Master Sheet Synced',
            color: 0x1a73e8,
            description: [
              `**Master Sheet:** [Open Master Sheet ↗](${activeUrl})`,
              '',
              `**Sync Status (${successCount}/${cohorts.length}):**`,
              cohortLines || 'No active cohorts found.',
            ].join('\n'),
            footer: { text: 'Cohort Directory updated' },
          }],
        });
      } catch (err) {
        console.error('[central-sheet] sync failed:', err);
        await statusMsg.edit(`❌ Sync failed: ${err.message}`);
      }
      return;
    }

    // Default: 'status'
    const activeUrl = getCentralSheetUrl();
    const cohortLines = cohorts.map(c => {
      return `• **${c.name}** — Server ID: \`${c.guildId}\``;
    }).join('\n');

    await msg.channel.send({
      embeds: [{
        title: '📑 JP Automation — Central Cohort Directory',
        color: 0x1a73e8,
        description: [
          activeUrl
            ? `**Master Directory Sheet:** [Open Central Master Sheet ↗](${activeUrl})\n`
            : '⚠️ *No Central Master Sheet linked yet. Run `!centralsheet set <Google Sheet URL>` to link one.*\n',
          '**Connected Cohorts:**',
          cohortLines || 'No active cohorts configured.',
          '',
          '💡 *Tip: Run `!centralsheet sync` to update all cohort links and counts in the Master Sheet.*',
        ].join('\n'),
        footer: { text: 'Unified Multi-Cohort Automation' },
      }],
    });
  });
}

module.exports = registerCentralSheet;
module.exports.parseCentralSheetCommand = parseCentralSheetCommand;
module.exports.getCentralSheetUrl = getCentralSheetUrl;
module.exports.setCentralSheetUrl = setCentralSheetUrl;
module.exports.isValidSheetReference = isValidSheetReference;
module.exports.syncCohortToCentral = syncCohortToCentral;
module.exports.syncAllCohortsToCentral = syncAllCohortsToCentral;
