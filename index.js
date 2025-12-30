const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'url_shortener';

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    dialect: 'mysql',
    logging: false
});

// Models
const Domain = sequelize.define('Domain', {
    hostname: { type: DataTypes.STRING, allowNull: false, unique: true }
});

const Path = sequelize.define('Path', {
    short_path: { type: DataTypes.STRING, allowNull: false },
    original_url: { type: DataTypes.TEXT, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
    indexes: [{ unique: true, fields: ['DomainId', 'short_path'] }]
});

const AccessLog = sequelize.define('AccessLog', {
    ip_address: DataTypes.STRING,
    user_agent: DataTypes.TEXT,
    country: DataTypes.STRING,
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

Domain.hasMany(Path);
Path.belongsTo(Domain);
Path.hasMany(AccessLog);
AccessLog.belongsTo(Path);

// Admin: Add Domain
app.post('/admin/domains', async (req, res) => {
    try {
        const domain = await Domain.create({ hostname: req.body.hostname });
        res.status(201).json(domain);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Add Path
app.post('/admin/paths', async (req, res) => {
    try {
        const path = await Path.create(req.body);
        res.status(201).json(path);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Get Access History
app.get('/admin/history/:path_id', async (req, res) => {
    try {
        const logs = await AccessLog.findAll({
            where: { PathId: req.params.path_id },
            order: [['timestamp', 'DESC']]
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Internal: Sync Paths
app.get('/internal/sync/paths', async (req, res) => {
    try {
        const paths = await Path.findAll({
            where: { is_active: true },
            include: [Domain]
        });
        const result = paths.map(p => ({
            short_path: p.short_path,
            original_url: p.original_url,
            hostname: p.Domain.hostname
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Internal: Sync Logs
app.post('/internal/sync/logs', async (req, res) => {
    const logs = req.body;
    if (!Array.isArray(logs)) return res.status(400).json({ error: 'Invalid format' });

    const t = await sequelize.transaction();
    try {
        for (const log of logs) {
            const domain = await Domain.findOne({ where: { hostname: log.hostname } }, { transaction: t });
            if (domain) {
                const path = await Path.findOne({ 
                    where: { DomainId: domain.id, short_path: log.short_path } 
                }, { transaction: t });
                
                if (path) {
                    await AccessLog.create({
                        PathId: path.id,
                        ip_address: log.ip_address,
                        user_agent: log.user_agent,
                        country: log.country,
                        timestamp: log.timestamp
                    }, { transaction: t });
                }
            }
        }
        await t.commit();
        res.json({ success: true });
    } catch (err) {
        await t.rollback();
        res.status(500).json({ error: err.message });
    }
});

async function start() {
    console.log('Checking dependencies...');
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection: SUCCESS');
        
        // Auto-create structure
        await sequelize.sync({ alter: true });
        console.log('✅ Database schema: SYNCED');

        const PORT = process.env.CORE_PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Core Service running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Database connection: FAILED');
        console.error(err.message);
        process.exit(1);
    }
}

start();
