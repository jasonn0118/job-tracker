import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function checkSlackChannels() {
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!botToken) {
    console.error('❌ SLACK_BOT_TOKEN not found in .env');
    return;
  }

  console.log('🔍 Checking Slack channels accessible to bot...\n');

  try {
    // List all channels the bot is in
    const response = await axios.get('https://slack.com/api/conversations.list', {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
      params: {
        types: 'public_channel,private_channel',
        limit: 100,
      },
    });

    if (!response.data.ok) {
      console.error(`❌ Slack API error: ${response.data.error}`);
      return;
    }

    const channels = response.data.channels;
    console.log(`Found ${channels.length} channels:\n`);

    // List all channels
    channels.forEach((channel: any) => {
      const isMember = channel.is_member ? '✅ (BOT IS MEMBER)' : '❌ (not a member)';
      console.log(`${isMember} ${channel.name}`);
      console.log(`   Channel ID: ${channel.id}`);
      console.log('');
    });

    // Check the configured channel ID
    const configuredChannelId = process.env.SLACK_CHANNEL_ID;
    console.log(`\n📋 Your configured SLACK_CHANNEL_ID: ${configuredChannelId}`);

    const configuredChannel = channels.find((c: any) => c.id === configuredChannelId);
    if (configuredChannel) {
      if (configuredChannel.is_member) {
        console.log(`✅ Bot IS a member of: #${configuredChannel.name}`);
      } else {
        console.log(`❌ Bot is NOT a member of: #${configuredChannel.name}`);
        console.log(`\n💡 To fix: Go to #${configuredChannel.name} and type: /invite @YourBotName`);
      }
    } else {
      console.log('❌ Channel ID not found in bot\'s accessible channels');
      console.log('\n💡 Make sure:');
      console.log('   1. The channel ID is correct');
      console.log('   2. The bot has been invited to the channel');
      console.log('   3. You\'re using a public channel (or bot has access to private channel)');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkSlackChannels();
