const { 
    Client, 
    GatewayIntentBits, 
    ChannelType, 
    PermissionsBitField, 
    REST, 
    Routes, 
    SlashCommandBuilder,
    Events,
    MessageFlags
} = require('discord.js');
const config = require('./config.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('update')
        .setDescription('Manually update statistics channels')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.TOKEN);

async function registerCommands() {
    try {
        await rest.put(
            Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
            { body: commands }
        );
        console.log('Slash Commands registered successfully.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

/**
 * Main logic to update the statistics channels.
 * Uses guild.memberCount for basic stats to avoid opcode 8 rate limits.
 */
async function updateStats(guild) {
    if (!guild) return;
    try {
        // Usamos guild.memberCount directamente para evitar peticiones pesadas (opcode 8)
        const total = guild.memberCount;
        
        // Solo hacemos fetch si es necesario para discriminar bots/miembros
        const allMembers = await guild.members.fetch().catch(() => guild.members.cache);
        const members = allMembers.filter(m => !m.user.bot).size;
        const bots = allMembers.filter(m => m.user.bot).size;

        const categoryName = '📊 STATISTICS';

        let category = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && c.name === categoryName
        );

        if (!category) {
            category = await guild.channels.create({
                name: categoryName,
                type: ChannelType.GuildCategory,
                position: 0 
            });
        } else if (category.position !== 0) {
            await category.setPosition(0).catch(() => {});
        }

        const stats = [
            { name: `👥 Total: ${total}`, search: 'Total' },
            { name: `👤 Members: ${members}`, search: 'Members' },
            { name: `🤖 Bots: ${bots}`, search: 'Bots' }
        ];

        for (const data of stats) {
            // Búsqueda simplificada para evitar errores de undefined
            let channel = guild.channels.cache.find(c => 
                c.type === ChannelType.GuildVoice && 
                c.parentId === category.id &&
                c.name.includes(data.search)
            );

            if (!channel) {
                await guild.channels.create({
                    name: data.name,
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    permissionOverwrites: [
                        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.Connect] }
                    ],
                });
            } else if (channel.name !== data.name) {
                await channel.setName(data.name).catch(err => console.error("Rename rate limit:", err.message));
            }
        }
    } catch (e) { 
        console.error('Update error:', e); 
    }
}

client.once(Events.ClientReady, async (c) => {
    console.log(`Bot logged in as ${c.user.tag}`);
    await registerCommands();
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (guild) updateStats(guild);
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'update') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        await updateStats(interaction.guild);
        await interaction.editReply('Statistics updated.');
    }
});

client.on(Events.GuildMemberAdd, (m) => {
    if (m.guild.id === config.GUILD_ID) {
        setTimeout(() => updateStats(m.guild), 15000); 
    }
});

client.on(Events.GuildMemberRemove, (m) => {
    if (m.guild.id === config.GUILD_ID) {
        setTimeout(() => updateStats(m.guild), 15000);
    }
});

client.login(config.TOKEN);