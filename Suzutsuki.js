const { Client, MessageEmbed }= require('discord.js');
const { inspect } = require('util');
const crypto = require('crypto');
const server = require('fastify')();

const config = require('./config.js');
const patreonTierRoles = Object.keys(config.patreontiers);

const randomStatus = ['Did you call, Admiral?', 'I\'ll protect you forever ❤', 'We\'ll be together forever ❤'];
const exitEvents = ['beforeExit', 'SIGINT', 'SIGINT'];

class PatreonHandler {
    static async check(request, reply) {
        try {
            if (!Object.keys(request.query).length|| !request.query.id) {
                reply.code(400);
                return 'No Query String Found';
            }
            if (!request.headers.authorization || request.headers.authorization !== config.restpw) {
                reply.code(401);
                return 'Unauthorized';
            }

            const guild = this.guilds.cache.get(config.guildid);
            if (!guild) {
                reply.code(500);
                return 'FleetGirls Guild not found.';
            }

            const member = guild.members.cache.get(request.query.id);

            if (!member) return false;

            if (!member.roles.cache.has(config.patreonsrole)) {
                if (!member.roles.cache.has(config.boostersrole)) return false;
                return 'NitroBoosters';
            }

            const patreonTierRoles = Object.keys(config.patreontiers);
            for (const id of patreonTierRoles) {
                if (member.roles.cache.has(id)) return config.patreontiers[id];
            }

            reply.code(404);
            return `User ${member.displayName} (${member.id}) has Patreon Role but doesn't have a tier`;
        } catch (error) {
            console.error(error);
            reply.code(500);
            return error.toString();
        }
    }

    static async trigger(request, reply) {
        try {
            const hash = crypto
                .createHmac('md5', config.patreonSecret)
                .update(request.body)
                .digest('hex');
            if (request.headers['x-patreon-signature'] !== hash) {
                reply.code(403);
                return 'Signature Mismatch';
            }
            const json = JSON.parse(request.body);
            console.log('[Patreon Debug]: ', inspect(json, { depth: null }));
            return 'Ok';
        } catch (error) {
            console.error(error);
            reply.code(500);
            return error.toString();
        }
    }

    static async getPatreons(request, reply) {
        try {
            if (!request.headers.authorization || request.headers.authorization !== config.restpw) {
                reply.code(401);
                return 'Unauthorized';
            }
            const guild = this.guilds.cache.get(config.guildid);
            if (!guild) {
                reply.code(500);
                return 'FleetGirls Guild not found.';
            }

            const patreonMembers = guild.members.cache.filter(member => member.roles.cache.has(config.patreonsrole));
            const Heroes = patreonMembers.filter(member => member.roles.cache.has(patreonTierRoles[0]));
            const Specials = patreonMembers.filter(member => member.roles.cache.has(patreonTierRoles[1]) && (!Heroes.size || Heroes.some(mem => mem.id !== member.id)));
            const Benefactors = patreonMembers.filter(member => member.roles.cache.has(patreonTierRoles[2]) && (!Specials.size|| Specials.some(mem => mem.id !== member.id)));
            const Contributors = patreonMembers.filter(member => member.roles.cache.has(patreonTierRoles[3]) && (!Benefactors.size || Benefactors.some(mem => mem.id !== member.id)));

            return PatreonHandler._parseData({ Heroes, Specials, Benefactors, Contributors });
        } catch (error) {
            console.error(error);
            reply.code(500);
            return error.toString();
        }
    }

    static _parseData({ Heroes, Specials, Benefactors, Contributors }) {
        return {
            Heroes: Heroes.map(member => PatreonHandler._parseMember(member.user)),
            Specials: Specials.map(member => PatreonHandler._parseMember(member.user)),
            Benefactors: Benefactors.map(member => PatreonHandler._parseMember(member.user)),
            Contributors: Contributors.map(member => PatreonHandler._parseMember(member.user))
        };
    }

    static _parseMember({ id, username, discriminator }) {
        return { id, username, discriminator };
    }
}

class DonatorHandler {
    static async check(request, reply) {
        try {
            if (!Object.keys(request.query).length || !request.query.id) {
                reply.code(400);
                return 'No Query String Found';
            }
            if (!request.headers.authorization || request.headers.authorization !== config.restpw) {
                reply.code(401);
                return 'Unauthorized';
            }
            const guild = this.guilds.cache.get(config.guildid);
            if (!guild) {
                reply.code(500);
                return 'FleetGirls Guild not found.';
            }

            const member = guild.members.cache.get(request.query.id);

            return member && member.roles.cache.has(config.stonksdonatorid);
        } catch (error) {
            console.error(error);
            reply.code(500);
            return error.toString();
        }
    }
}


