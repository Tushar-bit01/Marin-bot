require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');
const { execSync } = require('child_process');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const GUILD_ID = '1492930248415645777';
const COBALT_URL = 'https://cobalt-api-production-b3a1.up.railway.app';
const INSTA_REGEX = /https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+/;
const YT_SHORT_REGEX = /https?:\/\/(www\.)?(youtube\.com\/shorts|youtu\.be)\/[A-Za-z0-9_-]+/;

const SPECIAL_PAIRS = [
  ['1474239913959620723', '1014190745558712370'],
  ['1273126903053684787', '793004680233484298'],
];

const loreList = [];
const rivalPairs = {};

if (!fs.existsSync(path.join(__dirname, 'temp'))) {
  fs.mkdirSync(path.join(__dirname, 'temp'));
}

// ─────────────────────────────────────────
// COBALT API DOWNLOADER
// ─────────────────────────────────────────
async function getDownloadUrl(videoUrl) {
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

  console.log(`📡 Requesting cobalt for: ${videoUrl}`);

  const res = await fetch(`${COBALT_URL}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ url: videoUrl }),
  });

  const text = await res.text();
  console.log(`📡 Cobalt raw response: ${text.slice(0, 300)}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('❌ Cobalt response is not JSON:', text.slice(0, 300));
    throw new Error('Cobalt returned invalid JSON');
  }

  if (data.status === 'stream' || data.status === 'redirect' || data.status === 'tunnel') {
    return data.url;
  } else if (data.status === 'picker') {
    return data.picker?.[0]?.url || null;
  } else if (data.url) {
    return data.url;
  }

  console.error('❌ Cobalt unexpected response:', JSON.stringify(data));
  return null;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    const request = proto.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });

    request.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

// ─────────────────────────────────────────
// SHIP HELPERS
// ─────────────────────────────────────────
function getShipPercent(id1, id2) {
  for (const [a, b] of SPECIAL_PAIRS) {
    if ((id1 === a && id2 === b) || (id1 === b && id2 === a)) return 100;
  }
  const seed = [...(id1 + id2)].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (seed % 79) + 20;
}

function getShipMessage(percent) {
  if (percent === 100) return '💍 A match made in heaven. Soulmates.';
  if (percent >= 80) return '💘 Incredibly compatible!';
  if (percent >= 60) return '❤️ Pretty good match!';
  if (percent >= 40) return '💛 Could work with some effort!';
  return '🤝 Just friends... probably.';
}

function getShipName(name1, name2) {
  return name1.slice(0, Math.ceil(name1.length / 2)) + name2.slice(Math.floor(name2.length / 2));
}

