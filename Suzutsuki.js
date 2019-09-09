const { Client } = require('eris');
const { createPool } = require('mariadb');
const crypto = require('crypto');
const server = require('fastify')();
const config = require('./config.js');

const randomStatus = ['Did you call, Admiral?', 'I\'ll protect you forever.', 'We\'ll be together forever.'];
const exitEvents = ['beforeExit', 'SIGINT', 'SIGINT'];
const patreonRoles = ['Contributors', 'Benefactors', 'Specials', 'Heroes'];

class PatreonHandler {
    static async check(request, reply) {
        try {
            if (Object.keys(request.query).length === 0 || !request.query.id) {
                reply.code(400);
                return 'No Query String Found';
            }
            if (!request.headers.authorization || request.headers.authorization !== config.restpw) {
                reply.code(401);
                return 'Unauthorized';
            }
            const query = await this.pool.query(
                'SELECT status FROM patreons WHERE id = ?',
                [request.query.id]
            );
            if (!query.length) return false;
            return query[0].status;
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
            console.log(json);
            /* Not implemented as patreon docs is unclear in this part
            console.log(JSON.stringify(data, null, 4));
            const rewards = json.included.slice(2, json.included.length);
            console.log(json.data.attributes)
            console.log(rewards.find(x => x.attributes.amount_cents === json.data.attributes.amount_cents))
            await this.pool.query(
                'INSERT INTO patreons (id, status) VALUES (?, ?) ON DUPLICATE KEY UPDATE status = VALUE(status)',
                [id, number]
            )*/
        } catch (error) {
            console.error(error);
            reply.code(500);
            return error.toString();
        }
    }
}

class DonatorHandler {
    static async check(request, reply) {
        try {
            if (Object.keys(request.query).length === 0 || !request.query.id) {
                reply.code(400);
                return 'No Query String Found';
            }
            if (!request.headers.authorization || request.headers.authorization !== config.restpw) {
                reply.code(401);
                return 'Unauthorized';
            }
            const guild = this.guilds.get(config.guildid);
            if (!guild) {
                reply.code(500);
                return 'FleetGirls Guild not found.';
            }

            const member = await this.getRESTGuildMember(guild.id, request.query.id)
                .catch((error) => error.message === 'DiscordRESTError [10013]: Unknown User' ? null : error);
            return member && Array.isArray(member.roles) ? member.roles.includes(config.stonksdonatorid) : false;
        } catch (error) {
            console.error(error);
            reply.code(500);
            return error.toString();
        }
    }
}

class FasifyCallback {
    static handle(error, address) {
        error ? console.error(error) : console.log(`Rest server is listening at ${address}`);
    }
}

class SuzutsukiEvents {
    static ready() {
        console.log(`${this.user.username} is now online !`);
        this.editStatus({ name: 'Suzutsuki, heading out !' });
        let counter = 0;
        this.playingInterval = setInterval(() => {
            this.editStatus({ name: randomStatus[counter] });
            if (counter >= randomStatus.length - 1) counter = 0;
            else counter++;
        }, 120000);
        this._readyFired = true;
    }

    static shardReady() {
        if (!this._readyFired) return;
        this.editStatus({ name: 'Suzutsuki, re-identified to the gateway !' });
    }

    static error(error) {
        console.error(error);
    }

    static shardDisconnect(error, id) {
        if (!error) return;
        error.shardID = id;
        SuzutsukiEvents.error(error);
    }

    static shardResume(id) {
        console.log(`Shard ${id} resumed it's session`);
    }

    static guildMemberUpdate(guild, member, oldMember) {
        if (guild.id !== config.guildid) return;
        if (member.roles.length === oldMember.roles.length) return;

        let role;
        let action;
        if (oldMember.roles.length > member.roles.length) {
            role = oldMember.roles.find((role) => !member.roles.includes(role));
            action = 'removed';
        } else {
            role = member.roles.find((role) => !oldMember.roles.includes(role));
            action = 'added';
        }

        if (!role || !action) return;

        const roleObject = guild.roles.get(role);
        if (!roleObject || !patreonRoles.includes(roleObject.name)) return;

        if (action === 'removed') {
            this.pool.query(
                'DELETE FROM patreons WHERE id = ?', 
                [member.id]
            ).catch(console.error);
        } else {
            this.pool.query(
                'INSERT INTO patreons (id, status) VALUES (?, ?) ON DUPLICATE KEY UPDATE status = ?',
                [member.id, roleObject.name, roleObject.name]
            ).then(() => {
                const channel = guild.channels.get(config.annoucementchannelid);
                channel.createMessage(`<a:too_hype:480054627820371977>** ${member.nick || member.username}** became a Patreon! Hooray! Thanks for the support ~`)
                    .catch(console.error);
            }).catch(console.error);
        }
    }
}

class Suzutsuki extends Client {
    constructor(token, options) {
        super(token, options);

        this.pool = createPool({ 
            host: config.dbhost, 
            port: config.dbport,
            user: config.dbuser, 
            password: config.dbpw, 
            database: config.dbname,
            connectionLimit: 5 
        });

        this._readyFired = false;

        for (const event of exitEvents) process.once(event, this._safetyExit.bind(this));

        this._init();
    }

    _init() {
        const PatreonCheck = PatreonHandler.check.bind(this);
        const PatreonTrigger = PatreonHandler.trigger.bind(this);
        const DonatorCheck = DonatorHandler.check.bind(this);

        server.addContentTypeParser('application/json', { parseAs: 'string' }, 
            (request, body, callback) => callback(null, body)
        );
        server.get('/checkPatreonStatus', PatreonCheck);
        server.post('/trigger', PatreonTrigger);
        server.get('/checkDonatorStatus', DonatorCheck);

        this.once('ready', SuzutsukiEvents.ready);

        this.on('error', SuzutsukiEvents.error);
        this.on('shardDisconnect', SuzutsukiEvents.shardDisconnect);
        this.on('shardResume', SuzutsukiEvents.shardResume);
        this.on('shardReady', SuzutsukiEvents.shardReady);
        this.on('guildMemberUpdate', SuzutsukiEvents.guildMemberUpdate);

        this._createDB();
    }

    _createDB() {
        this.pool.query('CREATE TABLE IF NOT EXISTS patreons(id VARCHAR(64) PRIMARY KEY, status text)')
            .catch(console.error);
    }

    _safetyExit() {
        clearInterval(this.playingInterval);
        this.disconnect({ reconnect: false });
        this.pool.end()
            .catch(console.error)
            .finally(process.exit);
    }
}

const Destroyer = new Suzutsuki(config.token, { 
    disableEvents: {
        TYPING_START: true,
        PRESENCE_UPDATE: true,
        VOICE_STATE_UPDATE: true,
        MESSAGE_CREATE: true,
        MESSAGE_DELETE: true,
        MESSAGE_DELETE_BULK: true,
        MESSAGE_UPDATE: true
    },
    restMode: true, 
    messageLimit: 0, 
    getAllUsers: true 
});

Destroyer.connect()
    .then(() => server.listen(config.restport, FasifyCallback.handle))
    .catch(console.error);