class SuzutsukiEvents {
    ready() {
        console.log(`[${this.user.username}]: Now online!`);
        this.user.setPresence({ activity: { name: 'Hello Admiral ❤' } })
            .catch(console.error);
        let counter = 0;
        this.playingInterval = setInterval(() => {
            this.user.setPresence({ activity: { name: randomStatus[counter] } })
                .catch(console.error);
            if (counter >= randomStatus.length - 1) counter = 0;
            else counter++;
        }, 120000);
    }

    shardError(error, id) {
        if (!error) return;
        console.error(`[Shard ${id}]: `, error);
    }

    ShardReconnecting(id) {
        console.log(`[Shard ${id}]: `, 'Reconnecting');
    }

    shardReady(id) {
        console.log(`[Shard ${id}]: `, 'Ready');
    }

    shardResume(id, rep) {
        console.log(`[Shard ${id}]: `, `Resumed => ${rep} events`);
    }

    guildMemberUpdate(oldMember, newMember) {
        if (newMember.guild.id !== config.guildid || oldMember.roles.cache.size === newMember.roles.cache.size || oldMember.roles.cache.size > newMember.roles.cache.size) return;
        const role = newMember.roles.cache.find((role) => !oldMember.roles.cache.has(role.id));
        if (!role || !patreonTierRoles.includes(role.id)) return;
        const channel = newMember.guild.channels.cache.get(config.annoucementchannelid);
        if (!channel) return;
        channel.send(`<a:too_hype:480054627820371977> ${newMember.toString()} became a Patreon! Thanks for the support \\❤`)
            .catch(console.error);
    }

    message(msg) {
        if (!msg.guild || msg.author.bot) return;
        const args = msg.content.split(' ');
        if (!args.length) return;
        if (args[0] !== `<@!${this.user.id}>`) return;
        args.shift();
        const command = args.shift().toLowerCase();
        let response;
        if (command === 'ping') {
            response = `Admiral, the current ping is \`${msg.guild.shard.ping}ms\``;
        }
        if (command === 'stats' ) {
            const { rss, heapUsed } = process.memoryUsage();
            response = new MessageEmbed()
                .setColor('RANDOM')
                .setAuthor('Current Status')
                .setThumbnail(this.user.displayAvatarURL())
                .setDescription('```ml\n' +
                    `Guilds Stored  :: ${this.guilds.cache.size.toLocaleString()}\n` +
                    `Users Seen     :: ${this.users.cache.size.toLocaleString()}\n` +
                    `Memory Used    :: ${this.parseMemory(rss)}\n` +
                    `Heap Used      :: ${this.parseMemory(heapUsed)}\n` +
                    '```')
                .setTimestamp()
                .setFooter(this.user.username);
        }
        if (!response) return;
        msg.channel.send(response)
            .catch(console.error);
    }
}

class Suzutsuki extends Client {
    constructor(options) {
        super(options);
        this.events = new SuzutsukiEvents();

        for (const event of exitEvents) process.once(event, this._safetyExit.bind(this));

        this._init();
    }

    _init() {
        server.addContentTypeParser('application/json', { parseAs: 'string' },
            (request, body, callback) => callback(null, body)
        );
        server.get('/',
            function (req, rep) {
                rep.send('Hello World');
            }
        );
        server.get('/checkPatreonStatus', PatreonHandler.check.bind(this));
        server.post('/trigger', PatreonHandler.trigger.bind(this));
        server.get('/currentPatreons', PatreonHandler.getPatreons.bind(this));
        server.get('/checkDonatorStatus', DonatorHandler.check.bind(this));

        this.once('ready', this.events.ready);
        this.on('error', console.error);
        this.on('shardReady', this.events.shardReady);
        this.on('shardError', this.events.shardError);
        this.on('shardReconnecting', this.events.ShardReconnecting);
        this.on('shardResume', this.events.shardResume);
        this.on('guildMemberUpdate', this.events.guildMemberUpdate);
        this.on('message', this.events.message);
    }

    parseMemory(bytes) {
        return bytes < 1024000000 ? `${Math.round(bytes / 1024 / 1024)} MB` : `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    }

    _safetyExit() {
        clearInterval(this.playingInterval);
        this.destroy();
        setTimeout(process.exit, 2500);
    }
}

const Destroyer = new Suzutsuki({
    messageCacheMaxSize	: 1,
    messageCacheLifetime: 60,
    messageSweepInterval: 120,
    fetchAllMembers: true,
    ws: {
        intents: ['GUILDS', 'GUILD_MEMBERS', 'GUILD_BANS', 'GUILD_MESSAGES']
    }
});

Destroyer.login(config.token)
    .then(() =>
        server.listen(config.restport,
            (error, address) => error ? console.error(error) : console.log(`[REST Server]: Listening at ${address}`)
        )
    )
    .catch(console.error);