// ─────────────────────────────────────────
// CANVAS HELPERS
// ─────────────────────────────────────────
function drawCircularImage(ctx, img, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawGlowRing(ctx, x, y, radius, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHeart(ctx, x, y, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.bezierCurveTo(x, y, x - size, y, x - size, y + size * 0.4);
  ctx.bezierCurveTo(x - size, y + size * 0.8, x, y + size * 1.1, x, y + size * 1.3);
  ctx.bezierCurveTo(x, y + size * 1.1, x + size, y + size * 0.8, x + size, y + size * 0.4);
  ctx.bezierCurveTo(x + size, y, x, y, x, y + size * 0.3);
  ctx.fill();
  ctx.restore();
}

// ─────────────────────────────────────────
// SHIP IMAGE
// ─────────────────────────────────────────
async function generateShipImage(avatarUrl1, avatarUrl2, name1, name2, percent) {
  const W = 800, H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1a0a2e');
  bg.addColorStop(0.5, '#2d1245');
  bg.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 80; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const av1 = await loadImage(avatarUrl1 + '?size=256');
  const av2 = await loadImage(avatarUrl2 + '?size=256');
  const avatarRadius = 100, centerY = H / 2, leftX = 155, rightX = W - 155;
  const color1 = percent === 100 ? '#ff6eb4' : '#a78bfa';
  const color2 = percent === 100 ? '#ff6eb4' : '#f472b6';

  drawGlowRing(ctx, leftX, centerY, avatarRadius, color1);
  drawGlowRing(ctx, rightX, centerY, avatarRadius, color2);
  drawCircularImage(ctx, av1, leftX, centerY, avatarRadius);
  drawCircularImage(ctx, av2, rightX, centerY, avatarRadius);

  const heartSize = 36;
  drawHeart(ctx, W / 2, centerY - heartSize * 0.9, heartSize, percent === 100 ? '#ff3d8f' : '#e879a0');

  ctx.save();
  ctx.font = 'bold 38px Sans'; ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ff6eb4'; ctx.shadowBlur = 16;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${percent}%`, W / 2, centerY + heartSize * 1.2);
  ctx.restore();

  ctx.save(); ctx.font = 'bold 22px Sans'; ctx.fillStyle = '#ffffff'; ctx.shadowColor = color1; ctx.shadowBlur = 10;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(name1, leftX, centerY + avatarRadius + 12); ctx.restore();

  ctx.save(); ctx.font = 'bold 22px Sans'; ctx.fillStyle = '#ffffff'; ctx.shadowColor = color2; ctx.shadowBlur = 10;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(name2, rightX, centerY + avatarRadius + 12); ctx.restore();

  ctx.save(); ctx.font = 'bold 20px Sans'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`✦ Ship name: ${getShipName(name1, name2)} ✦`, W / 2, 14); ctx.restore();

  ctx.save(); ctx.font = '18px Sans'; ctx.fillStyle = 'rgba(255,200,230,0.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(getShipMessage(percent), W / 2, H - 12); ctx.restore();

  ctx.save(); ctx.strokeStyle = percent === 100 ? '#ff6eb4' : '#a78bfa'; ctx.shadowColor = percent === 100 ? '#ff6eb4' : '#a78bfa';
  ctx.shadowBlur = 20; ctx.lineWidth = 2; ctx.strokeRect(2, 2, W - 4, H - 4); ctx.restore();

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────
// JAIL IMAGE
// ─────────────────────────────────────────
async function generateJailImage(avatarUrl, username) {
  const W = 400, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, W, H);

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 6; col++) {
      const offset = row % 2 === 0 ? 0 : 35;
      ctx.fillStyle = row % 2 === 0 ? '#2a2a2a' : '#252525';
      ctx.fillRect(col * 70 + offset - 35, row * 40, 68, 38);
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2;
      ctx.strokeRect(col * 70 + offset - 35, row * 40, 68, 38);
    }
  }

  const avatar = await loadImage(avatarUrl + '?size=256');
  drawCircularImage(ctx, avatar, W / 2, H / 2, 120);
  drawGlowRing(ctx, W / 2, H / 2, 120, '#ff4444');

  const gap = W / 6;
  for (let i = 0; i < 6; i++) {
    const x = i * gap + gap / 2;
    ctx.save(); ctx.fillStyle = '#888888'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillRect(x - 9, 0, 18, H);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x - 9 + 3, 0, 4, H);
    ctx.restore();
  }

  ctx.fillStyle = '#888888'; ctx.fillRect(0, 30, W, 20); ctx.fillRect(0, H - 50, W, 20);

  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, H - 48, W, 48);
  ctx.font = 'bold 22px Sans'; ctx.fillStyle = '#ff4444'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
  ctx.fillText(`🔒 ${username} is in jail`, W / 2, H - 24); ctx.restore();

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────
// HOW GAY IMAGE
// ─────────────────────────────────────────
async function generateGayImage(avatarUrl, username, percent) {
  const W = 500, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#ff6b6b'); bg.addColorStop(0.2, '#ffd93d'); bg.addColorStop(0.4, '#6bcb77');
  bg.addColorStop(0.6, '#4d96ff'); bg.addColorStop(0.8, '#c77dff'); bg.addColorStop(1, '#ff6b6b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);

  const avatar = await loadImage(avatarUrl + '?size=256');
  drawCircularImage(ctx, avatar, 100, H / 2, 90);
  drawGlowRing(ctx, 100, H / 2, 90, '#ff69b4');

  const barX = 220, barY = 80, barW = 240, barH = 36;
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 18); ctx.fill();

  const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  fillGrad.addColorStop(0, '#ff6b6b'); fillGrad.addColorStop(0.5, '#c77dff'); fillGrad.addColorStop(1, '#4d96ff');
  ctx.fillStyle = fillGrad; ctx.beginPath(); ctx.roundRect(barX, barY, (percent / 100) * barW, barH, 18); ctx.fill();

  ctx.save(); ctx.font = 'bold 52px Sans'; ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ff69b4'; ctx.shadowBlur = 20;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`${percent}%`, barX, barY + 50); ctx.restore();

  ctx.save(); ctx.font = 'bold 20px Sans'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`${username} is ${percent}% gay 🏳️‍🌈`, barX, barY - 36); ctx.restore();

  const msg = percent >= 90 ? 'Absolutely fabulous 💅' : percent >= 70 ? 'Very much so 🌈' :
    percent >= 50 ? 'More than you think 👀' : percent >= 30 ? 'A little curious 🤔' : 'Totally straight... sure 😭';
  ctx.save(); ctx.font = '18px Sans'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(msg, barX, H - 20); ctx.restore();

  return canvas.toBuffer('image/png');
}

