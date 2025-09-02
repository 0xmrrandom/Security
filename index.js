import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } from "discord.js";
import "./keepalive.js";

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const ALERT_CHANNEL = "1412175218322968637"; // روم الجدية
const FUN_CHANNEL = "1410294724358705211";   // روم الطقطقة
const OWNERS = ["1128302289778659378", "1334605388867178638"];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => console.log(`✅ Logged in as ${client.user.tag}`));

// تسجيل كوماند test
const commands = [
  new SlashCommandBuilder().setName("test").setDescription("محاكاة تنبيه حماية")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try { 
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash command registered"); 
  }
  catch (err) { console.error(err); }
})();

// دالة إرسال التنبيهات
async function sendAlerts(guild, user, action) {
  const funEmbed = new EmbedBuilder()
    .setTitle("🚨 محاولة تخريب!")
    .setDescription(`يا هطف يبن قحبه لا تحاول تجحفل عشان حمايه كريمينالز ناكت امك\n\n**ID:** ${user.id}\n**منشن:** <@${user.id}>`)
    .setThumbnail(user.displayAvatarURL())
    .setColor("Blue");

  const alertEmbed = new EmbedBuilder()
    .setTitle("🔴 تنبيه أمني")
    .setDescription(`**المخرب:** ${user.tag}\n**ID:** ${user.id}\n**منشن:** <@${user.id}>\n**الإجراء:** ${action}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor("Red");

  const funChannel = guild.channels.cache.get(FUN_CHANNEL);
  if (funChannel) await funChannel.send({ embeds: [funEmbed] });

  const alertChannel = guild.channels.cache.get(ALERT_CHANNEL);
  if (alertChannel) await alertChannel.send({ embeds: [alertEmbed] });

  for (const ownerId of OWNERS) {
    const owner = await client.users.fetch(ownerId).catch(() => null);
    if (owner) await owner.send({ embeds: [alertEmbed] }).catch(() => {});
  }
}

// كوماند test
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "test") {
    const fakeUser = { id: "test", tag: "test#0000", displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png" };
    await sendAlerts(interaction.guild, fakeUser, "محاكاة التخريب");
    await interaction.reply({ content: "✅ تم إرسال التنبيه الوهمي", ephemeral: true });
  }
});

// حماية Webhook
client.on("webhookUpdate", async channel => {
  const guild = channel.guild;
  const audit = await guild.fetchAuditLogs({ type: 50, limit: 1 });
  const entry = audit.entries.first();
  if (!entry) return;

  const { executor } = entry;
  if (!executor || OWNERS.includes(executor.id)) return;

  await sendAlerts(guild, executor, "إنشاء ويب هوك");
  try {
    const member = await guild.members.fetch(executor.id);
    if (member.user.bot) await member.ban({ reason: "Bot Nuker Detected" }).catch(() => {});
    else await member.roles.set([]).catch(() => {});
  } catch (e) { console.error(e); }
});

// حماية Mass Delete و Restore
const userDeletes = new Map();

async function handleMassDelete(member, type, guild) {
  if (!member) return;

  let data = userDeletes.get(member.id) || { channels: 0, roles: 0, categories: 0 };

  if (type === "Channel") data.channels++;
  if (type === "Role") data.roles++;
  if (type === "Category") data.categories++;

  userDeletes.set(member.id, data);

  if (data.channels >= 3 || data.roles >= 3 || data.categories >= 3) {
    await member.roles.set([]).catch(() => {});
    await sendAlerts(guild, member.user, `حذف 3 ${type}s`);
    userDeletes.delete(member.id);
  }
}

// دالة استعادة الروم / الرول / الكاتيجوري مع مكانها الأصلي
async function restoreDeletedEntity(entity, type, guild, executor) {
  try {
    if (type === "Channel") {
      await guild.channels.create({
        name: entity.name,
        type: entity.type,
        parent: entity.parentId || null,
        position: entity.position,
        permissionOverwrites: entity.permissionOverwrites.cache.map(p => ({
          id: p.id,
          allow: p.allow.toArray(),
          deny: p.deny.toArray()
        }))
      });
    } else if (type === "Role") {
      await guild.roles.create({
        name: entity.name,
        color: entity.color,
        permissions: entity.permissions,
        hoist: entity.hoist,
        mentionable: entity.mentionable,
        position: entity.position
      });
    } else if (type === "Category") {
      await guild.channels.create({
        name: entity.name,
        type: 4, // Category
        position: entity.position,
        permissionOverwrites: entity.permissionOverwrites.cache.map(p => ({
          id: p.id,
          allow: p.allow.toArray(),
          deny: p.deny.toArray()
        }))
      });
    }
  } catch (e) {
    console.error(`Error restoring deleted ${type}:`, e);
  }

  await sendAlerts(guild, executor, `حذف ${type}`);
}

// مراقبة حذف القنوات
client.on("channelDelete", async channel => {
  const guild = channel.guild;
  const audit = await guild.fetchAuditLogs({ type: 12, limit: 1 });
  const entry = audit.entries.first();
  if (!entry) return;
  const { executor } = entry;
  if (!executor || OWNERS.includes(executor.id)) return;

  await restoreDeletedEntity(channel, channel.type === 4 ? "Category" : "Channel", guild, executor);

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if(channel.type === 4) await handleMassDelete(member, "Category", guild);
  else await handleMassDelete(member, "Channel", guild);
});

// مراقبة حذف الرولات
client.on("roleDelete", async role => {
  const guild = role.guild;
  const audit = await guild.fetchAuditLogs({ type: 32, limit: 1 });
  const entry = audit.entries.first();
  if (!entry) return;
  const { executor } = entry;
  if (!executor || OWNERS.includes(executor.id)) return;

  await restoreDeletedEntity(role, "Role", guild, executor);

  const member = await guild.members.fetch(executor.id).catch(() => null);
  await handleMassDelete(member, "Role", guild);
});

client.login(TOKEN);
