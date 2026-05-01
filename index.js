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
const { exec, execSync } = require('child_process');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const GUILD_ID = '1492930248415645777';
const INSTA_REGEX = /https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+/;
const YT_SHORT_REGEX = /https?:\/\/(www\.)?(youtube\.com\/shorts|youtu\.be)\/[A-Za-z0-9_-]+/;

const SPECIAL_PAIRS = [
  ['1474239913959620723', '1014190745558712370'],
  ['1273126903053684787', '793004680233484298'],
];

// Make sure temp folder exists
if (!fs.existsSync(path.join(__dirname, 'temp'))) {
  fs.mkdirSync(path.join(__dirname, 'temp'));
}

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
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    const sr = Math.random() * 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  const av1 = await loadImage(avatarUrl1 + '?size=256');
  const av2 = await loadImage(avatarUrl2 + '?size=256');

  const avatarRadius = 100;
  const centerY = H / 2;
  const leftX = 155;
  const rightX = W - 155;

  const color1 = percent === 100 ? '#ff6eb4' : '#a78bfa';
  const color2 = percent === 100 ? '#ff6eb4' : '#f472b6';
  drawGlowRing(ctx, leftX, centerY, avatarRadius, color1);
  drawGlowRing(ctx, rightX, centerY, avatarRadius, color2);
  drawCircularImage(ctx, av1, leftX, centerY, avatarRadius);
  drawCircularImage(ctx, av2, rightX, centerY, avatarRadius);

  const heartSize = 36;
  drawHeart(ctx, W / 2, centerY - heartSize * 0.9, heartSize, percent === 100 ? '#ff3d8f' : '#e879a0');

  ctx.save();
  ctx.font = 'bold 38px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ff6eb4';
  ctx.shadowBlur = 16;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${percent}%`, W / 2, centerY + heartSize * 1.2);
  ctx.restore();

  ctx.font = 'bold 22px Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = color1;
  ctx.shadowBlur = 10;
  ctx.fillText(name1, leftX, centerY + avatarRadius + 12);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = color2;
  ctx.shadowBlur = 10;
  ctx.fillText(name2, rightX, centerY + avatarRadius + 12);
  ctx.restore();

  const shipName = getShipName(name1, name2);
  ctx.save();
  ctx.font = 'bold 20px Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`✦ Ship name: ${shipName} ✦`, W / 2, 14);
  ctx.restore();

  ctx.save();
  ctx.font = '18px Sans';
  ctx.fillStyle = 'rgba(255,200,230,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(getShipMessage(percent), W / 2, H - 12);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = percent === 100 ? '#ff6eb4' : '#a78bfa';
  ctx.shadowColor = percent === 100 ? '#ff6eb4' : '#a78bfa';
  ctx.shadowBlur = 20;
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function getVideoDuration(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    ).toString().trim();
    return parseFloat(output);
  } catch {
    return 60;
  }
}

client.once('clientReady', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName('ship')
    .setDescription('💘 Ship two members and find out their compatibility!')
    .addUserOption(option =>
      option.setName('member1').setDescription('First member').setRequired(true)
    )
    .addUserOption(option =>
      option.setName('member2').setDescription('Second member').setRequired(true)
    );

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('📡 Registering /ship to guild...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: [command.toJSON()] }
    );
    console.log('✅ /ship registered!');
  } catch (err) {
    console.error('❌ Failed to register slash command:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'ship') return;

  await interaction.deferReply();

  const user1 = interaction.options.getUser('member1');
  const user2 = interaction.options.getUser('member2');

  if (user1.id === user2.id) {
    return interaction.editReply({ content: '❌ You cant ship someone with themselves lol' });
  }

  const member1 = await interaction.guild.members.fetch(user1.id).catch(() => null);
  const member2 = await interaction.guild.members.fetch(user2.id).catch(() => null);

  const name1 = member1?.displayName || user1.username;
  const name2 = member2?.displayName || user2.username;

  const percent = getShipPercent(user1.id, user2.id);

  try {
    const imageBuffer = await generateShipImage(
      user1.displayAvatarURL({ extension: 'png' }),
      user2.displayAvatarURL({ extension: 'png' }),
      name1,
      name2,
      percent
    );

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'ship.png' });

    const embed = new EmbedBuilder()
      .setTitle('💘 Ship Results')
      .setImage('attachment://ship.png')
      .setColor(percent === 100 ? 0xFF69B4 : 0xE91E8C)
      .setFooter({ text: `Requested by ${interaction.member?.displayName || interaction.user.username}` });

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  } catch (err) {
    console.error('❌ Ship image error:', err);
    await interaction.editReply({ content: '❌ Something went wrong generating the ship image.' });
  }
});

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
  const rawPattern = path.join(tempDir, `${timestamp}_raw`);
  const compressedPath = path.join(tempDir, `${timestamp}_compressed.mp4`);

  const senderName = message.member?.displayName || message.author.username;
  const senderAvatar = message.author.displayAvatarURL();

  console.log(`📥 [${source}] Detected link from ${senderName}: ${url}`);

  let fetchingMsg;
  try {
    fetchingMsg = await message.channel.send(`⏳ Fetching ${source} video...`);
  } catch (err) {
    console.log('⚠️ Could not send fetching message');
  }

  try { await message.delete(); } catch {}

  const dlCmd = instaMatch
    ? `yt-dlp -o "${rawPattern}.%(ext)s" "${url}"`
    : `yt-dlp --js-runtimes deno -o "${rawPattern}.%(ext)s" "${url}"`;

  exec(dlCmd, async (error) => {
    if (error) {
      try { if (fetchingMsg) await fetchingMsg.delete(); } catch {}
      console.error(error);
      try { await message.channel.send(`❌ Could not fetch the ${source} video.`); } catch {}
      return;
    }

    const files = fs.readdirSync(tempDir).filter(f => f.startsWith(`${timestamp}_raw`));
    if (!files.length) {
      try { if (fetchingMsg) await fetchingMsg.delete(); } catch {}
      try { await message.channel.send('❌ Download failed — file not found after download.'); } catch {}
      return;
    }

    const rawPath = path.join(tempDir, files[0]);
    console.log(`📂 [${source}] Downloaded as: ${files[0]}`);

    const duration = getVideoDuration(rawPath);
    const targetSizeMB = 7;
    const bitrate = Math.floor((targetSizeMB * 8192) / duration);
    console.log(`📹 [${source}] Duration: ${duration}s | Bitrate: ${bitrate}k`);

    // -threads 1 and -preset ultrafast to save memory on Railway
    exec(`ffmpeg -i "${rawPath}" -vcodec libx264 -b:v ${bitrate}k -preset ultrafast -threads 1 -acodec aac -b:a 64k -y "${compressedPath}"`, async (err) => {
      try { if (fetchingMsg) await fetchingMsg.delete(); } catch {}
      try { if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath); } catch {}

      if (err) {
        console.error(err);
        try { await message.channel.send(`❌ Could not compress the ${source} video.`); } catch {}
        return;
      }

      const stats = fs.statSync(compressedPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log(`📦 [${source}] Compressed size: ${fileSizeMB.toFixed(2)}MB`);

      if (fileSizeMB > 10) {
        try { fs.unlinkSync(compressedPath); } catch {}
        try {
          await message.channel.send(`❌ Video too large (${fileSizeMB.toFixed(1)}MB) even after compression. Try a shorter ${source === 'Instagram' ? 'reel' : 'short'}!`);
        } catch {}
        return;
      }

      try {
        const embed = new EmbedBuilder()
          .setAuthor({ name: senderName, iconURL: senderAvatar })
          .setColor(embedColor);
        await message.channel.send({ embeds: [embed], files: [compressedPath] });
        console.log(`✅ [${source}] Video sent successfully for ${senderName}`);
      } catch (sendErr) {
        console.error(`❌ Could not send ${source} video:`, sendErr.message);
        try { await message.channel.send('❌ Could not send the video. File may be too large!'); } catch {}
      }

      try { if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath); } catch {}
    });
  });
});

client.on('error', (err) => console.error('❌ Bot error:', err.message));
process.on('unhandledRejection', (err) => console.error('❌ Unhandled rejection:', err.message));

client.login(process.env.DISCORD_TOKEN);