function getVideoDuration(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    ).toString().trim();
    return parseFloat(output);
  } catch { return 60; }
}

// ─────────────────────────────────────────
// REGISTER COMMANDS
// ─────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName('ship').setDescription('💘 Ship two members!')
      .addUserOption(o => o.setName('member1').setDescription('First member').setRequired(true))
      .addUserOption(o => o.setName('member2').setDescription('Second member').setRequired(true)),
    new SlashCommandBuilder().setName('jail').setDescription('🔒 Put someone in jail!')
      .addUserOption(o => o.setName('member').setDescription('Who to jail').setRequired(true)),
    new SlashCommandBuilder().setName('howgay').setDescription('🏳️‍🌈 How gay is someone?')
      .addUserOption(o => o.setName('member').setDescription('Who to check').setRequired(true)),
    new SlashCommandBuilder().setName('rival').setDescription('⚔️ Set two people as rivals!')
      .addUserOption(o => o.setName('member1').setDescription('First rival').setRequired(true))
      .addUserOption(o => o.setName('member2').setDescription('Second rival').setRequired(true)),
    new SlashCommandBuilder().setName('lore').setDescription('📖 Server lore!')
      .addSubcommand(sub => sub.setName('add').setDescription('Add a lore entry')
        .addStringOption(o => o.setName('text').setDescription('The lore').setRequired(true)))
      .addSubcommand(sub => sub.setName('get').setDescription('Get a random lore entry')),
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands.map(c => c.toJSON()) });
    console.log('✅ All commands registered!');
  } catch (err) { console.error('❌ Failed to register commands:', err); }
});

// ─────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ship') {
    await interaction.deferReply();
    const user1 = interaction.options.getUser('member1');
    const user2 = interaction.options.getUser('member2');
    if (user1.id === user2.id) return interaction.editReply({ content: '❌ You cant ship someone with themselves lol' });
    const m1 = await interaction.guild.members.fetch(user1.id).catch(() => null);
    const m2 = await interaction.guild.members.fetch(user2.id).catch(() => null);
    const percent = getShipPercent(user1.id, user2.id);
    try {
      const buf = await generateShipImage(user1.displayAvatarURL({ extension: 'png' }), user2.displayAvatarURL({ extension: 'png' }), m1?.displayName || user1.username, m2?.displayName || user2.username, percent);
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('💘 Ship Results').setImage('attachment://ship.png').setColor(percent === 100 ? 0xFF69B4 : 0xE91E8C).setFooter({ text: `Requested by ${interaction.member?.displayName || interaction.user.username}` })], files: [new AttachmentBuilder(buf, { name: 'ship.png' })] });
    } catch (err) { console.error('❌ Ship error:', err); await interaction.editReply({ content: '❌ Something went wrong.' }); }
  }

  else if (interaction.commandName === 'jail') {
    await interaction.deferReply();
    const user = interaction.options.getUser('member');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    try {
      const buf = await generateJailImage(user.displayAvatarURL({ extension: 'png' }), member?.displayName || user.username);
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🔒 Arrested!').setImage('attachment://jail.png').setColor(0x888888).setFooter({ text: `Jailed by ${interaction.member?.displayName || interaction.user.username}` })], files: [new AttachmentBuilder(buf, { name: 'jail.png' })] });
    } catch (err) { console.error('❌ Jail error:', err); await interaction.editReply({ content: '❌ Something went wrong.' }); }
  }

  else if (interaction.commandName === 'howgay') {
    await interaction.deferReply();
    const user = interaction.options.getUser('member');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const seed = [...user.id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    try {
      const buf = await generateGayImage(user.displayAvatarURL({ extension: 'png' }), member?.displayName || user.username, seed % 101);
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🏳️‍🌈 Gay Meter').setImage('attachment://gay.png').setColor(0xFF69B4).setFooter({ text: `Requested by ${interaction.member?.displayName || interaction.user.username}` })], files: [new AttachmentBuilder(buf, { name: 'gay.png' })] });
    } catch (err) { console.error('❌ Howgay error:', err); await interaction.editReply({ content: '❌ Something went wrong.' }); }
  }

  else if (interaction.commandName === 'rival') {
    const user1 = interaction.options.getUser('member1');
    const user2 = interaction.options.getUser('member2');
    if (user1.id === user2.id) return interaction.reply({ content: '❌ Someone cant rival themselves lol', ephemeral: true });
    const m1 = await interaction.guild.members.fetch(user1.id).catch(() => null);
    const m2 = await interaction.guild.members.fetch(user2.id).catch(() => null);
    const name1 = m1?.displayName || user1.username;
    const name2 = m2?.displayName || user2.username;
    rivalPairs[[user1.id, user2.id].sort().join('-')] = { name1, name2 };
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚔️ Rivalry Declared!').setDescription(`**${name1}** ⚔️ **${name2}**\n\nA rivalry has been declared!\nMay the best one win. 😤`).setColor(0xFF4444).setThumbnail(user1.displayAvatarURL()).setFooter({ text: `Declared by ${interaction.member?.displayName || interaction.user.username}` })] });
  }

  else if (interaction.commandName === 'lore') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      const text = interaction.options.getString('text');
      const author = interaction.member?.displayName || interaction.user.username;
      loreList.push({ text, author });
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📖 Lore Added!').setDescription(`*"${text}"*`).setColor(0xf0a500).setFooter({ text: `Added by ${author} • Entry #${loreList.length}` })] });
    } else {
      if (!loreList.length) return interaction.reply({ content: '📖 No lore yet! Add some with `/lore add`', ephemeral: true });
      const entry = loreList[Math.floor(Math.random() * loreList.length)];
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📖 Server Lore').setDescription(`*"${entry.text}"*`).setColor(0xf0a500).setFooter({ text: `Added by ${entry.author} • ${loreList.length} entries total` })] });
    }
  }
});

// ─────────────────────────────────────────
// VIDEO HANDLER
// ─────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const instaMatch = message.content.match(INSTA_REGEX);
  const ytMatch = message.content.match(YT_SHORT_REGEX);
  if (!instaMatch && !ytMatch) return;

  const url = (instaMatch || ytMatch)[0];
  const source = instaMatch ? 'Instagram' : 'YouTube Short';
  const embedColor = instaMatch ? 0xE1306C : 0xFF0000;
  const timestamp = Date.now();
  const tempDir = path.join(__dirname, 'temp');
  const rawPath = path.join(tempDir, `${timestamp}_raw.mp4`);
  const compressedPath = path.join(tempDir, `${timestamp}_compressed.mp4`);
  const senderName = message.member?.displayName || message.author.username;
  const senderAvatar = message.author.displayAvatarURL();

  console.log(`📥 [${source}] from ${senderName}: ${url}`);

  let fetchingMsg;
  try { fetchingMsg = await message.channel.send(`⏳ Fetching ${source} video...`); } catch {}
  try { await message.delete(); } catch {}

  try {
    const downloadUrl = await getDownloadUrl(url);
    if (!downloadUrl) {
      try { if (fetchingMsg) await fetchingMsg.delete(); } catch {}
      try { await message.channel.send(`❌ Could not fetch the ${source} video.`); } catch {}
      return;
    }

    console.log(`🔗 Got download URL: ${downloadUrl.slice(0, 80)}...`);
    await downloadFile(downloadUrl, rawPath);

    if (!fs.existsSync(rawPath)) {
      try { if (fetchingMsg) await fetchingMsg.delete(); } catch {}
      try { await message.channel.send('❌ Download failed.'); } catch {}
      return;
    }

    const duration = getVideoDuration(rawPath);
    const bitrate = Math.floor((7 * 8192) / duration);

    await new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(`ffmpeg -i "${rawPath}" -vcodec libx264 -b:v ${bitrate}k -preset ultrafast -threads 1 -acodec aac -b:a 64k -y "${compressedPath}"`, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    try { if (fetchingMsg) await fetchingMsg.delete(); } catch {}
    try { if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath); } catch {}

    const fileSizeMB = fs.statSync(compressedPath).size / (1024 * 1024);
    if (fileSizeMB > 10) {
      try { fs.unlinkSync(compressedPath); } catch {}
      try { await message.channel.send(`❌ Video too large (${fileSizeMB.toFixed(1)}MB). Try a shorter one!`); } catch {}
      return;
    }

    await message.channel.send({ embeds: [new EmbedBuilder().setAuthor({ name: senderName, iconURL: senderAvatar }).setColor(embedColor)], files: [compressedPath] });
    console.log(`✅ [${source}] Sent for ${senderName}`);

  } catch (err) {
    console.error(`❌ Video error:`, err.message);
    try { if (fetchingMsg) await fetchingMsg.delete(); } catch {}
    try { await message.channel.send(`❌ Could not process the ${source} video.`); } catch {}
  } finally {
    try { if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath); } catch {}
    try { if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath); } catch {}
  }
});

client.on('error', (err) => console.error('❌ Bot error:', err.message));
process.on('unhandledRejection', (err) => console.error('❌ Unhandled rejection:', err.message));

client.login(process.env.DISCORD_TOKEN);